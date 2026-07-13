import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def send_slack_alert(message: str) -> bool:
    webhook_url = settings.SLACK_WEBHOOK_URL
    if not webhook_url:
        logger.debug("SLACK_WEBHOOK_URL not set — skipping alert")
        return False
    try:
        resp = requests.post(webhook_url, json={"text": message}, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        logger.error("Slack alert failed: %s", e)
        return False
