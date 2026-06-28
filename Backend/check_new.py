import django; django.setup()
from accounts.models import JuniorSubmission
from django.db import connection

# Check all submissions sorted by id descending
subs = JuniorSubmission.objects.all().order_by('-id')[:15]
print('Latest 15 submissions across all users:')
for s in subs:
    print('  id=%-5s user=%-2s filename=%-25s status=%-15s scan_folder=%-12s rel_path=%-35s created=%s' % (
        s.id, s.user_id, s.filename[:25], s.status, s.scan_folder or '', s.relative_path[:35] if s.relative_path else '', s.created_at.strftime('%m-%d %H:%M')
    ))

print()
print('Submissions by user:')
for u_id in [1, 2, 4]:
    total = JuniorSubmission.objects.filter(user_id=u_id).count()
    done = JuniorSubmission.objects.filter(user_id=u_id, status='done').count()
    pending = JuniorSubmission.objects.filter(user_id=u_id, status='pending_review').count()
    analysing = JuniorSubmission.objects.filter(user_id=u_id, status='analysing').count()
    print('  user=%s: total=%s, done=%s, pending=%s, analysing=%s' % (u_id, total, done, pending, analysing))

# Check rag_documents
with connection.cursor() as c:
    c.execute("SELECT user_id, COUNT(*) FROM rag_documents GROUP BY user_id ORDER BY user_id")
    print()
    print('RAG documents by user:')
    for r in c.fetchall():
        print('  user=%s: %s docs' % (r[0], r[1]))
