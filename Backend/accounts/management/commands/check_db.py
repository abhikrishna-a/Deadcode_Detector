from django.db import connection

with connection.cursor() as c:
    c.execute("SELECT current_database()")
    print(f"Connected to: {c.fetchone()[0]}")
    try:
        c.execute("SELECT id, filename FROM rag_documents WHERE scan_folder = 'core' AND filename NOT LIKE '%/%' LIMIT 5")
        for row in c.fetchall():
            print(f"  id={row[0]} filename={row[1]}")
    except Exception as e:
        print(f"Error: {e}")
