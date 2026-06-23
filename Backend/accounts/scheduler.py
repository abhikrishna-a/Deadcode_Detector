import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def process_scheduled_analyses():
    from .models import JuniorSubmission
    from .tasks import analyze_junior_submission

    now = timezone.now()
    submissions = JuniorSubmission.objects.filter(
        scheduled_at__lte=now, status='pending_review'
    )
    count = 0
    for sub in submissions:
        sub.status = 'analysing'
        sub.scheduled_at = None
        sub.save(update_fields=['status', 'scheduled_at'])
        analyze_junior_submission.delay(sub.id)
        count += 1
        logger.info('Scheduled analysis triggered for submission %d', sub.id)

    if count:
        logger.info('process_scheduled_analyses: triggered %d submissions', count)
    return count


@shared_task
def cleanup_stale_scheduled():
    from .models import JuniorSubmission

    stale = JuniorSubmission.objects.filter(
        scheduled_at__lte=timezone.now() - timezone.timedelta(days=7),
        status='pending_review',
    )
    count = stale.count()
    if count:
        stale.update(status='failed')
        logger.info('cleanup_stale_scheduled: marked %d stale submissions as failed', count)
    return count
