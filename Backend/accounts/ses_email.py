import logging

import boto3
from django.conf import settings

logger = logging.getLogger(__name__)


def send_ses_email(subject, html_body, recipient):
    region = getattr(settings, "AWS_SES_REGION", "us-east-1")
    client = boto3.client("ses", region_name=region)
    try:
        client.send_email(
            Source=settings.DEFAULT_FROM_EMAIL,
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Html": {"Data": html_body}},
            },
        )
        logger.info("SES email sent to %s", recipient)
        return True
    except Exception as e:
        logger.error("SES email to %s failed: %s", recipient, e)
        return False
