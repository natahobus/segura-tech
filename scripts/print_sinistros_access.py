import json
import urllib.request
import urllib.error

base = 'http://localhost:3000'

def call(path, token=None, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {'Content-Type': 'application/json'} if payload is not None else {}
    if token:
        headers['x-auth-token'] = token
    req = urllib.request.Request(base + path, data=data, headers=headers, method='GET' if payload is None else 'POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode('utf-8', errors='replace')
            print('STATUS', r.status, 'BODY', body[:300])
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, e.read().decode('utf-8', errors='replace')[:300])

for username, password in [('emissao','emissao123'), ('vendedor','vendas123')]:
    print('LOGIN', username)
    req = urllib.request.Request(base + '/api/login', data=json.dumps({'username': username, 'password': password}).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.loads(r.read().decode())
            print('TOKEN', body)
            call('/api/sinistros', token=body['token'])
    except Exception as e:
        print('ERR', type(e).__name__, e)
