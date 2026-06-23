import requests, re
BASE = 'http://localhost:8000'
lj = requests.post(f'{BASE}/api/auth/token/', json={'username': 'testjunior_wendtx', 'password': 'Testpass123'})
jr_token = lj.json().get('access', lj.json().get('pre_auth_token', ''))
r = requests.get(f'{BASE}/api/auth/junior/list/', headers={'Authorization': f'Bearer {jr_token}'})
# Extract error info from Django debug page
m = re.search(r'<pre class="exception_value">([^<]+)</pre>', r.text)
if m: print('Error type:', m.group(1))
m2 = re.search(r'<h2>Exception Value</h2>\s*<pre[^>]*>([^<]+)</pre>', r.text)
if m2: print('Value:', m2.group(1))
# Get the last lines of traceback
frames = re.findall(r'<tr[^>]*>.*?<td[^>]*>([^<]+)</td>.*?<td[^>]*><code>([^<]*)</code>', r.text, re.DOTALL)
for fn, code in frames[-3:]:
    print(f'  {fn.strip()}: {code.strip()[:100]}')
