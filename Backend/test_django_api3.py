import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
u = User.objects.get(id=2)
token = AccessToken.for_user(u)
token['mfa_verified_for_session'] = True

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://localhost:8000/api/analysis-history/', headers=headers, params={'scan_type': 'one_scan_folder'})
print('Status:', resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    print('Type:', type(data))
    if isinstance(data, list):
        print('Count:', len(data))
        for item in data[:5]:
            print('  fn:', item.get('filename'))
    elif isinstance(data, dict):
        print('Keys:', list(data.keys()))
        items = data.get('results', data.get('items', []))
        print('Items:', len(items))
        for item in items[:5]:
            print('  fn:', item.get('filename'))
