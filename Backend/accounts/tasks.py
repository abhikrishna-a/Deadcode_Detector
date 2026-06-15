import json
import logging
import os

import requests
from celery import shared_task
from celery.signals import task_failure
from django.conf import settings

logger = logging.getLogger(__name__)


def _group_name(batch_id: str) -> str:
    return f'analysis_{batch_id}'


def _rag_url() -> str:
    return getattr(settings, 'RAG_ANALYZE_URL', 'http://localhost:8004/rag/analyze')


def _batch_redis():
    """Return a Redis client using the same URL as the Channels layer."""
    import redis as _r
    return _r.from_url(settings.CHANNEL_LAYERS['default']['CONFIG']['hosts'][0])


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


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def analyze_single_file(self, filename: str, content: str, batch_id: str, scan_folder: str = '', token: str = '', scan_type: str = 'single'):
    """
    Celery task: sends file to RAG FastAPI for analysis, then stores the result
    in Redis for the frontend to poll (avoids channels_redis BZPOPMIN issue with Redis 3.0).
    """
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

        _store_result(batch_id, filename, {
            'status': 'completed',
            'document_id': result.get('document_id', ''),
            'analysis': result.get('analysis', {}),
            'scan_folder': scan_folder,
            'source_content': content,
        })

        _track_file_complete(batch_id, filename)
        return {'filename': filename, 'status': 'completed'}

    except Exception as exc:
        logger.exception('Analysis failed for %s', filename)

        try:
            _store_result(batch_id, filename, {
                'status': 'error',
                'error': str(exc),
                'scan_folder': scan_folder,
            })
        except Exception:
            pass

        raise self.retry(exc=exc)


@task_failure.connect(sender=analyze_single_file)
def handle_analysis_failure(sender=None, task_id=None, exception=None, args=None, **kwargs):
    """Track files that permanently fail (retries exhausted) so the batch can complete."""
    if args and len(args) >= 3:
        filename, _, batch_id = args[0], args[1], args[2]
        try:
            _store_result(batch_id, filename, {
                'status': 'error',
                'error': f'Analysis failed after retries: {exception}',
            })
        except Exception:
            pass
        try:
            _track_file_complete(batch_id, filename)
        except Exception:
            pass


@shared_task
def notify_batch_complete(batch_id: str, total: int):
    """No-op: batch completion detected via frontend polling (HTTP), not WebSocket."""
    logger.info('Batch %s complete: %d files (polling will detect)', batch_id, total)


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

