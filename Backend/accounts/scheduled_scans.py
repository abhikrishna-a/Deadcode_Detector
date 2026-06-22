import logging
from urllib.parse import quote
from uuid import uuid4

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from celery import shared_task
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.tasks import batch_analyze_folder

logger = logging.getLogger(__name__)
RAG_BASE = settings.RAG_ANALYZE_URL.rsplit('/rag/', 1)[0]


def _notify_user_nightly_done(user_id):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'notifications_user_{user_id}',
            {'type': 'nightly_report_ready'},
        )
    except Exception as e:
        logger.warning('Failed to notify user %s about nightly report: %s', user_id, e)


def _make_user_token(user):
    """Short-lived JWT (5 min) with mfa_verified_for_session=true for RAG auth."""
    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    refresh['mfa_verified_for_session'] = True
    return str(refresh.access_token)


@shared_task
def nightly_scan_all_users():
    """
    Celery Beat task (2am UTC).
    Steps:
      1. For every active user, call RAG /history to find their scan folders
      2. For each folder, get files + source from RAG /analyses/by-folder/
      3. Call batch_analyze_folder.delay() — reuses existing pipeline
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    stats = {'users_processed': 0, 'folders_scanned': 0, 'files_submitted': 0, 'errors': 0}

    for user in User.objects.filter(is_active=True):
        try:
            token = _make_user_token(user)
            headers = {'Authorization': f'Bearer {token}'}

            # Step 1: Get user's history to find all their scan folders
            resp = requests.get(
                f'{RAG_BASE}/rag/history?limit=500',
                headers=headers, timeout=15,
            )
            if not resp.ok:
                logger.warning(
                    'Nightly scan: RAG history failed for user %d (HTTP %d)',
                    user.id, resp.status_code,
                )
                stats['errors'] += 1
                continue

            items = resp.json().get('items', [])
            folders = {}
            for item in items:
                sf = item.get('scan_folder', '')
                st = item.get('scan_type', '')
                if sf and st in ('folder', 'repo'):
                    folders[sf] = st

            if not folders:
                continue

            # Step 2: For each folder, get files and submit batch
            for scan_folder, scan_type in folders.items():
                try:
                    folder_resp = requests.get(
                        f'{RAG_BASE}/rag/analyses/by-folder/{quote(scan_folder)}',
                        headers=headers, timeout=30,
                    )
                    if not folder_resp.ok:
                        continue

                    docs = folder_resp.json().get('items', [])
                    files_data = [
                        (d['filename'], d.get('_source_content', ''))
                        for d in docs if d.get('_source_content')
                    ]

                    if not files_data:
                        continue

                    batch_id = str(uuid4())
                    batch_analyze_folder.delay(
                        files_data, batch_id, scan_folder, token, scan_type,
                    )
                    stats['folders_scanned'] += 1
                    stats['files_submitted'] += len(files_data)

                except Exception as e:
                    logger.error(
                        'Nightly scan: folder %s failed for user %d: %s',
                        scan_folder, user.id, e,
                    )
                    stats['errors'] += 1
                    continue

            stats['users_processed'] += 1
            if folders:
                _notify_user_nightly_done(user.id)

        except Exception as e:
            logger.error('Nightly scan: user %d failed: %s', user.id, e)
            stats['errors'] += 1
            continue

    logger.info('Nightly scan complete: %s', stats)
    return stats
