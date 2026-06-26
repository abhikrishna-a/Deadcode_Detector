import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
user = User.objects.get(id=2)

token = AccessToken.for_user(user)
token['mfa_verified_for_session'] = True
token['role'] = 'admin'

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://rag:8004/history', headers=headers, params={'limit': 1000})
data = resp.json()
items = data.get('items', [])
flat_items = [i for i in items if '/' not in (i.get('filename') or '')]
print('Flat items (%d):' % len(flat_items))
for item in flat_items[:20]:
    print('  filename=%r  hash=%s  scan_type=%s  analysis=%s' % (
        item.get('filename'),
        (item.get('file_hash') or '')[:16],
        item.get('scan_type'),
        'has_content' if item.get('analysis') else 'no_analysis'
    ))
