import re
with open('debug_error.html', 'r', encoding='utf-8') as f:
    html = f.read()
m = re.search(r'<pre class="exception_value">([^<]+)</pre>', html)
if m: print('Exception:', m.group(1))
m2 = re.search(r'<h2>Exception Value</h2>\s*<pre[^>]*>([^<]+)</pre>', html)
if m2: print('Value:', m2.group(1)[:500])
frames = re.findall(r'<tr[^>]*>.*?<td[^>]*>([^<]+)</td>.*?<td[^>]*><code>([^<]*)</code>', html, re.DOTALL)
for fn, code in frames[-8:]:
    name = fn.strip().split('\\')[-1].split('/')[-1]
    c = code.strip()[:150]
    print(f'  {name}: {c}')
