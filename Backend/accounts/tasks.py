import json
import logging
import os

import requests
from asgiref.sync import async_to_sync
from celery import shared_task
from celery.exceptions import MaxRetriesExceededError
from celery.signals import task_failure
from channels.layers import get_channel_layer
from django.conf import settings
from requests import HTTPError
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)


def _group_name(batch_id: str) -> str:
    return f'analysis_{batch_id}'


def _send_ws(batch_id: str, message: dict) -> None:
    try:
        async_to_sync(get_channel_layer().group_send)(_group_name(batch_id), message)
    except Exception:
        logger.warning('Failed to send WS message to batch %s', batch_id, exc_info=True)


def _rag_url() -> str:
    return getattr(settings, 'RAG_ANALYZE_URL', 'http://localhost:8004/rag/analyze')


def _batch_redis():
    """Return a Redis client using the same URL as the Channels layer."""
    import redis as _r
    return _r.from_url(
        settings.CHANNEL_LAYERS['default']['CONFIG']['hosts'][0],
        socket_timeout=5,
        socket_connect_timeout=5,
    )


def _track_file_complete(batch_id: str, filename: str) -> None:
    """
    Record a file as completed via Redis SET (idempotent across retries).
    Triggers notify_batch_complete when all files in the batch are done.
    """
    r = _batch_redis()
    key = f'batch_done_{batch_id}'
    r.sadd(key, filename)
    r.expire(key, 3600)
    done = r.scard(key)
    total = int(r.get(f'batch_total_{batch_id}') or 0)
    if total > 0 and done >= total:
        flag = f'batch_done_flag_{batch_id}'
        claimed = r.setnx(flag, 1)
        r.expire(flag, 300)
        if claimed:
            notify_batch_complete.delay(batch_id, total)


def _store_result(batch_id: str, filename: str, data: dict) -> None:
    """Store a file's analysis result in Redis (key-value, works with Redis 3.0+)."""
    r = _batch_redis()
    key = f'batch_result:{batch_id}'
    r.hset(key, filename, json.dumps(data))
    r.expire(key, 3600)


@shared_task(bind=True, max_retries=1, default_retry_delay=10)
def batch_analyze_folder(self, files_data: list, batch_id: str, scan_folder: str = '', token: str = '', scan_type: str = 'folder'):
    """
    Celery task: sends ALL folder files to RAG /batch-analyze at once.
    Pure in-memory cross-referencing across files — no per-file DB queries, no LLM.
    Stores each result in Redis for the frontend to poll.
    """
    try:
        rag_url = _rag_url().replace('/rag/analyze', '/batch-analyze')
        payload = {
            'files': [{'name': n, 'content': c} for n, c in files_data],
            'scan_folder': scan_folder,
            'scan_type': scan_type,
        }
        headers = {'Authorization': f'Bearer {token}'} if token else {}

        resp = requests.post(rag_url, json=payload, headers=headers, timeout=300)
        resp.raise_for_status()
        result = resp.json()

        results_list = result.get('results', [])
        content_map = {fn: content for fn, content in files_data}
        processed = set()

        for fr in results_list:
            fn = fr['filename']
            processed.add(fn)
            is_error = bool(fr.get('error'))
            _store_result(batch_id, fn, {
                'status': 'error' if is_error else 'completed',
                'document_id': fr.get('document_id', ''),
                'analysis': fr.get('analysis', {}),
                'scan_folder': scan_folder,
                'scan_type': scan_type,
                'source_content': content_map.get(fn, ''),
            })
            _track_file_complete(batch_id, fn)

            if is_error:
                _send_ws(batch_id, {
                    'type': 'analysis_file_error',
                    'filename': fn,
                    'batch_id': batch_id,
                    'error': fr.get('error', 'Unknown error'),
                })
            else:
                _send_ws(batch_id, {
                    'type': 'analysis_file_complete',
                    'filename': fn,
                    'document_id': fr.get('document_id', ''),
                    'batch_id': batch_id,
                    'analysis': fr.get('analysis', {}),
                    'source_content': content_map.get(fn, ''),
                    'scan_folder': scan_folder,
                    'scan_type': scan_type,
                })

            done = int(_batch_redis().scard(f'batch_done_{batch_id}'))
            _send_ws(batch_id, {
                'type': 'analysis_progress',
                'done': done,
                'total': len(files_data),
                'current_file': fn,
            })

        # Track ALL submitted files (using list, not dict keys — handles any dupes)
        for fn, _ in files_data:
            if fn not in processed:
                _store_result(batch_id, fn, {
                    'status': 'error',
                    'error': 'Skipped by analysis service (unsupported or empty)',
                    'scan_folder': scan_folder,
                    'scan_type': scan_type,
                })
                _track_file_complete(batch_id, fn)
                _send_ws(batch_id, {
                    'type': 'analysis_file_error',
                    'filename': fn,
                    'batch_id': batch_id,
                    'error': 'Skipped by analysis service (unsupported or empty)',
                })

        logger.info(
            'Batch %s: %d/%d files analyzed (RAG), %d skipped',
            batch_id, len(processed), len(files_data), len(files_data) - len(processed),
        )
        return {'batch_id': batch_id, 'total': len(results_list)}

    except Exception as exc:
        logger.exception('Batch analysis failed for %s', batch_id)
        raise self.retry(exc=exc)


