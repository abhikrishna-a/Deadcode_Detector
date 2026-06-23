import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings.dev'
django.setup()
from django.conf import settings
print('DB:', settings.DATABASES['default']['NAME'])
from django.db import connection
with connection.cursor() as c:
    c.execute("SELECT column_name FROM information_schema.columns WHERE table_name='accounts_juniorsubmission'")
    cols = [r[0] for r in c.fetchall()]
    print('Columns:', cols)
    has_result = 'result' in cols
    print('Has result column:', has_result)
    if not has_result:
        print('Migration 0013 applied but result column missing!')
        from django.core.management import call_command
        print('Re-applying migration 0013...')
        call_command('migrate', 'accounts', '0013', verbosity=2)
        print('Done')
    else:
        print('Column exists - OK')
