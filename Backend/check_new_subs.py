import django; django.setup()
from accounts.models import JuniorSubmission

# Check user 1 submissions sorted by id descending
subs = JuniorSubmission.objects.filter(user_id=1).order_by('-id')[:10]
print('Latest 10 submissions for user 1:')
for s in subs:
    print('  id=%s, filename=%s, relative_path=%s, status=%s, scan_folder=%s, created=%s' % (
        s.id, s.filename, s.relative_path, s.status, s.scan_folder, s.created_at
    ))
