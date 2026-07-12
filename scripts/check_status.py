import json, sys
runs = json.load(sys.stdin)['workflow_runs']
for r in runs[:5]:
    c = str(r.get('conclusion') or 'running')
    print(f"{r['name']:10s} {r['status']:12s} {c:12s} {r['display_title'][:45]}")
