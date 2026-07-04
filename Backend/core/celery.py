import os

import django
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.dev")

django.setup()

# Force-load ContentType into sys.modules before any model imports to work
# around a Python 3.14 import-caching edge case with Celery task runners.
from django.contrib.contenttypes.models import ContentType  # noqa: E402, F401

app = Celery("ghostcode")

from accounts import scheduler  # noqa: E402, F401 — register beat tasks

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()

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
