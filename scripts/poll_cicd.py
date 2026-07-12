import json, time, sys, os
from urllib.request import urlopen, Request

OWNER = "abhikrishna-a"
REPO = "Deadcode_Detector"
POLL_FILE = os.path.join(os.path.dirname(__file__), "gh_runs_poll.json")

def get_runs():
    req = Request(f"https://api.github.com/repos/{OWNER}/{REPO}/actions/runs?per_page=5&branch=main",
                  headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "python"})
    data = json.load(urlopen(req))
    return data["workflow_runs"]

def get_jobs(run_id):
    req = Request(f"https://api.github.com/repos/{OWNER}/{REPO}/actions/runs/{run_id}/jobs",
                  headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "python"})
    data = json.load(urlopen(req))
    return data["jobs"]

print("Polling CI/CD...")
while True:
    runs = get_runs()
    for r in runs:
        if r["status"] == "in_progress" or r["status"] == "queued":
            print(f"{r['name']:10s}: {r['status']}...")
    completed = [r for r in runs if r["status"] == "completed"]
    if completed:
        latest = completed[0]
        print(f"\nLatest: {latest['name']}: conclusion={latest.get('conclusion', 'N/A')}")
        if latest["name"] == "CI":
            if latest.get("conclusion") == "success":
                print("\nCI PASSED! CD should trigger now.")
                jobs = get_jobs(latest["id"])
                for j in jobs:
                    c = j.get("conclusion", "N/A")
                    marker = "OK" if c == "success" else "SKIP" if j.get("status") == "skipped" else "FAIL"
                    print(f"  [{marker}] {j['name']}: {c}")
                sys.exit(0)
            elif latest.get("conclusion") == "failure":
                print("\nCI FAILED. Jobs:")
                jobs = get_jobs(latest["id"])
                for j in jobs:
                    c = j.get("conclusion", "N/A")
                    marker = "OK" if c == "success" else "SKIP" if c == "skipped" else "FAIL"
                    print(f"  [{marker}] {j['name']}: {c}")
                sys.exit(1)
            else:
                print(f"  Status: {latest.get('conclusion')}")
    print("\nWaiting 30s...")
    time.sleep(30)
