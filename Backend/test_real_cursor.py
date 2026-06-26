import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    real = c.cursor
    
    # Test on real psycopg2 cursor with both SQL '%/%' and params
    try:
        real.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = %s AND filename NOT LIKE '%/%'", [2])
        print('Real cursor test 1:', real.fetchone())
    except Exception as e:
        print('Real cursor test 1 failed:', type(e).__name__, e)
    
    # Test with no params
    try:
        real.execute("SELECT COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%'")
        print('Real cursor test 2:', real.fetchone())
    except Exception as e:
        print('Real cursor test 2 failed:', type(e).__name__, e)
