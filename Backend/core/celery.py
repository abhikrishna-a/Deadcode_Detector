import os

import django
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.dev")

app = Celery("ghostcode")

app.config_from_object("django.conf:settings", namespace="CELERY")

django.setup()

app.autodiscover_tasks()

from accounts import scheduler  # noqa: E402, F401

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
    "send-weekly-digest": {
        "task": "accounts.tasks.send_weekly_digest",
        "schedule": crontab(day_of_week="sunday", hour=18, minute=0),
    },
}
