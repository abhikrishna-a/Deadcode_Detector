"""Test WebSocket notification flow — connect first, then submit batch."""
import requests, time, json, asyncio, websockets

BASE = "http://127.0.0.1:8000"
WS_BASE = "ws://127.0.0.1:8000"

s = requests.Session()
r = s.post(f"{BASE}/api/auth/token/", json={"username": "ragtest", "password": "ragtest123"})
access = r.json()["access"]
headers = {"Authorization": f"Bearer {access}"}
print("OK Logged in")

async def test():
    # 1. Connect WebSocket FIRST by subscribing to a predictable batch ID
    #    We'll use a batch ID that doesn't exist yet (will just sit and wait)
    test_batch = "test-ws-connection-liveness"
    
    # 2. Submit a batch
    files_data = [
        ("files", ("main.py", b"import os\nimport sys\n\ndef hello():\n    print('hello')\n\nhello()\n", "application/octet-stream")),
        ("files", ("utils.py", b"def unused_func():\n    return 42\n\nx = 1\n", "application/octet-stream")),
        ("files", ("app.py", b"from utils import unused_func\n\nresult = unused_func()\nprint(result)\n", "application/octet-stream")),
    ]
    r = requests.post(f"{BASE}/api/analysis/batch/",
        files=files_data,
        data={"paths": ["main.py", "utils.py", "app.py"], "scan_folder": "test_ws2", "scan_type": "folder"},
        headers=headers)
    batch_id = r.json()["batch_id"]
    print(f"Batch submitted: {batch_id}")
    
    # 3. Connect WebSocket for this specific batch
    ws_url = f"{WS_BASE}/ws/analysis/{batch_id}/?token={access}"
    print(f"Connecting WebSocket...")
    try:
        async with websockets.connect(ws_url, ping_interval=10, ping_timeout=30, close_timeout=10) as ws:
            print("OK WebSocket connected")
            notifications = []
            timeout = time.time() + 30
            while time.time() < timeout:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2)
                    data = json.loads(msg)
                    notifications.append(data)
                    t = data['type']
                    if t == 'progress':
                        print(f"  PROGRESS: {data['done']}/{data['total']} - {data.get('current_file','')}")
                    elif t == 'file_complete':
                        issues = len(data.get('analysis',{}).get('issues',[]))
                        print(f"  FILE: {data['filename']} ({issues} issues)")
                    elif t == 'file_error':
                        print(f"  ERROR: {data['filename']} - {data.get('error','')}")
                    elif t == 'batch_complete':
                        print(f"  COMPLETE: batch finished")
                        break
                except asyncio.TimeoutError:
                    pass
            total_time = time.time() - timeout + 30
            print(f"\nReceived {len(notifications)} notifications")
            for n in notifications:
                print(f"  - {n['type']}")
            return notifications
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return []

notifications = asyncio.run(test())

# Verify via poll
time.sleep(1)
r = requests.get(f"{BASE}/api/analysis/batch/{'test-ws-connection-liveness'}/results/", headers=headers)  # dummy
# Actually get real batch results via poll
import re
print("\nPoll verification:")
r = requests.get(f"{BASE}/api/analysis/batch/".rstrip('/').split('/batch/')[0] + f"/batch/test-ws-connection-liveness/results/", headers=headers)
