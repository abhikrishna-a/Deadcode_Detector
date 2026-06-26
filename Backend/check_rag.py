import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    c.execute("SELECT user_id, scan_folder, COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%' GROUP BY user_id, scan_folder")
    for r in c.fetchall():
        uid, folder, cnt = r
        print('user=%s, folder=%r: %s flat docs' % (uid, folder, cnt))
        c.execute("SELECT filename, file_hash FROM rag_documents WHERE user_id = %s AND scan_folder = %s AND filename NOT LIKE '%/%' LIMIT 3", [uid, folder])
        for doc in c.fetchall():
            print('   filename=%r, hash=%s' % (doc[0], doc[1][:16] if doc[1] else None))
