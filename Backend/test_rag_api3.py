import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
user = User.objects.get(id=2)

# Create access token with mfa_verified_for_session
token = AccessToken.for_user(user)
token['mfa_verified_for_session'] = True
token['role'] = 'admin'
raw_token = str(token)

headers = {'Authorization': 'Bearer ' + raw_token}
resp = requests.get('http://rag:8004/history', headers=headers, params={'limit': 100})
print('Status:', resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    items = data.get('items', [])
    print('Total items:', data.get('total', len(items)))
    print()
    print('Filenames (first 15):')
    for item in items[:15]:
        fn = item.get('filename', '?')
        print('  ' + fn)
    with_path = sum(1 for i in items if '/' in (i.get('filename') or ''))
    flat_count = sum(1 for i in items if '/' not in (i.get('filename') or ''))
    print()
    print('With path:', with_path)
    print('Flat:', flat_count)
else:
    print('Error:', resp.text[:500])
