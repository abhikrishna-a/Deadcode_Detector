import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests, json

User = get_user_model()
user = User.objects.get(id=2)

token = AccessToken.for_user(user)
token['mfa_verified_for_session'] = True

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://localhost:8000/api/analysis/senior/history/', headers=headers, params={'scan_type': 'single'})
data = resp.json()
items = data if isinstance(data, list) else data.get('results', data.get('items', []))
print('Status:', resp.status_code)
print('Item count:', len(items) if isinstance(items, list) else '?')
if isinstance(items, list) and items:
    print()
    print('Filenames (first 10):')
    for item in items[:10]:
        fn = item.get('filename', '?')
        print('  ' + fn)
    import re
    fn_list = [item.get('filename', '') for item in items if isinstance(item, dict)]
    with_path = sum(1 for fn in fn_list if '/' in fn)
    flat_count = sum(1 for fn in fn_list if '/' not in fn and fn)
    print()
    print('With path:', with_path)
    print('Flat:', flat_count)
