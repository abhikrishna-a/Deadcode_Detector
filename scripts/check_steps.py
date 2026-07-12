import json, sys
d = json.load(sys.stdin)
for j in d['jobs']:
    print(f"\nJob: {j['name']}")
    for s in j.get('steps', []):
        c = str(s.get('conclusion') or 'in_progress')
        print(f"  {s['name']:40s} {c}")
