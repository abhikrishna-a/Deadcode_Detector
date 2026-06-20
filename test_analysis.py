import requests
import json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzgxODk2MTI0LCJpYXQiOjE3ODE4OTI1MjQsImp0aSI6IjJiNDBiOTM4ZTQ5YTQwNjFiOWU1YWQwNjlmMTE2MmYxIiwidXNlcl9pZCI6IjIiLCJyb2xlIjoidmlld2VyIiwibWZhX3ZlcmlmaWVkX2Zvcl9zZXNzaW9uIjp0cnVlfQ.D63kZQe0BJJ1s4dNFc3eXFWqk6gB4EaViA-oawg24UY"

with open("test_dead_code.py", "r", encoding="utf-8") as f:
    content = f.read()

headers = {"Authorization": f"Bearer {TOKEN}"}

print("=" * 60)
print("TEST 1: Single-file /analyze (via Django proxy)")
print("=" * 60)
files = {"file": ("test_dead_code.py", content, "text/x-python")}
resp = requests.post("http://localhost:8000/api/rag/analyze", files=files, headers=headers, timeout=60)
d1 = resp.json()
a1 = d1.get("analysis", {})
print(f"Status: {resp.status_code} | Cached: {d1.get('cached','?')}")
print(f"Issues: {len(a1.get('issues', []))}")
for i in a1.get("issues", []):
    print(f"  [{i.get('type')}] L{i.get('line_start')}: {i.get('description','')[:80]}")
print()

print("=" * 60)
print("TEST 2: Batch /batch-analyze (direct to RAG port 8004)")
print("=" * 60)
payload = {
    "files": [{"name": "test_dead_code.py", "content": content}],
    "scan_folder": "test",
    "scan_type": "folder",
}
resp = requests.post("http://localhost:8004/batch-analyze", json=payload, headers=headers, timeout=120)
print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    d2 = resp.json()
    results = d2.get("results", [])
    print(f"Results: {len(results)}")
    for r in results:
        a2 = r.get("analysis", {})
        issues = a2.get("issues", [])
        fn = r.get("filename", "?")
        print(f"  --- {fn} ---")
        print(f"  Issues: {len(issues)}")
        for i in issues:
            print(f"    [{i.get('type')}] L{i.get('line_start')}: {i.get('description','')[:80]}")
else:
    print(f"  Error: {resp.text[:200]}")
