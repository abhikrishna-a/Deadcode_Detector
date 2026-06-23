import requests
BASE = 'http://localhost:8000'

# Login as senior
r = requests.post(f'{BASE}/api/auth/token/', json={'username': 'abhikrishna', 'password': 'abhikrishna1234'}, timeout=10)
stok = r.json()['access']

# Find failed submission
r = requests.get(f'{BASE}/api/auth/senior/submissions/', headers={'Authorization': f'Bearer {stok}'}, timeout=10)
print(f'Submissions: {len(r.json())}')

# Get latest failed one
for s in r.json():
    if s['status'] == 'failed':
        print(f'\nFailed sub id={s["id"]}:')
        r2 = requests.get(f'{BASE}/api/auth/junior/detail/{s["id"]}/', headers={'Authorization': f'Bearer {stok}'}, timeout=10)
        det = r2.json()
        print(f'  Status: {det["status"]}')
        print(f'  Error: {det.get("error", "none")}')
        print(f'  Result: {det.get("result", "none")}')
        # Trigger analysis again to see the live error
        r3 = requests.post(f'{BASE}/api/auth/junior/analyze/{s["id"]}/', headers={'Authorization': f'Bearer {stok}'}, timeout=10)
        print(f'  Re-trigger: {r3.status_code} {r3.json()}')
        break
