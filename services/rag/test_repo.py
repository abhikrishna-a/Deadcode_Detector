import requests, json, time

BASE = "http://127.0.0.1:8000"
RAG = "http://127.0.0.1:8004"

s = requests.Session()

# Login
r = s.post(f"{BASE}/api/auth/token/", json={"username": "ragtest", "password": "ragtest123"})
assert r.status_code == 200, f"Login failed: {r.text}"
access = r.json()["access"]
headers = {"Authorization": f"Bearer {access}"}
print("OK Logged in")

# Git clone
t0 = time.time()
r = s.post(f"{BASE}/api/git/clone/", json={
    "repo_url": "https://github.com/dennisjoseph2025/PyDocAI",
    "branch": "main"
}, headers=headers)
assert r.status_code == 200, f"Clone failed: {r.text}"
data = r.json()
session_id = data["session_id"]
files = data["files"]
total = data["total_files"]
reponame = data["repo_name"]
print(f"OK Git clone: {total} files, session={session_id} ({time.time()-t0:.1f}s)")

# Fetch file contents
t1 = time.time()
paths = [f["path"] for f in files if f["language"] != "unknown" and f["size_bytes"] < 500000]
print(f"  Fetching {len(paths)} file contents...")
r = s.post(f"{BASE}/api/git/files/", json={
    "session_id": session_id,
    "paths": paths
}, headers=headers)
assert r.status_code == 200, f"Fetch files failed: {r.text}"
resp_data = r.json()
fetched_files = resp_data["files"]
print(f"OK Fetched {len(fetched_files)} files ({time.time()-t1:.1f}s)")

# Batch analyze through RAG
t2 = time.time()
files_list = [{"name": f["path"], "content": f["content"]} for f in fetched_files]
payload = {
    "files": files_list,
    "scan_folder": f"{reponame}/{session_id}",
    "scan_type": "repo"
}
print(f"  Submitting {len(files_list)} files to RAG batch-analyze...")
r = s.post(f"{RAG}/batch-analyze", json=payload, headers=headers)
elapsed = time.time() - t2
if r.status_code == 200:
    result = r.json()
    total_time = result.get("total_time_ms", 0)
    results = result.get("results", [])
    print(f"OK Batch analyze: {len(results)} files processed in {total_time/1000:.1f}s (wall: {elapsed:.1f}s)")
    total_issues = 0
    for res in results:
        issues = res.get("analysis", {}).get("issues", [])
        if issues:
            total_issues += len(issues)
            print(f"  {res['filename']}: {len(issues)} issues")
    print(f"\nTotal issues across all files: {total_issues}")
else:
    print(f"ERROR Batch analyze failed: HTTP {r.status_code}")
    print(r.text[:1000])

total_elapsed = time.time() - t0
print(f"\nTotal pipeline time: {total_elapsed:.1f}s")
