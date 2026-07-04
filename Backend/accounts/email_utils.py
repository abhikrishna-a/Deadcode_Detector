import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_email_async(subject, message, recipient):
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=not settings.DEBUG,
        )
    except Exception as e:
        logger.error(f"Email to {recipient} failed: {e}")
        if settings.DEBUG:
            raise
