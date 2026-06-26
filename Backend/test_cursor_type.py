import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    print('type(c):', type(c))
    print('type(c.cursor):', type(c.cursor))
    print('has c.cursor.cursor:', hasattr(c.cursor, 'cursor'))
    if hasattr(c.cursor, 'cursor'):
        print('type(c.cursor.cursor):', type(c.cursor.cursor))
    
    # Test with Django cursor
    try:
        c.execute("SELECT COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%'")
        print('Django cursor execute OK:', c.fetchone())
    except Exception as e:
        print('Django cursor execute failed:', e)
