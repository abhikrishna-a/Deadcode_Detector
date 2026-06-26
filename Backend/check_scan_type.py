import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
u = User.objects.get(id=2)
token = AccessToken.for_user(u)
token['mfa_verified_for_session'] = True

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://rag:8004/history', headers=headers, params={'limit': 200})
data = resp.json()
items = data.get('items', [])

# Check scan_type distribution
from collections import Counter
st = Counter(i.get('scan_type') for i in items)
print('Scan type distribution:', dict(st))

# Check scan_folder distribution
sf = Counter(i.get('scan_folder') for i in items)
print('Scan folder distribution:', dict(sf))

# Check first few items
print()
print('First 5 items:')
for item in items[:5]:
    print('  fn=%r  folder=%r  type=%r  has_analysis=%s' % (
        item.get('filename'),
        item.get('scan_folder'),
        item.get('scan_type'),
        'yes' if item.get('analysis') or item.get('health_score') else 'no'
    ))

# Last 5 items
print()
print('Last 5 items:')
for item in items[-5:]:
    print('  fn=%r  folder=%r  type=%r  has_analysis=%s' % (
        item.get('filename'),
        item.get('scan_folder'),
        item.get('scan_type'),
        'yes' if item.get('analysis') or item.get('health_score') else 'no'
    ))
