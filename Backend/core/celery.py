import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.dev')

app = Celery('ghostcode')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()

from accounts import scheduler  # noqa: F401 — register beat tasks

app.conf.beat_schedule = {
    'cleanup-temp-git-dirs': {
        'task': 'accounts.tasks.cleanup_temp_git_dirs',
        'schedule': 21600,
    },
    'nightly-scan-all-users': {
        'task': 'accounts.scheduled_scans.nightly_scan_all_users',
        'schedule': crontab(hour=2, minute=0),
    },
    'process-scheduled-analyses': {
        'task': 'accounts.scheduler.process_scheduled_analyses',
        'schedule': 60.0,
    },
    'cleanup-stale-scheduled': {
        'task': 'accounts.scheduler.cleanup_stale_scheduled',
        'schedule': 3600.0,
    },
}
