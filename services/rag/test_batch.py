import requests, time, json

BASE = "http://127.0.0.1:8000"
s = requests.Session()

# Login
r = s.post(f"{BASE}/api/auth/token/", json={"username": "ragtest", "password": "ragtest123"})
access = r.json()["access"]
headers = {"Authorization": f"Bearer {access}"}
print("OK Logged in")

# Submit batch analysis with multipart
files_data = [
    ("files", ("main.py", b"import os\nimport sys\n\ndef hello():\n    print('hello')\n\nhello()\n", "application/octet-stream")),
    ("files", ("utils.py", b"def unused_func():\n    return 42\n\nx = 1\n", "application/octet-stream")),
    ("files", ("app.py", b"from utils import unused_func\n\nresult = unused_func()\nprint(result)\n", "application/octet-stream")),
]
r = requests.post(f"{BASE}/api/analysis/batch/",
    files=files_data,
    data={"paths": ["main.py", "utils.py", "app.py"], "scan_folder": "test_ws", "scan_type": "folder"},
    headers=headers)
print(f"Submit: {r.status_code}")
batch_id = r.json()["batch_id"]
print(f"Batch ID: {batch_id}")

# Poll for completion
t0 = time.time()
for i in range(30):
    r = requests.get(f"{BASE}/api/analysis/batch/{batch_id}/results/", headers=headers)
    data = r.json()
    done, total, complete = data["done"], data["total"], data["is_complete"]
    elapsed = time.time() - t0
    print(f"  Poll {i}: done={done}/{total} complete={complete} ({elapsed:.0f}s)")
    if complete:
        for f in data["files"]:
            issues = len(f.get("analysis", {}).get("issues", []))
            print(f"  {f['filename']}: {f['status']} ({issues} issues)")
        break
    time.sleep(3)
else:
    print(f"Timeout after {time.time()-t0:.0f}s")

print(f"Total: {time.time()-t0:.1f}s")
