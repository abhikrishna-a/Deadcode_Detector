"""Complete E2E test — backend flow via API."""
import requests, json, time, textwrap

BASE = 'http://localhost:8000'
passed = 0
failed = 0

def step(n, desc, func):
    global passed, failed
    try:
        r = func()
        passed += 1
        print(f'  OK Step {n}: {desc}')
        return r
    except Exception as e:
        failed += 1
        print(f'  FAIL Step {n}: {desc} -> {e}')

# ── 1. Junior login ──
print('\n--- Phase 1: Junior Flow ---')
jr = step(1, 'Login as junior', lambda: requests.post(
    f'{BASE}/api/auth/token/', json={'username': 'appu', 'password': 'appu1234'}, timeout=10))
jtok = jr.json()['access']
print(f'       Token: {jtok[:40]}...')

# ── 2. Upload a file ──
code = textwrap.dedent('''\
    def unused_function():
        return 42

    def used_function(x):
        return x * 2

    result = used_function(10)
    print(result)
''')
step(2, 'Upload submission', lambda: requests.post(
    f'{BASE}/api/auth/junior/batch-upload/',
    files={'files': ('test_code.py', code, 'text/x-python')},
    headers={'Authorization': f'Bearer {jtok}'}, timeout=10))

# ── 3. List junior submissions ──
r3 = step(3, 'List my submissions', lambda: requests.get(
    f'{BASE}/api/auth/junior/list/', headers={'Authorization': f'Bearer {jtok}'}, timeout=10))
subs = r3.json()
sub_id = subs[0]['id'] if subs else None
print(f'       Latest submission id={sub_id}')

# ── 4. Senior login ──
print('\n--- Phase 2: Senior Flow ---')
sr = step(4, 'Login as senior', lambda: requests.post(
    f'{BASE}/api/auth/token/', json={'username': 'abhikrishna', 'password': 'abhikrishna1234'}, timeout=10))
stok = sr.json()['access']
print(f'       Token: {stok[:40]}...')

# ── 5. Senior sees pending ──
r5 = step(5, 'List pending submissions', lambda: requests.get(
    f'{BASE}/api/auth/senior/submissions/', headers={'Authorization': f'Bearer {stok}'}, timeout=10))
print(f'       Count: {len(r5.json())}')

# ── 6. Trigger analysis ──
step(6, 'Trigger analysis', lambda: requests.post(
    f'{BASE}/api/auth/junior/analyze/{sub_id}/',
    headers={'Authorization': f'Bearer {stok}'}, timeout=10))

# ── 7. Wait for analysis then check status ──
print('\n--- Phase 3: Analysis & Feedback ---')
for attempt in range(15):
    r = requests.get(f'{BASE}/api/auth/junior/detail/{sub_id}/',
                     headers={'Authorization': f'Bearer {stok}'}, timeout=10)
    status = r.json().get('status', 'unknown')
    print(f'       Attempt {attempt+1}: status={status}', end='\r')
    if status in ('pending_review', 'completed'):
        print(f'\n       → Done after {attempt+1} checks')
        break
    time.sleep(2)
else:
    print('\n       → Timed out waiting for analysis')

# ── 8. Senior adds inline feedback ──
step(8, 'Add inline comment lines 1-3', lambda: requests.post(
    f'{BASE}/api/auth/senior/feedback/{sub_id}/',
    json={'line_start': 1, 'line_end': 3, 'comment': 'Unused function — delete it'},
    headers={'Authorization': f'Bearer {stok}'}, timeout=10))

step(9, 'Add inline comment line 8', lambda: requests.post(
    f'{BASE}/api/auth/senior/feedback/{sub_id}/',
    json={'line_start': 8, 'line_end': 8, 'comment': 'Consider renaming result to output'},
    headers={'Authorization': f'Bearer {stok}'}, timeout=10))

# ── 9. Junior sees feedback ──
r10 = step(10, 'Junior feedback list', lambda: requests.get(
    f'{BASE}/api/auth/junior/feedback/', headers={'Authorization': f'Bearer {jtok}'}, timeout=10))
fbs = r10.json()
print(f'       Feedback count: {len(fbs)}')
for fb in fbs:
    print(f'         L{fb["line_start"]}-{fb["line_end"]}: {fb["comment"][:50]}')

# ── 10. Junior sees submission detail (includes result) ──
r11 = step(11, 'Junior submission detail', lambda: requests.get(
    f'{BASE}/api/auth/junior/detail/{sub_id}/',
    headers={'Authorization': f'Bearer {jtok}'}, timeout=10))
det = r11.json()
print(f'       Status: {det["status"]}')
print(f'       Has result: {det.get("result") is not None}')

# ── Summary ──
print(f'\n{"="*40}')
print(f'  Passed: {passed} / {passed + failed}')
print(f'  Failed: {failed}')
print(f'{"="*40}')
if failed == 0:
    print('  ALL E2E TESTS PASSED')
else:
    print('  SOME TESTS FAILED')
