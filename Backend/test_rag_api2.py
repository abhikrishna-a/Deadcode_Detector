import os, django; django.setup()
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
from jose import jwt
import requests

User = get_user_model()
user = User.objects.get(id=2)

DJANGO_SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or settings.SECRET_KEY
print('Using SECRET_KEY:', DJANGO_SECRET_KEY[:20] + '...')

# Create raw JWT with mfa_verified_for_session
import time
payload = {
    'user_id': user.id,
    'role': 'admin',
    'mfa_verified_for_session': True,
    'token_type': 'access',
    'exp': int(time.time()) + 3600,
    'iat': int(time.time()),
}
raw_token = jwt.encode(payload, DJANGO_SECRET_KEY, algorithm='HS256')

headers = {'Authorization': 'Bearer ' + raw_token}
resp = requests.get('http://rag:8004/history', headers=headers, params={'limit': 100})
print('Status:', resp.status_code)
data = resp.json()
print('Response keys:', list(data.keys()))
items = data.get('items', [])
print('Total items:', data.get('total', len(items)))
print()
print('Filenames (first 15):')
for item in items[:15]:
    fn = item.get('filename', '?')
    print('  ' + fn)

# Count paths vs flat
with_path = sum(1 for i in items if '/' in (i.get('filename') or ''))
flat_count = sum(1 for i in items if '/' not in (i.get('filename') or ''))
print()
print('With path:', with_path)
print('Flat:', flat_count)
