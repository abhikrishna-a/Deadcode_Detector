import django; django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
for u in User.objects.all():
    print('id=%s, username=%s, role=%s, email=%s' % (u.id, u.username, u.role, u.email))
