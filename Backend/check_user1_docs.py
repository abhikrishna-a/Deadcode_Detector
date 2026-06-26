import django; django.setup()
from django.db import connection
from collections import Counter

with connection.cursor() as c:
    c.execute("SELECT filename, file_hash FROM rag_documents WHERE user_id = 1 AND scan_folder = 'core'")
    rows = c.fetchall()
    print('Total documents:', len(rows))
    
    # Group by filename (basename)
    by_name = Counter(r[0] for r in rows)
    print('Unique filenames:', len(by_name))
    for name, cnt in sorted(by_name.items(), key=lambda x: -x[1])[:15]:
        print('  %s: %d' % (name, cnt))
    
    # Check hashes
    unique_hashes = set(r[1] for r in rows)
    print()
    print('Unique file hashes:', len(unique_hashes))
    
    # Show file_hashes for empty files
    c.execute("SELECT filename FROM rag_documents WHERE user_id = 1 AND scan_folder = 'core'")
    all_files = [r[0] for r in c.fetchall()]
    c.execute("SELECT filename FROM accounts_juniorsubmission WHERE user_id = 1 AND scan_folder = 'core' AND status='done'")
    sub_files = [r[0] for r in c.fetchall()]
    print()
    print('In rag_documents only:', set(all_files) - set(sub_files))
    print('In submissions only:', set(sub_files) - set(all_files))
