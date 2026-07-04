import logging
import os

from celery import Celery
from celery.signals import worker_ready

logger = logging.getLogger(__name__)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.dev")

app = Celery("ghostcode")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()


@worker_ready.connect
def import_scheduler_tasks(sender=None, **kwargs):
    try:
        from accounts import scheduler  # noqa: F401
        logger.info("Scheduler tasks registered")
    except Exception:
        logger.exception("Failed to register scheduler tasks")


app.conf.beat_schedule = {
    "cleanup-temp-git-dirs": {
        "task": "accounts.tasks.cleanup_temp_git_dirs",
        "schedule": 21600,
    },
    "process-scheduled-analyses": {
        "task": "accounts.scheduler.process_scheduled_analyses",
        "schedule": 60.0,
    },
    "cleanup-stale-scheduled": {
        "task": "accounts.scheduler.cleanup_stale_scheduled",
        "schedule": 3600.0,
    },
}
