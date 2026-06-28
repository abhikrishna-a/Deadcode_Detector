import django; django.setup()
from accounts.models import JuniorSubmission

# Check user 1 submissions - latest first
subs = JuniorSubmission.objects.filter(user_id=1).order_by('-id')[:20]
print('Latest 20 submissions for user 1:')
for s in subs:
    print('  id=%-4s filename=%-20s relative_path=%-30s status=%-15s scan_folder=%-10s rag_doc_id=%-8s created=%s' % (
        s.id, s.filename, s.relative_path, s.status, s.scan_folder, str(s.rag_document_id or '')[:8], s.created_at.strftime('%m-%d %H:%M')
    ))

print()
print('Total user 1 submissions:', JuniorSubmission.objects.filter(user_id=1).count())
print('Pending_review:', JuniorSubmission.objects.filter(user_id=1, status='pending_review').count())
print('Done:', JuniorSubmission.objects.filter(user_id=1, status='done').count())

# Check rag_documents for user 1
from django.db import connection
with connection.cursor() as c:
    c.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = 1")
    print('RAG docs for user 1:', c.fetchone()[0])