@task_failure.connect(sender=batch_analyze_folder)
def handle_batch_failure(sender=None, task_id=None, exception=None, args=None, **kwargs):
    """If the batch task exhausts retries, mark all files as errored so the batch can complete."""
    if args and len(args) >= 3:
        files_data, batch_id = args[0], args[2]
        for fn, _ in files_data:
            try:
                _store_result(batch_id, fn, {
                    'status': 'error',
                    'error': f'Batch analysis failed: {exception}',
                })
            except Exception:
                pass
            try:
                _track_file_complete(batch_id, fn)
            except Exception:
                pass
            try:
                _send_ws(batch_id, {
                    'type': 'analysis_file_error',
                    'filename': fn,
                    'batch_id': batch_id,
                    'error': f'Batch analysis failed: {exception}',
                })
            except Exception:
                pass


@shared_task
def notify_batch_complete(batch_id: str, total: int):
    """Send batch_complete via WebSocket channel layer."""
    _send_ws(batch_id, {'type': 'analysis_batch_complete'})
    logger.info('Batch %s complete: %d files (WS notified)', batch_id, total)


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


def _notify_user(user_id: int, message: dict) -> None:
    try:
        async_to_sync(get_channel_layer().group_send)(f'notifications_user_{user_id}', message)
    except Exception:
        logger.warning('Failed to notify user %d', user_id, exc_info=True)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def analyze_junior_submission(self, submission_id: int):
    from .models import JuniorSubmission
    try:
        submission = JuniorSubmission.objects.select_related('user').get(id=submission_id)
    except JuniorSubmission.DoesNotExist:
        logger.error('JuniorSubmission %d not found', submission_id)
        return
    user = submission.user
    rag_url = getattr(settings, 'RAG_ANALYZE_URL', 'http://localhost:8004/rag/analyze')
    try:
        refresh = RefreshToken.for_user(user)
        refresh['mfa_verified_for_session'] = True
        access_token = str(refresh.access_token)
        headers = {'Authorization': f'Bearer {access_token}'}
        resp = requests.post(
            rag_url,
            files={'file': (submission.filename, submission.file_content, 'text/plain')},
            data={
                'scan_folder': submission.scan_folder or '',
                'scan_type': 'single',
            },
            headers=headers,
            timeout=120,
        )
        if not resp.ok:
            logger.error('RAG returned %d for submission %d (%s): %s',
                         resp.status_code, submission_id, submission.filename, resp.text[:500])
        resp.raise_for_status()
        data = resp.json()
        submission.result = data.get('analysis', data)
        submission.status = 'done'
        submission.save(update_fields=['result', 'status'])
        _notify_user(user.id, {
            'type': 'junior.analysis_complete',
            'submission_id': submission.id,
            'file_name': submission.filename,
            'result': submission.result,
        })
        logger.info('Junior analysis complete for submission %d', submission_id)
    except HTTPError as exc:
        is_unsupported = 'Unsupported file type' in exc.response.text if exc.response is not None else False
        if exc.response is not None and exc.response.status_code == 400 and is_unsupported:
            submission.status = 'failed'
            submission.save(update_fields=['status'])
            logger.warning('Permanently failing submission %d (%s) — unsupported file type',
                           submission_id, submission.filename)
            _notify_user(user.id, {
                'type': 'junior.analysis_failed',
                'submission_id': submission.id,
                'file_name': submission.filename,
            })
            return
        submission.status = 'failed'
        submission.save(update_fields=['status'])
        logger.exception('Junior analysis failed for submission %d', submission_id)
        _notify_user(user.id, {
            'type': 'junior.analysis_failed',
            'submission_id': submission.id,
            'file_name': submission.filename,
        })
        try:
            raise self.retry(exc=exc)
        except MaxRetriesExceededError:
            logger.error('Max retries exceeded for submission %d', submission_id)
    except Exception as exc:
        submission.status = 'failed'
        submission.save(update_fields=['status'])
        logger.exception('Junior analysis failed for submission %d', submission_id)
        _notify_user(user.id, {
            'type': 'junior.analysis_failed',
            'submission_id': submission.id,
            'file_name': submission.filename,
        })
        try:
            raise self.retry(exc=exc)
        except MaxRetriesExceededError:
            logger.error('Max retries exceeded for submission %d', submission_id)


@shared_task
def batch_analyze_junior_submissions(submission_ids: list):
    for sid in submission_ids:
        analyze_junior_submission.delay(sid)

