import django; django.setup()
from django.contrib.auth import get_user_model
from django.db import connection

User = get_user_model()
print('Users:')
for u in User.objects.all():
    print('  id=%s, username=%s, email=%s' % (u.id, u.username, u.email))

print()
with connection.cursor() as c:
    c.execute("SELECT user_id, COUNT(*) FROM rag_documents GROUP BY user_id ORDER BY user_id")
    for r in c.fetchall():
        uid, cnt = r
        print('user_id=%s: %s docs' % (uid, cnt))
