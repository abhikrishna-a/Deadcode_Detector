import django; django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
import requests

User = get_user_model()
u = User.objects.get(id=2)
token = AccessToken.for_user(u)
token['mfa_verified_for_session'] = True

headers = {'Authorization': 'Bearer ' + str(token)}
resp = requests.get('http://localhost:8000/api/auth/analysis-history/', headers=headers, params={'scan_type': 'one_scan_folder'})
print('Status:', resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    if isinstance(data, list):
        print('Count:', len(data))
        for item in data[:5]:
            print('  fn:', item.get('filename'))
        fn_list = [item.get('filename', '') for item in data if isinstance(item, dict)]
        with_path = sum(1 for fn in fn_list if '/' in fn)
        flat_count = sum(1 for fn in fn_list if '/' not in fn and fn)
        print('With path:', with_path)
        print('Flat:', flat_count)
    else:
        print('Data:', str(data)[:200])
else:
    print('Error:', resp.text[:300])
