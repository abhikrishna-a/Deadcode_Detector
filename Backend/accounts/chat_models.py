from django.db import models
from django.conf import settings


class IssueThread(models.Model):
    analysis_id = models.CharField(max_length=64, db_index=True)
    filename = models.CharField(max_length=500)
    issue_id = models.CharField(max_length=20)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='threads'
    )
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['analysis_id', 'issue_id']
        ordering = ['-created_at']


class ThreadMessage(models.Model):
    thread = models.ForeignKey(
        IssueThread, on_delete=models.CASCADE, related_name='messages'
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    is_ai_hint = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
