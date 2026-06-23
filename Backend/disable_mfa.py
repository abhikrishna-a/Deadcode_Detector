import django; django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='appu')
print('MFA before:', u.is_mfa_enabled)
u.is_mfa_enabled = False
u.save()
print('MFA after:', u.is_mfa_enabled)
u2 = User.objects.get(username='abhikrishna')
print('Senior MFA:', u2.is_mfa_enabled)
