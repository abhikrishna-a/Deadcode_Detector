import django; django.setup()
from django.db import connection
with connection.cursor() as c:
    c.execute("SELECT user_id, scan_folder, COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%' GROUP BY user_id, scan_folder")
    for r in c.fetchall():
        uid, folder, cnt = r
        print('user=%s, folder=%r: %s flat' % (uid, folder, cnt))
    c.execute("SELECT user_id, scan_folder, COUNT(*) FROM rag_documents WHERE filename LIKE '%/%' GROUP BY user_id, scan_folder")
    for r in c.fetchall():
        uid, folder, cnt = r
        print('user=%s, folder=%r: %s path' % (uid, folder, cnt))
    c.execute("SELECT COUNT(*) FROM rag_documents")
    print('total documents:', c.fetchone()[0])
