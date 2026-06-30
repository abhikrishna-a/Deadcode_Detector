from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
User = get_user_model()
u = User.objects.get(username='abhikrishna')
t = AccessToken.for_user(u)
t['mfa_verified_for_session'] = True
print(t)
