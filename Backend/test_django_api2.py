import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
u = User.objects.get(id=2)
token = AccessToken.for_user(u)
token['mfa_verified_for_session'] = True

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://localhost:8000/api/analysis/senior/history/', headers=headers, params={'scan_type': 'one_scan_folder'})
print('Status:', resp.status_code)
print('Resp text[:300]:', resp.text[:300])
if resp.status_code == 200:
    data = resp.json()
    print('Type:', type(data))
    if isinstance(data, list):
        print('Count:', len(data))
        for item in data[:5]:
            print('  fn:', item.get('filename'))
