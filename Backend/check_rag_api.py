import requests
# Check RAG history endpoint for user 2
resp = requests.get('http://rag:8004/history?user_id=2&scan_folder=core&scan_type=single')
data = resp.json()
files = data.get('files', data.get('documents', data.get('results', [])))
print('RAG history response type:', type(data))
print('Filenames from RAG (first 10):')
for f in files[:10]:
    if isinstance(f, dict):
        print(' ', f.get('filename', f.get('name', f)))
    else:
        print(' ', f)
print('...')
print('Total items:', len(files))
