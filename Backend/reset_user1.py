import django; django.setup()
from accounts.models import JuniorSubmission

# Clear rag_document_id for user 1 so next analyze saves it
count = JuniorSubmission.objects.filter(user_id=1, status='done').exclude(rag_document_id=None).update(rag_document_id=None)
print('Reset rag_document_id for %d user 1 submissions' % count)

# Also check old submissions with rag_document_id set
total = JuniorSubmission.objects.filter(user_id=1, status='done').count()
set_count = JuniorSubmission.objects.filter(user_id=1, status='done').exclude(rag_document_id=None).count()
print('User 1 done submissions: %d total, %d with rag_doc_id set' % (total, set_count))
