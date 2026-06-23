import requests
r = requests.post('http://localhost:8000/api/auth/token/', json={'username': 'appu', 'password': 'appu1234'}, timeout=10)
print('Status:', r.status_code)
print('Headers:', dict(r.headers))
try:
    print('JSON:', r.json())
except:
    print('Text:', r.text[:500])
