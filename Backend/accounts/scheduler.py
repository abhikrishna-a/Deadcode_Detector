import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def process_scheduled_analyses():
    try:
        from .models import JuniorSubmission, GlobalAnalysisSchedule
        from .tasks import analyze_junior_submission

        now = timezone.now()

        # Check global schedule first
        config = GlobalAnalysisSchedule.objects.first()
        if config and config.scheduled_at and not config.triggered:
            sched = config.scheduled_at
            if timezone.is_naive(sched):
                sched = timezone.make_aware(sched)
            if sched <= now:
                triggered = 0
                for sub in JuniorSubmission.objects.filter(status='pending_review'):
                    sub.status = 'analysing'
                    sub.scheduled_at = None
                    sub.save(update_fields=['status', 'scheduled_at'])
                    analyze_junior_submission.delay(sub.id)
                    triggered += 1
                    logger.info('Global schedule triggered analysis for submission %d', sub.id)
                config.triggered = True
                config.save(update_fields=['triggered'])
                logger.info('Global schedule: triggered %d submissions', triggered)
                return triggered

        # Per-submission scheduled_at check
        count = 0
        for sub in JuniorSubmission.objects.filter(
            scheduled_at__lte=now, status='pending_review'
        ):
            sub.status = 'analysing'
            sub.scheduled_at = None
            sub.save(update_fields=['status', 'scheduled_at'])
            analyze_junior_submission.delay(sub.id)
            count += 1
            logger.info('Scheduled analysis triggered for submission %d', sub.id)

        if count:
            logger.info('process_scheduled_analyses: triggered %d submissions', count)
        return count
    except Exception:
        logger.exception('process_scheduled_analyses failed')
        return 0


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
