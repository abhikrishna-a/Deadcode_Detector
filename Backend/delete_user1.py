import django; django.setup()
from django.db import connection

with connection.cursor() as c:
    # Count
    c.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = 1")
    before = c.fetchone()[0]
    print('User 1 rag_documents before:', before)
    
    # Delete
    c.execute("DELETE FROM rag_documents WHERE user_id = 1")
    print('Deleted:', c.rowcount)
    
    # Verify
    c.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = 1")
    after = c.fetchone()[0]
    print('User 1 rag_documents after:', after)
