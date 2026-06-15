import json
import logging
import os
import uuid

import requests
from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.conf import settings

logger = logging.getLogger(__name__)


def _group_name(batch_id: str) -> str:
    return f'analysis_{batch_id}'


def _rag_url() -> str:
    return getattr(settings, 'RAG_ANALYZE_URL', 'http://localhost:8004/rag/analyze')


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def analyze_single_file(self, filename: str, content: str, batch_id: str, scan_folder: str = '', token: str = '', scan_type: str = 'single'):
    """
    Celery task: sends file to RAG FastAPI for analysis, then pushes result
    via Django Channels WebSocket.
    """
    channel_layer = get_channel_layer()
    group = _group_name(batch_id)

    try:
        files = {'file': (filename, content.encode('utf-8'), 'text/x-python')}
        data = {'scan_type': scan_type}
        if scan_folder:
            data['scan_folder'] = scan_folder

        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        resp = requests.post(_rag_url(), files=files, data=data, headers=headers, timeout=120)
        resp.raise_for_status()
        result = resp.json()

        async_to_sync(channel_layer.group_send)(group, {
            'type': 'analysis_file_complete',
            'filename': filename,
            'document_id': result.get('document_id', ''),
            'analysis': result.get('analysis', {}),
            'source_content': content,
        })

        return {'filename': filename, 'status': 'completed'}

    except Exception as exc:
        logger.exception('Analysis failed for %s', filename)

        async_to_sync(channel_layer.group_send)(group, {
            'type': 'analysis_file_error',
            'filename': filename,
            'error': str(exc),
        })

        raise self.retry(exc=exc)


@shared_task
def notify_batch_complete(batch_id: str, total: int):
    """Sends batch_complete signal via Channels after all files are processed."""
    channel_layer = get_channel_layer()
    group = _group_name(batch_id)

    async_to_sync(channel_layer.group_send)(group, {
        'type': 'analysis_batch_complete',
    })
    logger.info('Batch %s complete: %d files', batch_id, total)


@shared_task
def cleanup_temp_git_dirs():
    """Celery Beat task: removes stale git temp directories from cache."""
    from django.core.cache import cache

    keys_found = 0
    dirs_removed = 0

    try:
        # redis backend supports scanning by pattern
        keys = cache.keys('git_session_*')
    except NotImplementedError:
        keys = []
        logger.warning('Cache backend does not support keys() — skipping git cleanup')

    for key in keys:
        cached = cache.get(key)
        if not cached:
            continue
        try:
            data = json.loads(cached) if isinstance(cached, str) else cached
            temp_dir = data.get('temp_dir')
            if temp_dir and os.path.isdir(temp_dir):
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                dirs_removed += 1
                logger.info('Removed stale git temp dir: %s', temp_dir)
            cache.delete(key)
            keys_found += 1
        except (json.JSONDecodeError, OSError) as e:
            logger.warning('Failed to cleanup git session %s: %s', key, e)
            cache.delete(key)

    logger.info('Git cleanup done: %d keys scanned, %d dirs removed', keys_found, dirs_removed)

