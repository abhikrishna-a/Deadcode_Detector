import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.dev")

app = Celery("ghostcode")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()

app.conf.beat_schedule = {
    "cleanup-temp-git-dirs": {
        "task": "accounts.tasks.cleanup_temp_git_dirs",
        "schedule": 21600,
    },
    "process-scheduled-analyses": {
        "task": "accounts.tasks.process_scheduled_analyses",
        "schedule": 60.0,
    },
    "cleanup-stale-scheduled": {
        "task": "accounts.tasks.cleanup_stale_scheduled",
        "schedule": 3600.0,
    },
}
