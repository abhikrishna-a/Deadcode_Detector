import requests, json, time, asyncio, websockets, sys

BASE = "http://127.0.0.1:8000"
WS_BASE = "ws://127.0.0.1:8000"

s = requests.Session()

# Login
r = s.post(f"{BASE}/api/auth/token/", json={"username": "ragtest", "password": "ragtest123"})
assert r.status_code == 200, f"Login failed: {r.text}"
access = r.json()["access"]
print(f"OK Logged in (token: {access[:40]}...)")

# Git clone
t0 = time.time()
r = s.post(f"{BASE}/api/git/clone/", json={
    "repo_url": "https://github.com/dennisjoseph2025/PyDocAI",
    "branch": "main"
}, headers={"Authorization": f"Bearer {access}"})
assert r.status_code == 200, f"Clone failed: {r.text}"
data = r.json()
session_id = data["session_id"]
files = data["files"]
print(f"OK Git clone: {len(files)} files, session={session_id} ({time.time()-t0:.1f}s)")

# Fetch file contents (text files only, skip large)
paths = [f["path"] for f in files if f["language"] != "unknown" and f["size_bytes"] < 500000]
r = s.post(f"{BASE}/api/git/files/", json={"session_id": session_id, "paths": paths},
           headers={"Authorization": f"Bearer {access}"})
assert r.status_code == 200, f"Fetch files failed: {r.text}"
fetched = r.json()["files"]
print(f"OK Fetched {len(fetched)} file contents ({time.time()-t0:.1f}s)")

# Submit batch analysis to Django
file_payload = []
for f in fetched:
    content = f["content"]
    file_payload.append({
        "path": f["path"],
        "content": content,
        "size": len(content.encode("utf-8"))
    })

r = s.post(f"{BASE}/api/analysis/batch/", json={
    "files": file_payload,
    "scan_folder": f"pydocai/{session_id}",
    "scan_type": "repo"
}, headers={"Authorization": f"Bearer {access}"})
print(f"Batch submit: HTTP {r.status_code}")
if r.status_code == 200:
    batch_id = r.json().get("batch_id", "")
    print(f"OK Batch submitted: {batch_id} ({time.time()-t0:.1f}s)")

    # Connect WebSocket to receive notifications
    async def listen_ws():
        ws_url = f"{WS_BASE}/ws/analysis/{batch_id}/?token={access}"
        print(f"Connecting WebSocket: {ws_url[:100]}...")
        try:
            async with websockets.connect(ws_url, ping_interval=5, ping_timeout=3) as ws:
                print("OK WebSocket connected")
                received_progress = False
                received_files = 0
                received_complete = False
                timeout = time.time() + 60
                while time.time() < timeout:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=5)
                        data = json.loads(msg)
                        if data["type"] == "progress":
                            if not received_progress:
                                print(f"  Progress: {data['done']}/{data['total']} - {data.get('current_file','')}")
                                received_progress = True
                            if data['done'] % 20 == 0 and data['done'] > 0:
                                print(f"  Progress: {data['done']}/{data['total']}")
                        elif data["type"] == "file_complete":
                            received_files += 1
                            issues = len(data.get("analysis", {}).get("issues", []))
                            if received_files <= 5 or issues > 0:
                                print(f"  File done: {data['filename']} ({issues} issues)")
                        elif data["type"] == "file_error":
                            print(f"  File error: {data['filename']} - {data.get('error','')}")
                            received_files += 1
                        elif data["type"] == "batch_complete":
                            print(f"OK Batch complete! ({time.time()-t0:.1f}s)")
                            received_complete = True
                            break
                    except asyncio.TimeoutError:
                        print(f"  (waiting... {time.time()-t0:.1f}s)")
                        continue
                if not received_complete:
                    print(f"WARN Timeout waiting for batch complete ({time.time()-t0:.1f}s)")
        except Exception as e:
            print(f"ERROR WebSocket: {e}")

    asyncio.run(listen_ws())
    print(f"\nTotal pipeline time: {time.time()-t0:.1f}s")
else:
    print(f"ERROR: {r.text[:500]}")
