import requests, time, json, asyncio, websockets

BASE = "http://127.0.0.1:8000"
WS_BASE = "ws://127.0.0.1:8000"

s = requests.Session()
r = s.post(f"{BASE}/api/auth/token/", json={"username": "ragtest", "password": "ragtest123"})
access = r.json()["access"]
headers = {"Authorization": f"Bearer {access}"}
print("OK Logged in")

# Submit batch
files_data = [
    ("files", ("main.py", b"import os\nimport sys\n\ndef hello():\n    print('hello')\n\nhello()\n", "application/octet-stream")),
    ("files", ("utils.py", b"def unused_func():\n    return 42\n\nx = 1\n", "application/octet-stream")),
    ("files", ("app.py", b"from utils import unused_func\n\nresult = unused_func()\nprint(result)\n", "application/octet-stream")),
]
r = requests.post(f"{BASE}/api/analysis/batch/",
    files=files_data,
    data={"paths": ["main.py", "utils.py", "app.py"], "scan_folder": "test_ws", "scan_type": "folder"},
    headers=headers)
batch_id = r.json()["batch_id"]
print(f"Batch submitted: {batch_id}")

# Connect WebSocket
async def listen():
    ws_url = f"{WS_BASE}/ws/analysis/{batch_id}/?token={access}"
    print(f"Connecting WebSocket...")
    try:
        async with websockets.connect(ws_url, ping_interval=5, ping_timeout=3) as ws:
            print("OK WebSocket connected")
            notifications = []
            timeout = time.time() + 30
            while time.time() < timeout:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(msg)
                    notifications.append(data)
                    print(f"  WS: {data['type']} " + (f"- {data.get('filename','')}" if 'filename' in data else f"- {data.get('done',0)}/{data.get('total',0)}"))
                    if data["type"] == "batch_complete":
                        print(f"OK All notifications received ({len(notifications)} total)")
                        return notifications
                except asyncio.TimeoutError:
                    print("  (waiting...)")
            print(f"Timeout. Got {len(notifications)} notifications")
            return notifications
    except Exception as e:
        print(f"ERROR: {e}")
        return []

notifications = asyncio.run(listen())
print(f"\nNotifications breakdown:")
for n in notifications:
    print(f"  {n['type']}")

# Also verify via poll
time.sleep(2)
r = requests.get(f"{BASE}/api/analysis/batch/{batch_id}/results/", headers=headers)
data = r.json()
print(f"\nPoll results: {data['done']}/{data['total']} complete={data['is_complete']}")
for f in data.get("files", []):
    issues = len(f.get("analysis", {}).get("issues", []))
    print(f"  {f['filename']}: {f['status']} ({issues} issues)")
