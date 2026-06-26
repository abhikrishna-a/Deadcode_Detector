import psycopg2

conn = psycopg2.connect(
    host='postgres',
    port=5432,
    dbname='deadcode_detector',
    user='postgres',
    password='postgres',
)

with conn.cursor() as cur:
    try:
        cur.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = %s AND filename NOT LIKE '%/%'", [2])
        print('Test 1 (both):', cur.fetchone())
    except Exception as e:
        print('Test 1 failed:', type(e).__name__, e)

    try:
        cur.execute("SELECT COUNT(*) FROM rag_documents WHERE filename NOT LIKE '%/%'")
        print('Test 2 (no params):', cur.fetchone())
    except Exception as e:
        print('Test 2 failed:', type(e).__name__, e)

    try:
        cur.execute("SELECT COUNT(*) FROM rag_documents WHERE user_id = %s AND filename NOT LIKE %s", [2, '%/%'])
        print('Test 3 (param LIKE):', cur.fetchone())
    except Exception as e:
        print('Test 3 failed:', type(e).__name__, e)

conn.close()
