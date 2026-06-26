import django; django.setup()
from accounts.models import JuniorSubmission

# Find submissions for user 1 with proper relative_path
subs = JuniorSubmission.objects.filter(
    user_id=1,
    status='done',
).exclude(relative_path='')
print('User 1 submissions with relative_path (%d):' % subs.count())
for s in subs[:5]:
    print('  id=%s, filename=%s, relative_path=%s, scan_folder=%s' % (s.id, s.filename, s.relative_path, s.scan_folder))
