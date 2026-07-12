import json, sys
data = json.load(sys.stdin)
for j in data['jobs']:
    c = str(j.get('conclusion') or 'running')
    print(f"{j['name']:35s} {c}")
