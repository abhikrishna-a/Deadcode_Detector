import django; django.setup()
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
import requests, json, httpx

User = get_user_model()
user = User.objects.get(id=2)
token = str(RefreshToken.for_user(user).access_token)

print('Got token:', token[:20] + '...')

headers = {'Authorization': 'Bearer ' + token}
resp = requests.get('http://rag:8004/history', headers=headers, params={'limit': 100})
data = resp.json()
print('Status:', resp.status_code)
items = data.get('items', [])
print('Total items:', data.get('total', len(items)))
print()
print('Filenames (first 15):')
for item in items[:15]:
    fn = item.get('filename', '?')
    print('  ' + fn)
print('...')

# Check how many have paths vs flat
with_path = sum(1 for i in items if '/' in (i.get('filename') or ''))
flat = sum(1 for i in items if '/' not in (i.get('filename') or ''))
print()
print('With path:', with_path)
print('Flat:', flat)
