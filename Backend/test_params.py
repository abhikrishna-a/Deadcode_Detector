import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    # Test 1: SQL with '%/%' literal AND params
    try:
        c.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = %s AND filename NOT LIKE '%/%'", [2])
        print('Test 1 OK:', c.fetchone())
    except Exception as e:
        print('Test 1 failed:', e)
    
    # Test 2: SQL with parameterized LIKE
    try:
        c.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = %s AND filename NOT LIKE %s", [2, '%/%'])
        print('Test 2 OK:', c.fetchone())
    except Exception as e:
        print('Test 2 failed:', e)
