#!/usr/bin/env python3
"""Teste de permissões por perfil para o SeguraTech.

Uso:
    python scripts/test_permissoes.py

Requer que o servidor esteja rodando em http://localhost:3000.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Tuple

BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000')
USERS = {
    'vendedor': 'vendas123',
    'emissao': 'emissao123',
    'sinistro': 'sinistro123',
    'gestor': 'gestor123',
}


def request_json(method: str, path: str, token: str | None = None, payload: Dict[str, Any] | None = None) -> Tuple[int, Any]:
    url = BASE_URL.rstrip('/') + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if token:
        headers['x-auth-token'] = token

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            if not body:
                return resp.status, {}
            content_type = resp.headers.get('Content-Type', '')
            if 'application/json' in content_type.lower():
                try:
                    return resp.status, json.loads(body.decode('utf-8'))
                except json.JSONDecodeError:
                    return resp.status, {'raw': body.decode('utf-8', errors='replace')}
            return resp.status, {'content_type': content_type, 'raw_size': len(body)}
    except urllib.error.HTTPError as exc:
        body = exc.read()
        content_type = exc.headers.get('Content-Type', '') if getattr(exc, 'headers', None) else ''
        if body and 'application/json' in content_type.lower():
            try:
                detail = json.loads(body.decode('utf-8'))
            except json.JSONDecodeError:
                detail = {'raw': body.decode('utf-8', errors='replace')}
            return exc.code, detail
        if body:
            return exc.code, {'content_type': content_type, 'raw_size': len(body), 'raw_preview': body[:120].decode('utf-8', errors='replace')}
        return exc.code, {}


def login(username: str, password: str) -> str:
    status, resp = request_json('POST', '/api/login', payload={'username': username, 'password': password})
    if status != 200:
        raise AssertionError(f'Falha ao logar {username}: status={status}, resp={resp}')
    return str(resp['token'])


def assert_status(label: str, actual: int, expected: int) -> None:
    if actual != expected:
        raise AssertionError(f'{label}: esperado {expected}, recebido {actual}')


def main() -> None:
    print(f'Usando BASE_URL={BASE_URL}')
    checks = []

    # login and role-specific checks
    tokens = {role: login(role, passwd) for role, passwd in USERS.items()}

    # Vendedor: sinistros e chart próprios permitidos; apolices permitidas apenas próprias
    status, data = request_json('GET', '/api/sinistros', token=tokens['vendedor'])
    assert_status('vendedor GET /api/sinistros', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/chart/sinistros', token=tokens['vendedor'])
    assert_status('vendedor GET /api/chart/sinistros', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/apolices?search=joao', token=tokens['vendedor'])
    assert_status('vendedor GET /api/apolices', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/apolices/1', token=tokens['vendedor'])
    assert_status('vendedor GET /api/apolices/<id> (próprio)', status, 200)
    status, _ = request_json('PUT', '/api/apolices/1/status', token=tokens['vendedor'], payload={'status': 'Emitida'})
    assert_status('vendedor PUT /api/apolices/<id>/status', status, 200)

    # Emissão: sinistros negados, apolices liberadas
    status, _ = request_json('GET', '/api/sinistros', token=tokens['emissao'])
    assert_status('emissao GET /api/sinistros', status, 403)
    status, data = request_json('GET', '/api/apolices', token=tokens['emissao'])
    assert_status('emissao GET /api/apolices', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/apolices/1/pdf', token=tokens['emissao'])
    assert_status('emissao GET /api/apolices/<id>/pdf', status, 200)

    # Sinistro: lista e chart liberados; apolices leitura
    status, data = request_json('GET', '/api/sinistros', token=tokens['sinistro'])
    assert_status('sinistro GET /api/sinistros', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/chart/sinistros', token=tokens['sinistro'])
    assert_status('sinistro GET /api/chart/sinistros', status, 200)
    assert isinstance(data, list)
    status, data = request_json('GET', '/api/apolices?search=joao', token=tokens['sinistro'])
    assert_status('sinistro GET /api/apolices', status, 200)
    assert isinstance(data, list)

    # Gestor: tudo liberado
    for path in ['/api/sinistros', '/api/chart/sinistros', '/api/apolices', '/api/apolices/1', '/api/apolices/1/pdf']:
        status, _ = request_json('GET', path, token=tokens['gestor'])
        assert_status(f'gestor GET {path}', status, 200)

    # Proteção contra brute force por username + IP
    invalid_user = 'usuario_inexistente'
    only_invalid = []
    for i in range(1, 7):
        status, resp = request_json('POST', '/api/login', payload={'username': invalid_user, 'password': f'errada-{i}'})
        only_invalid.append((status, resp))
    rate_limited = any(status == 429 for status, _ in only_invalid)
    if not rate_limited:
        raise AssertionError(f'Esperava 429 após tentativas repetidas de login, mas recebeu: {only_invalid}')

    # Regras de negócio: status do sinistro deve seguir lista controlada
    status, resp = request_json('POST', '/api/sinistros', token=tokens['sinistro'], payload={
        'policyNumber': 'APL-2025-001',
        'client': 'Cliente de Teste',
        'cpf': '123.456.789-09',
        'insurer': 'Porto Seguro',
        'type': 'Automóvel',
        'status': 'Status inválido'
    })
    if status != 400:
        raise AssertionError(f'Esperava 400 para status inválido em sinistro; recebeu {status} / {resp}')

    # ETAPA A: senhas devem ser armazenadas com hash e não em texto puro
    db_path = os.path.join(os.path.dirname(__file__), '..', 'database.sqlite')
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT username, password FROM users").fetchall()
        for username, password in rows:
            if password == 'vendas123' or password == 'emissao123' or password == 'sinistro123' or password == 'gestor123':
                raise AssertionError(f'Senha em texto puro encontrada para {username} no banco.')

    # ETAPA A: emissão não pode reusar número de apólice já existente
    boundary = '----WebKitFormBoundaryTest123'
    body = (
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="policyNumber"\r\n\r\n'
        '0009821-4\r\n'
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="pdf"; filename="fake.pdf"\r\n'
        'Content-Type: application/pdf\r\n\r\n'
        'not a pdf\r\n'
        f'--{boundary}--\r\n'
    ).encode('utf-8')

    req = urllib.request.Request(
        BASE_URL.rstrip('/') + '/api/propostas/3/emit',
        data=body,
        headers={'x-auth-token': tokens['emissao'], 'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            payload = resp.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        payload = exc.read()

    if status != 400:
        raise AssertionError(f'Esperava 400 ao tentar emitir apólice duplicada ou PDF inválido; recebeu {status} / {payload!r}')

    # ETAPA A: upload de PDF inválido deve ser rejeitado mesmo com extensão .pdf
    invalid_pdf_body = (
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="pdf"; filename="arquivo.pdf"\r\n'
        'Content-Type: application/pdf\r\n\r\n'
        'NOT-A-PDF\r\n'
        f'--{boundary}--\r\n'
    ).encode('utf-8')
    req = urllib.request.Request(
        BASE_URL.rstrip('/') + '/api/apolices/1/upload',
        data=invalid_pdf_body,
        headers={'x-auth-token': tokens['vendedor'], 'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            payload = resp.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        payload = exc.read()
    if status != 400:
        raise AssertionError(f'Esperava 400 para upload de PDF inválido; recebeu {status} / {payload!r}')

    # ETAPA B: motivo de não renovada deve persistir e a janela de renovação deve cobrir prazos próximos
    status, resp = request_json('PUT', '/api/apolices/1/status', token=tokens['gestor'], payload={'status': 'Não renovada', 'notes': 'Cliente optou por outra seguradora'})
    if status != 200:
        raise AssertionError(f'Esperava 200 ao marcar apólice como não renovada; recebeu {status} / {resp}')
    if resp.get('returnReason') != 'Cliente optou por outra seguradora':
        raise AssertionError(f'Esperava returnReason persistido em /api/apolices/1/status; recebeu {resp}')

    status, renovacoes = request_json('GET', '/api/renovacoes', token=tokens['gestor'])
    if status != 200:
        raise AssertionError(f'Esperava 200 em /api/renovacoes; recebeu {status}/{renovacoes}')
    if not isinstance(renovacoes, dict):
        raise AssertionError(f'Esperava payload de renovação em dicionário; recebeu {renovacoes!r}')
    pending = renovacoes.get('pending', [])
    if not isinstance(pending, list):
        raise AssertionError(f'Esperava lista de pendentes em /api/renovacoes; recebeu {pending!r}')

    print('OK: permissões por perfil, segurança e regras de negócio conferem com os critérios esperados.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # pragma: no cover
        print(f'ERRO: {exc}', file=sys.stderr)
        raise SystemExit(1)
