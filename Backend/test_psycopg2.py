import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    real_cursor = c.cursor
    try:
        real_cursor.execute("SELECT COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%'")
        print('Direct psycopg2 execute OK:', real_cursor.fetchone())
    except Exception as e:
        print('Direct psycopg2 failed:', e)
