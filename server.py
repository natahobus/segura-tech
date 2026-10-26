"""
SeguraTech - Backend Python/Flask
Substitui o server.js original (sqlite3 nativo do Node não compila neste ambiente)
Mantém EXATAMENTE as mesmas rotas e comportamento da API original.
"""

import sqlite3
import os
import secrets
import json
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, send_from_directory, g, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# Carrega .env manualmente (sem dependência de python-dotenv)
# OPENROUTER_API_KEY e OPENROUTER_MODEL sempre prevalecem sobre variáveis do sistema
_ENV_OVERRIDE = {'OPENROUTER_API_KEY', 'OPENROUTER_MODEL'}
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path, encoding='utf-8') as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                _k, _v = _k.strip(), _v.strip().strip('"').strip("'")
                if _k in _ENV_OVERRIDE:
                    os.environ[_k] = _v
                else:
                    os.environ.setdefault(_k, _v)

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'database.sqlite')


# ─────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()


def db_get(sql, params=()):
    row = get_db().execute(sql, params).fetchone()
    return dict(row) if row else None


def db_all(sql, params=()):
    rows = get_db().execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def db_run(sql, params=()):
    cur = get_db().execute(sql, params)
    get_db().commit()
    return cur.lastrowid


PROPOSTAS_UPLOAD = os.path.join(os.path.dirname(__file__), 'uploads', 'propostas')
POLICIES_UPLOAD = os.path.join(os.path.dirname(__file__), 'uploads', 'policies')


def log_proposal_history(proposal_id, event, actor):
    db_run(
        "INSERT INTO proposal_history (proposal_id,date,event,actor) VALUES (?,?,?,?)",
        (proposal_id, datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'), event, actor)
    )


def hash_password(value):
    return generate_password_hash(value, method='pbkdf2:sha256')


def verify_password(stored_password, supplied_password):
    if not stored_password:
        return False
    if stored_password.startswith(('pbkdf2:', 'scrypt:', 'argon2:')):
        return check_password_hash(stored_password, supplied_password)
    return stored_password == supplied_password


def save_pdf_upload(file, folder, prefix):
    """Salva PDF e retorna (filename, originalName) ou levanta ValueError."""
    if not file or file.filename == '':
        return None, None
    if not file.filename.lower().endswith('.pdf'):
        raise ValueError('Apenas arquivos PDF são permitidos.')

    file.stream.seek(0)
    sample = file.read(4096)
    file.stream.seek(0)
    if not sample.startswith(b'%PDF'):
        raise ValueError('Arquivo inválido: o PDF enviado parece corrompido ou não é um arquivo PDF real.')

    os.makedirs(folder, exist_ok=True)
    import time
    unique = f"{prefix}_{int(time.time())}_{secrets.token_hex(8)}.pdf"
    file.save(os.path.join(folder, unique))
    return unique, file.filename


def proposal_access_ok(user, prop):
    if user['role'] == 'gestor':
        return True
    if user['role'] == 'emissao':
        return True
    if user['role'] == 'vendedor' and prop['seller'] == user['username']:
        return True
    return False


# ─────────────────────────────────────────────
# Schema + seed
# ─────────────────────────────────────────────
def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    c = db.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            name TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE,
            user_id INTEGER,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT UNIQUE,
            client TEXT,
            insurer TEXT,
            type TEXT,
            start TEXT,
            end TEXT,
            premium REAL,
            status TEXT,
            seller TEXT
        );
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client TEXT,
            phone TEXT,
            source TEXT,
            status TEXT,
            owner TEXT,
            notes TEXT,
            createdBy TEXT,
            createdAt TEXT
        );
        CREATE TABLE IF NOT EXISTS proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            policyNumber TEXT,
            client TEXT,
            cpf TEXT,
            insurer TEXT,
            type TEXT,
            seller TEXT,
            status TEXT,
            createdAt TEXT,
            notes TEXT,
            firstDueDate TEXT,
            pdfFilename TEXT,
            pdfOriginalName TEXT
        );
        CREATE TABLE IF NOT EXISTS sinistros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            policyNumber TEXT,
            client TEXT,
            cpf TEXT,
            insurer TEXT,
            type TEXT,
            status TEXT,
            openedAt TEXT,
            protocol TEXT,
            description TEXT,
            sinistroDate TEXT,
            avisoDate TEXT,
            oficina TEXT,
            seller TEXT,
            numeroSinistro TEXT,
            veiculoModelo TEXT,
            veiculoPlaca TEXT,
            tipoEnvolvido TEXT DEFAULT 'segurado',
            isFinalizado INTEGER DEFAULT 0,
            finalizadoAt TEXT,
            finalizadoBy TEXT
        );
        CREATE TABLE IF NOT EXISTS sinistro_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sinistro_id INTEGER,
            date TEXT,
            event TEXT,
            actor TEXT,
            FOREIGN KEY(sinistro_id) REFERENCES sinistros(id)
        );
        CREATE TABLE IF NOT EXISTS sinistro_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sinistro_id INTEGER,
            filename TEXT,
            originalName TEXT,
            fileType TEXT,
            uploadedAt TEXT,
            uploadedBy TEXT,
            FOREIGN KEY(sinistro_id) REFERENCES sinistros(id)
        );
        CREATE TABLE IF NOT EXISTS proposal_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id INTEGER,
            date TEXT,
            event TEXT,
            actor TEXT,
            FOREIGN KEY(proposal_id) REFERENCES proposals(id)
        );
    """)

    existing_sinistro_columns = {row[1] for row in c.execute("PRAGMA table_info(sinistros)").fetchall()}
    sinistro_columns = {
        'sinistroDate': "TEXT",
        'avisoDate': "TEXT",
        'oficina': "TEXT",
        'seller': "TEXT",
        'numeroSinistro': "TEXT",
        'veiculoModelo': "TEXT",
        'veiculoPlaca': "TEXT",
        'tipoEnvolvido': "TEXT DEFAULT 'segurado'",
        'isFinalizado': "INTEGER DEFAULT 0",
        'finalizadoAt': "TEXT",
        'finalizadoBy': "TEXT",
    }
    for column, definition in sinistro_columns.items():
        if column not in existing_sinistro_columns:
            c.execute(f"ALTER TABLE sinistros ADD COLUMN {column} {definition}")

    existing_lead_columns = {row[1] for row in c.execute("PRAGMA table_info(leads)").fetchall()}
    lead_columns = {
        'phone': "TEXT",
        'notes': "TEXT",
        'createdBy': "TEXT",
        'createdAt': "TEXT",
    }
    for column, definition in lead_columns.items():
        if column not in existing_lead_columns:
            c.execute(f"ALTER TABLE leads ADD COLUMN {column} {definition}")

    existing_proposal_columns = {row[1] for row in c.execute("PRAGMA table_info(proposals)").fetchall()}
    proposal_columns = {
        'cpf': "TEXT",
        'firstDueDate': "TEXT",
        'start': "TEXT",
        'end': "TEXT",
        'pdfFilename': "TEXT",
        'pdfOriginalName': "TEXT",
    }
    for column, definition in proposal_columns.items():
        if column not in existing_proposal_columns:
            c.execute(f"ALTER TABLE proposals ADD COLUMN {column} {definition}")

    existing_policy_columns = {row[1] for row in c.execute("PRAGMA table_info(policies)").fetchall()}
    policy_columns = {
        'cpf': "TEXT",
        'phone': "TEXT",
        'pdfFilename': "TEXT",
        'pdfOriginalName': "TEXT",
        'notes': "TEXT",
        'returnReason': "TEXT",
    }
    for column, definition in policy_columns.items():
        if column not in existing_policy_columns:
            c.execute(f"ALTER TABLE policies ADD COLUMN {column} {definition}")

    # Migrar status antigos de propostas
    c.execute("UPDATE proposals SET status='Em elaboração' WHERE status='Pendente'")
    c.execute("UPDATE proposals SET status='Aguardando emissão' WHERE status='Enviada'")
    c.execute("UPDATE proposals SET status='Emitida' WHERE status IN ('Aprovada', 'Emitida')")

    existing_users = c.execute("SELECT id, username, password FROM users").fetchall()
    for user_id, username, stored_password in existing_users:
        if stored_password and not stored_password.startswith(('pbkdf2:', 'scrypt:', 'argon2:')):
            c.execute("UPDATE users SET password=? WHERE id=?", (hash_password(stored_password), user_id))

    # Seed users
    if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO users (username, password, role, name) VALUES (?,?,?,?)",
            [
                ('vendedor',  hash_password('vendas123'),    'vendedor',  'Carla Vendas'),
                ('emissao',   hash_password('emissao123'),   'emissao',   'Lucas Emissão'),
                ('sinistro',  hash_password('sinistro123'),  'sinistro',  'Patrícia Sinistro'),
                ('gestor',    hash_password('gestor123'),    'gestor',    'Carlos Mendes'),
            ]
        )

    # Seed policies
    if c.execute("SELECT COUNT(*) FROM policies").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO policies (number,client,insurer,type,start,end,premium,status,seller) VALUES (?,?,?,?,?,?,?,?,?)",
            [
                ('0009821-4','João Ferreira','Porto Seguro','Automóvel','2026-05-15','2027-05-15',1250.0,'Emitida','vendedor'),
                ('0008216-7','Beatriz Lemos','Allianz','Vida','2026-06-01','2027-06-01',840.0,'Emitida','vendedor'),
                ('0007712-0','Carlos Diniz','SulAmérica','Residencial','2026-06-10','2027-06-10',950.0,'Emitida','vendedor'),
                ('APL-2025-001','Ana Paula Souza','Porto Seguro','Automóvel','2025-05-15','2026-05-15',2840.0,'Renovar','vendedor'),
                ('APL-2025-002','Pedro Castro','HDI Seguros','Empresarial','2025-04-10','2026-04-10',5600.0,'Renovar','vendedor'),
            ]
        )

    # Seed leads
    if c.execute("SELECT COUNT(*) FROM leads").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO leads (client,phone,source,status,owner,notes,createdBy,createdAt) VALUES (?,?,?,?,?,?,?,?)",
            [
                ('Ana Paula Souza','(53) 99999-1001','Formulário site','Novo','vendedor','Interessada em seguro auto.','Sistema','2026-06-01'),
                ('Rafael Mendes','(53) 99999-1002','Indicação','Em contato','vendedor','Cliente pediu cotação residencial.','gestor','2026-06-02'),
                ('Mariana Costa','(53) 99999-1003','WhatsApp','Aguardando resposta','vendedor','Deseja comparar seguro de vida.','Sistema','2026-06-03'),
                ('Diego Souza','(53) 99999-1004','Telefone','Novo','vendedor','Procura seguro empresarial.','Sistema','2026-06-04'),
                ('Fernanda Lima','(53) 99999-1005','Indicação','Fechado','vendedor','Seguro auto convertido.','gestor','2026-06-05'),
            ]
        )

    # Seed proposals
    if c.execute("SELECT COUNT(*) FROM proposals").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO proposals (policyNumber,client,cpf,insurer,type,seller,status,createdAt,notes,firstDueDate,pdfFilename,pdfOriginalName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                ('PROP-001','Roberto Farias','123.111.222-00','Porto Seguro','Automóvel','vendedor','Em elaboração','2026-05-28','Aguardando análise','2026-07-10',None,None),
                ('PROP-002','Beatriz Lemos','123.111.222-01','Allianz','Vida','vendedor','Em elaboração','2026-05-29','Enviar proposta','2026-07-15',None,None),
                ('PROP-003','Carlos Diniz','123.111.222-02','SulAmérica','Residencial','vendedor','Aguardando emissão','2026-05-30','Em análise emissão','2026-07-20',None,None),
                ('PROP-004','Maria Oliveira','123.111.222-03','Bradesco Seguros','Vida','vendedor','Devolvida','2026-06-01','Erro cadastral: CPF divergente do documento','2026-07-05',None,None),
            ]
        )

    # Seed sinistros
    if c.execute("SELECT COUNT(*) FROM sinistros").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO sinistros (policyNumber,client,cpf,insurer,type,status,openedAt,protocol,description,sinistroDate,avisoDate,oficina,seller,numeroSinistro,veiculoModelo,veiculoPlaca,tipoEnvolvido,isFinalizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                ('0009821-4','João Ferreira','123.456.789-00','Porto Seguro','Colisão','Em andamento','2026-05-02','PSB-2026-04821','Colisão traseira na Av. Brasil','2026-04-30','2026-05-01','Oficina Central Auto','vendedor','SIN-2026-001','Honda Civic','ABC-1234','segurado',0),
                ('0008216-7','Maria Santos','987.654.321-00','Allianz','Roubo','Aguardando vistoria','2026-04-28','ALZ-2026-02203','Furto de bagagem','2026-04-25','2026-04-26','Oficina Sul','vendedor','SIN-2026-002','Fiat Uno','XYZ-9999','terceiro',0),
            ]
        )
        rows = c.execute("SELECT id FROM sinistros").fetchall()
        if rows:
            c.executemany(
                "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
                [
                    (rows[0][0],'2026-05-02','Sinistro registrado','Patrícia Sinistro'),
                    (rows[0][0],'2026-05-05','Documentação solicitada','Patrícia Sinistro'),
                    (rows[0][0],'2026-05-09','Documentos recebidos','Patrícia Sinistro'),
                    (rows[1][0],'2026-04-28','Sinistro registrado','Patrícia Sinistro'),
                    (rows[1][0],'2026-04-30','Aguardando documentos do cliente','Patrícia Sinistro'),
                ]
            )

    db.commit()
    db.close()
    print("[INFO] Banco de dados inicializado com sucesso.")


# ─────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────
def get_user_by_token(token):
    if not token:
        return None
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    db_run("DELETE FROM sessions WHERE created_at <= ?", (cutoff,))
    return db_get(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id "
        "WHERE s.token=? AND s.created_at > ?",
        (token, cutoff)
    )


def auth_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-auth-token')
        user = get_user_by_token(token)
        if not user:
            return jsonify(message='Sessão expirada ou inválida.'), 401
        g.user = user
        return f(*args, **kwargs)
    return decorated


def roles_required(*allowed_roles):
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def wrapped(*args, **kwargs):
            token = request.headers.get('x-auth-token')
            user = get_user_by_token(token)
            if not user:
                return jsonify(message='Sessão expirada ou inválida.'), 401
            if user['role'] not in allowed_roles:
                return jsonify(message='Acesso negado.'), 403
            g.user = user
            return f(*args, **kwargs)
        return wrapped
    return decorator


def is_allowed_policy_access(user, policy):
    if not policy:
        return False
    if user['role'] in ('gestor', 'emissao'):
        return True
    if user['role'] == 'vendedor':
        return str(policy.get('seller') or '') == user['username']
    if user['role'] == 'sinistro':
        return True
    return False


def filter_policies_for_user(user, policies):
    if user['role'] in ('gestor', 'emissao'):
        return policies
    if user['role'] == 'vendedor':
        return [p for p in policies if str(p.get('seller') or '') == user['username']]
    if user['role'] == 'sinistro':
        return policies
    return []


def filter_sinistros_for_user(user, sinistros):
    if user['role'] in ('gestor', 'sinistro'):
        return sinistros
    if user['role'] == 'vendedor':
        return [s for s in sinistros if str(s.get('seller') or '') == user['username']]
    return []


# ─────────────────────────────────────────────
# Security helpers
# ─────────────────────────────────────────────
LOGIN_ATTEMPTS = {}
ALLOWED_SINISTRO_STATUS = {
    'Em andamento',
    'Aguardando vistoria',
    'Aguardando documentos',
    'Em análise',
    'Aguardando peças',
    'Em reparo',
    'Reparo concluído',
    'Finalizado',
}


def get_client_identifier():
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        try:
            return forwarded.split(',')[0].strip()
        except Exception:
            return forwarded.strip()
    return request.remote_addr or 'unknown'


def register_failed_login(username):
    key = f"{get_client_identifier()}:{str(username or '').strip().lower()}"
    now = datetime.now(timezone.utc).timestamp()
    attempts = LOGIN_ATTEMPTS.get(key, [])
    attempts = [ts for ts in attempts if now - ts < 300]
    attempts.append(now)
    LOGIN_ATTEMPTS[key] = attempts
    if len(attempts) >= 5:
        return True
    return False


def validate_sinistro_status(status):
    status = str(status or '').strip()
    if status not in ALLOWED_SINISTRO_STATUS:
        return None
    return status


# ─────────────────────────────────────────────
# Static files
# ─────────────────────────────────────────────
@app.route('/')
@app.route('/login')
def login_page():
    return send_from_directory('public', 'login.html')


@app.route('/app')
def app_page():
    return send_from_directory('public', 'index.html')


# ─────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────
@app.post('/api/login')
def api_login():
    data = request.json or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))

    if not username or not password:
        return jsonify(message='Credenciais inválidas.'), 400

    user = db_get("SELECT * FROM users WHERE username=?", (username,))
    if not user or not verify_password(user['password'], password):
        if register_failed_login(username):
            return jsonify(message='Muitas tentativas de login. Tente novamente em alguns minutos.'), 429
        return jsonify(message='Usuário ou senha incorretos.'), 401

    if not user['password'].startswith(('pbkdf2:', 'scrypt:', 'argon2:')):
        db_run("UPDATE users SET password=? WHERE id=?", (hash_password(password), user['id']))

    login_key = f"{get_client_identifier()}:{username.lower()}"
    LOGIN_ATTEMPTS.pop(login_key, None)

    db_run("DELETE FROM sessions WHERE user_id=?", (user['id'],))
    token = secrets.token_hex(32)
    db_run(
        "INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)",
        (token, user['id'], datetime.now(timezone.utc).isoformat())
    )
    print(f"[INFO] Login: {username} ({user['role']})")
    return jsonify(token=token, name=user['name'], role=user['role'])


@app.get('/api/me')
@auth_required
def api_me():
    u = g.user
    return jsonify(name=u['name'], role=u['role'], username=u['username'])


@app.get('/api/logout')
@auth_required
def api_logout():
    token = request.headers.get('x-auth-token')
    db_run("DELETE FROM sessions WHERE token=?", (token,))
    return jsonify(success=True)


@app.get('/api/overview')
@auth_required
def api_overview():
    u = g.user
    policies = db_all("SELECT * FROM policies LIMIT 200")
    sinistros = db_all("SELECT * FROM sinistros ORDER BY id DESC LIMIT 500")

    if u['role'] == 'gestor':
        leads = db_all("SELECT * FROM leads LIMIT 200")
        proposals = db_all("SELECT * FROM proposals LIMIT 200")
    elif u['role'] == 'vendedor':
        policies = filter_policies_for_user(u, policies)
        sinistros = filter_sinistros_for_user(u, sinistros)
        leads = db_all("SELECT * FROM leads WHERE owner=? LIMIT 200", (u['username'],))
        proposals = db_all("SELECT * FROM proposals WHERE seller=? LIMIT 200", (u['username'],))
    elif u['role'] == 'sinistro':
        policies = []
        leads = []
        proposals = []
        sinistros = filter_sinistros_for_user(u, sinistros)
    elif u['role'] == 'emissao':
        policies = []
        leads = []
        proposals = db_all("SELECT * FROM proposals LIMIT 200")
        sinistros = []
    else:
        policies = []
        leads = []
        proposals = []
        sinistros = []

    active = sum(1 for p in policies if p['status'] == 'Emitida')
    renewal = sum(1 for p in policies if p['status'] != 'Emitida')

    open_leads = sum(1 for l in leads if l['status'] not in ('Fechado', 'Não fechado', 'Convertido'))
    pending = sum(1 for p in proposals if p['status'] in ('Em elaboração', 'Aguardando emissão', 'Devolvida'))

    return jsonify(
        activePolicies=active,
        renewalPending=renewal,
        openLeads=open_leads,
        pendingProposals=pending,
        proposalsCreated=len(proposals),
        sinistrosAtivos=sum(1 for s in sinistros if not s.get('isFinalizado')),
        sinistrosFinalizados=sum(1 for s in sinistros if s.get('isFinalizado')),
        aguardandoVistoria=sum(1 for s in sinistros if s['status'] == 'Aguardando vistoria'),
        aguardandoDocumentos=sum(1 for s in sinistros if s['status'] == 'Aguardando documentos'),
        emReparo=sum(1 for s in sinistros if s['status'] == 'Em reparo'),
        emAnalise=sum(1 for s in sinistros if s['status'] == 'Em análise'),
        sinistrosRecentes=sinistros[:6]
    )


@app.get('/api/leads')
@auth_required
def api_leads():
    u = g.user
    if u['role'] == 'gestor':
        leads = db_all("SELECT * FROM leads ORDER BY id DESC LIMIT 200")
    elif u['role'] == 'vendedor':
        leads = db_all("SELECT * FROM leads WHERE owner=? ORDER BY id DESC LIMIT 200", (u['username'],))
    else:
        leads = []
    return jsonify(leads)


@app.post('/api/leads')
@auth_required
def api_create_lead():
    u = g.user
    if u['role'] != 'gestor':
        return jsonify(message='Apenas o gestor pode enviar indicações.'), 403

    data = request.json or {}
    client = str(data.get('client', '')).strip()
    phone = str(data.get('phone', '')).strip()
    owner = str(data.get('owner', 'vendedor')).strip()
    notes = str(data.get('notes', '')).strip()
    source = str(data.get('source', 'Indicação do gestor')).strip()

    if not client or not phone or not notes:
        return jsonify(message='Informe nome, telefone e descrição da indicação.'), 400

    seller = db_get("SELECT username FROM users WHERE username=? AND role='vendedor'", (owner,))
    if not seller:
        return jsonify(message='Vendedor não encontrado.'), 404

    created_at = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    lid = db_run(
        "INSERT INTO leads (client,phone,source,status,owner,notes,createdBy,createdAt) VALUES (?,?,?,?,?,?,?,?)",
        (client, phone, source, 'Novo', owner, notes, u['username'], created_at)
    )
    lead = db_get("SELECT * FROM leads WHERE id=?", (lid,))
    print(f"[INFO] Indicação enviada para {owner}: {client}")
    return jsonify(lead), 201


@app.put('/api/leads/<int:lid>/status')
@auth_required
def api_update_lead_status(lid):
    u = g.user
    lead = db_get("SELECT * FROM leads WHERE id=?", (lid,))
    if not lead:
        return jsonify(message='Indicação não encontrada.'), 404

    if u['role'] != 'gestor' and lead['owner'] != u['username']:
        return jsonify(message='Acesso negado.'), 403

    data = request.json or {}
    status = str(data.get('status', '')).strip()
    notes = str(data.get('notes', '')).strip()
    allowed = {'Novo', 'Em contato', 'Aguardando resposta', 'Em proposta', 'Fechado', 'Não fechado'}
    if status not in allowed:
        return jsonify(message='Status inválido.'), 400

    if notes:
        db_run("UPDATE leads SET status=?, notes=? WHERE id=?", (status, notes, lid))
    else:
        db_run("UPDATE leads SET status=? WHERE id=?", (status, lid))
    updated = db_get("SELECT * FROM leads WHERE id=?", (lid,))
    print(f"[INFO] Status da indicação {lid} atualizado para {status} por {u['username']}")
    return jsonify(updated)


@app.get('/api/propostas')
@auth_required
def api_propostas_get():
    u = g.user
    if u['role'] in ('gestor', 'emissao'):
        props = db_all(
            "SELECT * FROM proposals ORDER BY CASE WHEN firstDueDate IS NULL OR firstDueDate='' THEN 1 ELSE 0 END, firstDueDate ASC, id DESC LIMIT 200"
        )
    elif u['role'] == 'vendedor':
        props = db_all(
            "SELECT * FROM proposals WHERE seller=? ORDER BY CASE WHEN firstDueDate IS NULL OR firstDueDate='' THEN 1 ELSE 0 END, firstDueDate ASC, id DESC LIMIT 200",
            (u['username'],)
        )
    else:
        props = []
    return jsonify(props)


@app.get('/api/propostas/<int:pid>')
@auth_required
def api_proposta_details(pid):
    u = g.user
    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if not proposal_access_ok(u, prop):
        return jsonify(message='Acesso negado.'), 403
    history = db_all(
        "SELECT * FROM proposal_history WHERE proposal_id=? ORDER BY date DESC",
        (pid,)
    )
    return jsonify({**prop, 'history': history})


@app.get('/api/propostas/<int:pid>/pdf')
@auth_required
def api_proposta_pdf(pid):
    u = g.user
    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if not proposal_access_ok(u, prop):
        return jsonify(message='Acesso negado.'), 403
    if not prop.get('pdfFilename'):
        return jsonify(message='PDF da proposta não disponível.'), 404
    return send_from_directory(
        PROPOSTAS_UPLOAD,
        prop['pdfFilename'],
        as_attachment=False,
        download_name=prop.get('pdfOriginalName') or 'proposta.pdf'
    )


@app.post('/api/propostas')
@auth_required
def api_propostas_post():
    u = g.user
    if u['role'] != 'vendedor':
        return jsonify(message='Acesso negado.'), 403

    if request.content_type and 'multipart/form-data' in request.content_type:
        client = str(request.form.get('client', '')).strip()
        cpf = str(request.form.get('cpf', '')).strip()
        insurer = str(request.form.get('insurer', '')).strip()
        ptype = str(request.form.get('type', '')).strip()
        notes = str(request.form.get('notes', '')).strip()
        first_due = str(request.form.get('firstDueDate', '')).strip()
        start = str(request.form.get('start', '')).strip()
        end = str(request.form.get('end', '')).strip()
        pdf_file = request.files.get('pdf')
    else:
        data = request.json or {}
        client = str(data.get('client', '')).strip()
        cpf = str(data.get('cpf', '')).strip()
        insurer = str(data.get('insurer', '')).strip()
        ptype = str(data.get('type', '')).strip()
        notes = str(data.get('notes', '')).strip()
        first_due = str(data.get('firstDueDate', '')).strip()
        start = str(data.get('start', '')).strip()
        end = str(data.get('end', '')).strip()
        pdf_file = None

    if not client or not cpf or not insurer or not ptype:
        return jsonify(message='Informe cliente, CPF, seguradora e tipo de seguro.'), 400

    pdf_filename, pdf_original = None, None
    if pdf_file and pdf_file.filename:
        try:
            pdf_filename, pdf_original = save_pdf_upload(pdf_file, PROPOSTAS_UPLOAD, 'prop')
        except ValueError as e:
            return jsonify(message=str(e)), 400

    import time
    policy_number = f"PROP-{int(time.time())}"
    created_at = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    lid = db_run(
        """INSERT INTO proposals (policyNumber,client,cpf,insurer,type,seller,status,createdAt,notes,firstDueDate,start,end,pdfFilename,pdfOriginalName)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (policy_number, client, cpf, insurer, ptype, u['username'], 'Em elaboração', created_at, notes, first_due or None, start or None, end or None, pdf_filename, pdf_original)
    )
    log_proposal_history(lid, 'Proposta criada', u['name'])
    prop = db_get("SELECT * FROM proposals WHERE id=?", (lid,))
    print(f"[INFO] Proposta criada: {policy_number} por {u['username']}")
    return jsonify(prop), 201


@app.put('/api/propostas/<int:pid>')
@auth_required
def api_proposta_update(pid):
    """Vendedor corrige proposta devolvida."""
    u = g.user
    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if u['role'] != 'vendedor' or prop['seller'] != u['username']:
        return jsonify(message='Acesso negado.'), 403
    if prop['status'] not in ('Devolvida', 'Em elaboração'):
        return jsonify(message='Somente propostas em elaboração ou devolvidas podem ser editadas.'), 400

    if request.content_type and 'multipart/form-data' in request.content_type:
        client = str(request.form.get('client', prop['client'] or '')).strip()
        cpf = str(request.form.get('cpf', prop['cpf'] or '')).strip()
        insurer = str(request.form.get('insurer', prop['insurer'] or '')).strip()
        ptype = str(request.form.get('type', prop['type'] or '')).strip()
        notes = str(request.form.get('notes', prop['notes'] or '')).strip()
        first_due = str(request.form.get('firstDueDate', prop['firstDueDate'] or '')).strip()
        start = str(request.form.get('start', prop.get('start') or '')).strip()
        end = str(request.form.get('end', prop.get('end') or '')).strip()
        pdf_file = request.files.get('pdf')
    else:
        data = request.json or {}
        client = str(data.get('client', prop['client'] or '')).strip()
        cpf = str(data.get('cpf', prop['cpf'] or '')).strip()
        insurer = str(data.get('insurer', prop['insurer'] or '')).strip()
        ptype = str(data.get('type', prop['type'] or '')).strip()
        notes = str(data.get('notes', prop['notes'] or '')).strip()
        first_due = str(data.get('firstDueDate', prop['firstDueDate'] or '')).strip()
        start = str(data.get('start', prop.get('start') or '')).strip()
        end = str(data.get('end', prop.get('end') or '')).strip()
        pdf_file = None

    pdf_filename = prop.get('pdfFilename')
    pdf_original = prop.get('pdfOriginalName')
    if pdf_file and pdf_file.filename:
        try:
            pdf_filename, pdf_original = save_pdf_upload(pdf_file, PROPOSTAS_UPLOAD, f'prop{pid}')
        except ValueError as e:
            return jsonify(message=str(e)), 400

    db_run(
        """UPDATE proposals SET client=?, cpf=?, insurer=?, type=?, notes=?, firstDueDate=?, start=?, end=?,
           pdfFilename=?, pdfOriginalName=? WHERE id=?""",
        (client, cpf, insurer, ptype, notes, first_due or None, start or None, end or None, pdf_filename, pdf_original, pid)
    )
    event = 'Proposta corrigida' if prop['status'] == 'Devolvida' else 'Proposta atualizada'
    log_proposal_history(pid, event, u['name'])
    updated = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    return jsonify(updated)


@app.post('/api/propostas/<int:pid>/send')
@auth_required
def api_proposta_send(pid):
    u = g.user
    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if u['role'] != 'vendedor' or prop['seller'] != u['username']:
        return jsonify(message='Acesso negado.'), 403
    if prop['status'] not in ('Em elaboração', 'Devolvida'):
        return jsonify(message='Proposta não pode ser enviada neste status.'), 400

    was_devolvida = prop['status'] == 'Devolvida'
    db_run("UPDATE proposals SET status=? WHERE id=?", ('Aguardando emissão', pid))
    log_proposal_history(pid, 'Proposta reenviada para emissão' if was_devolvida else 'Proposta enviada para emissão', u['name'])
    updated = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    print(f"[INFO] Proposta {pid} enviada para emissão por {u['username']}")
    return jsonify(updated)


@app.post('/api/propostas/<int:pid>/emit')
@auth_required
def api_proposta_emit(pid):
    """Emissão anexa PDF da apólice e marca como Emitida."""
    u = g.user
    if u['role'] not in ('emissao', 'gestor'):
        return jsonify(message='Acesso negado.'), 403

    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if prop['status'] != 'Aguardando emissão':
        return jsonify(message='Proposta não está aguardando emissão.'), 400

    policy_number = str(request.form.get('policyNumber', '') or prop.get('policyNumber') or '').strip()
    pdf_file = request.files.get('pdf')
    if not policy_number:
        return jsonify(message='Informe o número da apólice.'), 400
    if not pdf_file or not pdf_file.filename:
        return jsonify(message='Anexe o PDF da apólice emitida no portal da seguradora.'), 400

    existing = db_get("SELECT id FROM policies WHERE number=?", (policy_number,))
    if existing:
        return jsonify(message='Número da apólice já existe no cadastro. Escolha outro número para a emissão.'), 400

    try:
        pdf_filename, pdf_original = save_pdf_upload(pdf_file, POLICIES_UPLOAD, f'pol{pid}')
    except ValueError as e:
        return jsonify(message=str(e)), 400

    start = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    end = (datetime.now(timezone.utc) + timedelta(days=365)).strftime('%Y-%m-%d')

    db_run(
        """INSERT INTO policies (number,client,cpf,insurer,type,start,end,premium,status,seller,pdfFilename,pdfOriginalName)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (policy_number, prop['client'], prop.get('cpf'), prop['insurer'], prop['type'], start, end, 0, 'Emitida', prop['seller'], pdf_filename, pdf_original)
    )

    db_run("UPDATE proposals SET status=?, policyNumber=? WHERE id=?", ('Emitida', policy_number, pid))
    log_proposal_history(pid, f'Apólice {policy_number} anexada — status Emitida', u['name'])
    updated = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    print(f"[INFO] Proposta {pid} emitida: {policy_number} por {u['username']}")
    return jsonify(updated)


@app.post('/api/propostas/<int:pid>/approve')
@auth_required
def api_approve(pid):
    """Legado — redireciona fluxo para emit com aviso."""
    return jsonify(message='Use o fluxo de emissão: anexe o PDF da apólice e informe o número.'), 400


@app.post('/api/propostas/<int:pid>/reject')
@auth_required
def api_reject(pid):
    u = g.user
    if u['role'] not in ('emissao', 'gestor'):
        return jsonify(message='Acesso negado.'), 403

    prop = db_get("SELECT * FROM proposals WHERE id=?", (pid,))
    if not prop:
        return jsonify(message='Proposta não encontrada.'), 404
    if prop['status'] != 'Aguardando emissão':
        return jsonify(message='Somente propostas aguardando emissão podem ser devolvidas.'), 400

    data = request.json or {}
    reason = str(data.get('reason', '')).strip()
    notes_extra = str(data.get('notes', '')).strip()
    allowed = {
        'Pagamento recusado', 'Vistoria pendente', 'Documentação incompleta',
        'Erro cadastral', 'Outros'
    }
    if reason and reason not in allowed:
        return jsonify(message='Motivo de devolução inválido.'), 400

    if reason:
        notes = f"{reason}" + (f": {notes_extra}" if notes_extra else '')
    else:
        notes = notes_extra or 'Devolvida pela emissão'

    db_run("UPDATE proposals SET status=?, notes=? WHERE id=?", ('Devolvida', notes, pid))
    log_proposal_history(pid, f'Proposta devolvida — {notes}', u['name'])
    print(f"[INFO] Proposta devolvida: {prop['policyNumber']} por {u['username']}")
    return jsonify({**prop, 'status': 'Devolvida', 'notes': notes})


@app.get('/api/renovacoes')
@auth_required
def api_renovacoes():
    u = g.user
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')
    month_start = now.strftime('%Y-%m-01')
    if now.month == 12:
        month_end = f"{now.year}-12-31"
    else:
        next_month = datetime(now.year, now.month + 1, 1)
        month_end = (next_month - timedelta(days=1)).strftime('%Y-%m-%d')

    due_window_start = today
    due_window_end = (now + timedelta(days=45)).strftime('%Y-%m-%d')

    if u['role'] == 'gestor':
        pending = db_all(
            """SELECT * FROM policies
               WHERE (
                   status IN ('Renovar', 'Renovação solicitada')
                   OR (
                       status NOT IN ('Não renovada','Fechado','Finalizado')
                       AND end IS NOT NULL
                       AND end >= ? AND end <= ?
                   )
               )
               ORDER BY end ASC LIMIT 200""",
            (due_window_start, due_window_end)
        )
        not_renewed = db_all(
            "SELECT * FROM policies WHERE status='Não renovada' ORDER BY end DESC LIMIT 200"
        )
    elif u['role'] == 'vendedor':
        pending = db_all(
            """SELECT * FROM policies
               WHERE seller=? AND (
                   status IN ('Renovar', 'Renovação solicitada')
                   OR (
                       status NOT IN ('Não renovada','Fechado','Finalizado')
                       AND end IS NOT NULL
                       AND end >= ? AND end <= ?
                   )
               )
               ORDER BY end ASC LIMIT 200""",
            (u['username'], due_window_start, due_window_end)
        )
        not_renewed = db_all(
            "SELECT * FROM policies WHERE seller=? AND status='Não renovada' ORDER BY end DESC LIMIT 200",
            (u['username'],)
        )
    else:
        pending = []
        not_renewed = []
    return jsonify({'pending': pending, 'notRenewed': not_renewed})


@app.get('/api/apolices')
@auth_required
def api_apolices():
    u = g.user
    search = request.args.get('search', '').strip().lower()
    if search:
        q = f"%{search}%"
        rows = db_all(
            """SELECT * FROM policies
               WHERE lower(number) LIKE ? OR lower(client) LIKE ? OR lower(insurer) LIKE ?
                  OR lower(COALESCE(cpf,'')) LIKE ?
               ORDER BY id DESC LIMIT 200""",
            (q, q, q, q)
        )
    else:
        rows = db_all("SELECT * FROM policies ORDER BY id DESC LIMIT 200")

    if u['role'] == 'vendedor':
        rows = filter_policies_for_user(u, rows)
    elif u['role'] == 'sinistro':
        if not search:
            rows = []
    return jsonify(rows)


@app.get('/api/apolices/<int:pid>')
@auth_required
def api_apolice_details(pid):
    u = g.user
    policy = db_get('SELECT * FROM policies WHERE id=?', (pid,))
    if not policy:
        return jsonify(message='Apólice não encontrada.'), 404
    if not is_allowed_policy_access(u, policy):
        return jsonify(message='Acesso negado.'), 403
    return jsonify(policy)


@app.put('/api/apolices/<int:pid>/status')
@auth_required
def api_policy_status(pid):
    u = g.user
    if u['role'] not in ('gestor', 'vendedor'):
        return jsonify(message='Acesso negado.'), 403

    policy = db_get('SELECT * FROM policies WHERE id=?', (pid,))
    if not policy:
        return jsonify(message='Apólice não encontrada.'), 404
    if u['role'] == 'vendedor' and policy.get('seller') != u['username']:
        return jsonify(message='Acesso negado.'), 403

    data = request.json or {}
    status = str(data.get('status', '')).strip()
    allowed = {'Emitida', 'Renovar', 'Renovação solicitada', 'Não renovada', 'Finalizado', 'Fechado'}
    if status not in allowed:
        return jsonify(message='Status inválido.'), 400

    notes = str(data.get('notes', policy.get('notes') or '')).strip()
    return_reason = str(data.get('returnReason', policy.get('returnReason') or notes or '')).strip()
    if status == 'Renovação solicitada':
        phone = str(data.get('phone', policy.get('phone') or '')).strip()
        end_date = str(data.get('end', policy.get('end') or '')).strip()
        if not phone:
            return jsonify(message='Informe telefone para a renovação.'), 400
        if not end_date:
            return jsonify(message='Informe a final de vigência para a renovação.'), 400
        db_run('UPDATE policies SET status=?, phone=?, end=?, returnReason=?, notes=? WHERE id=?', (status, phone, end_date, '', notes, pid))
    elif status == 'Não renovada':
        if not return_reason:
            return jsonify(message='Informe o motivo para não renovada.'), 400
        db_run('UPDATE policies SET status=?, notes=?, returnReason=? WHERE id=?', (status, notes or return_reason, return_reason, pid))
    else:
        if notes:
            db_run('UPDATE policies SET status=?, notes=?, returnReason=? WHERE id=?', (status, notes, return_reason or '', pid))
        else:
            db_run('UPDATE policies SET status=?, returnReason=? WHERE id=?', (status, return_reason or '', pid))

    updated = db_get('SELECT * FROM policies WHERE id=?', (pid,))
    print(f"[INFO] Apólice {pid} atualizada para status {status} por {u['username']}")
    return jsonify(updated)


def build_simple_pdf(title, lines):
    """Gera um PDF simples sem dependencias externas."""
    def clean(text):
        return str(text or '').replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    y = 780
    content = ["BT", "/F1 18 Tf", f"72 {y} Td", f"({clean(title)}) Tj"]
    y -= 34
    content.extend(["/F1 11 Tf"])
    for line in lines:
        content.append(f"72 {y} Td")
        content.append(f"({clean(line)}) Tj")
        y -= 18
    content.append("ET")

    stream = "\n".join(content).encode('latin-1', errors='replace')
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return bytes(pdf)


@app.post('/api/apolices/<int:pid>/upload')
@auth_required
def api_policy_upload(pid):
    """Anexa PDF à apólice. Se phone+end+seller forem enviados, marca como Renovação solicitada."""
    u = g.user
    if u['role'] not in ('gestor', 'vendedor', 'emissao'):
        return jsonify(message='Acesso negado.'), 403

    policy = db_get("SELECT * FROM policies WHERE id=?", (pid,))
    if not policy:
        return jsonify(message='Apólice não encontrada.'), 404
    if u['role'] == 'vendedor' and policy.get('seller') != u['username']:
        return jsonify(message='Acesso negado.'), 403

    pdf_file = request.files.get('pdf')
    if not pdf_file or not pdf_file.filename:
        return jsonify(message='Anexe o PDF da apólice.'), 400

    phone = str(request.form.get('phone', '')).strip()
    end_date = str(request.form.get('end', '')).strip()
    seller = str(request.form.get('seller', '')).strip()

    is_renewal = bool(phone or end_date or seller)

    if is_renewal:
        if not phone:
            return jsonify(message='Informe telefone para a renovação.'), 400
        if not end_date:
            return jsonify(message='Informe a final de vigência para a renovação.'), 400
        if u['role'] == 'vendedor':
            return jsonify(message='Vendedor não pode reatribuir apólice nem alterar o vendedor no upload.'), 403
        if not seller:
            return jsonify(message='Informe o vendedor para enviar a renovação.'), 400
        seller_user = db_get("SELECT username FROM users WHERE username=? AND role='vendedor'", (seller,))
        if not seller_user:
            return jsonify(message='Vendedor inválido.'), 400

    try:
        pdf_filename, pdf_original = save_pdf_upload(pdf_file, POLICIES_UPLOAD, f'pol{pid}')
    except ValueError as e:
        return jsonify(message=str(e)), 400

    if is_renewal:
        db_run('UPDATE policies SET pdfFilename=?, pdfOriginalName=?, status=?, phone=?, end=?, seller=? WHERE id=?',
               (pdf_filename, pdf_original, 'Renovação solicitada', phone, end_date, seller, pid))
        print(f"[INFO] PDF da apólice {pid} anexado e renovação solicitada por {u['username']} para vendedor {seller}")
    else:
        db_run('UPDATE policies SET pdfFilename=?, pdfOriginalName=? WHERE id=?',
               (pdf_filename, pdf_original, pid))
        print(f"[INFO] PDF da apólice {pid} anexado por {u['username']}")

    updated = db_get('SELECT * FROM policies WHERE id=?', (pid,))
    return jsonify(updated)


@app.post('/api/renovacoes')
@auth_required
def api_create_renewal():
    """Permite ao gestor criar uma renovação mesmo sem ter uma apólice existente."""
    u = g.user
    if u['role'] != 'gestor':
        return jsonify(message='Acesso negado.'), 403

    pdf_file = request.files.get('pdf')
    if not pdf_file or not pdf_file.filename:
        return jsonify(message='Anexe o PDF da apólice.'), 400

    client = str(request.form.get('client', '')).strip()
    cpf = str(request.form.get('cpf', '')).strip()
    insurer = str(request.form.get('insurer', '')).strip()
    ptype = str(request.form.get('type', 'Desconhecido')).strip()
    phone = str(request.form.get('phone', '')).strip()
    start_date = str(request.form.get('start', '')).strip()
    end_date = str(request.form.get('end', '')).strip()
    seller = str(request.form.get('seller', '')).strip()

    if not client or not cpf or not insurer:
        return jsonify(message='Informe cliente, CPF e seguradora.'), 400
    if not phone:
        return jsonify(message='Informe telefone para a renovação.'), 400
    if not start_date:
        return jsonify(message='Informe o início da vigência para a renovação.'), 400
    if not end_date:
        return jsonify(message='Informe a final de vigência para a renovação.'), 400
    if not seller:
        return jsonify(message='Informe o vendedor para enviar a renovação.'), 400

    seller_user = db_get("SELECT username FROM users WHERE username=? AND role='vendedor'", (seller,))
    if not seller_user:
        return jsonify(message='Vendedor inválido.'), 400

    try:
        pdf_filename, pdf_original = save_pdf_upload(pdf_file, POLICIES_UPLOAD, f'ren{int(datetime.now(timezone.utc).timestamp())}')
    except ValueError as e:
        return jsonify(message=str(e)), 400

    # Gerar número temporário único
    import time
    number = f"REN-{int(time.time())}"
    start = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    premium = 0

    pid = db_run(
        "INSERT INTO policies (number,client,cpf,insurer,type,start,end,premium,status,seller,phone,pdfFilename,pdfOriginalName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (number, client, cpf, insurer, ptype, start_date, end_date, premium, 'Renovação solicitada', seller, phone, pdf_filename, pdf_original)
    )
    created = db_get('SELECT * FROM policies WHERE id=?', (pid,))
    print(f"[INFO] Renovação criada pelo gestor {u['username']} para vendedor {seller}: apólice {number}")
    return jsonify(created), 201


@app.get('/api/vendedores')
@auth_required
def api_vendedores():
    sellers = db_all("SELECT username, name FROM users WHERE role='vendedor'")
    return jsonify(sellers)


@app.get('/api/apolices/<int:pid>/pdf')
@auth_required
def api_policy_pdf(pid):
    u = g.user
    policy = db_get("SELECT * FROM policies WHERE id=?", (pid,))
    if not policy:
        return jsonify(message='Apolice nao encontrada.'), 404
    if not is_allowed_policy_access(u, policy):
        return jsonify(message='Acesso negado.'), 403

    if policy.get('pdfFilename'):
        return send_from_directory(
            POLICIES_UPLOAD,
            policy['pdfFilename'],
            as_attachment=True,
            download_name=policy.get('pdfOriginalName') or f"apolice-{policy['number']}.pdf"
        )

    lines = [
        f"Apolice: {policy['number']}",
        f"Cliente: {policy['client']}",
        f"CPF: {policy.get('cpf') or '-'}",
        f"Seguradora: {policy['insurer']}",
        f"Tipo: {policy['type']}",
        f"Inicio de vigencia: {policy['start']}",
        f"Fim de vigencia: {policy['end']}",
        f"Premio: R$ {float(policy['premium'] or 0):.2f}",
        f"Status: {policy['status']}",
        f"Vendedor responsavel: {policy['seller']}",
        "",
        "Documento gerado pelo sistema interno SeguraTech.",
        "Anexe o PDF real da apolice emitida no portal da seguradora.",
    ]
    pdf = build_simple_pdf("SeguraTech - Apolice de Seguro", lines)
    filename = f"apolice-{policy['number']}.pdf".replace('/', '-').replace('\\', '-')
    return Response(
        pdf,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


@app.get('/api/sinistros')
@auth_required
def api_sinistros_get():
    u = g.user
    if u['role'] not in ('gestor', 'sinistro', 'vendedor'):
        return jsonify(message='Acesso negado.'), 403
    if u['role'] == 'emissao':
        return jsonify(message='Acesso negado.'), 403
    # Parâmetro opcional para filtrar finalizados
    show_finalized = request.args.get('finalized', 'false').lower() == 'true'
    
    if show_finalized:
        rows = db_all("SELECT * FROM sinistros WHERE isFinalizado=1 ORDER BY finalizadoAt DESC LIMIT 200")
    else:
        rows = db_all("SELECT * FROM sinistros WHERE isFinalizado=0 ORDER BY id DESC LIMIT 200")

    if u['role'] == 'vendedor':
        rows = filter_sinistros_for_user(u, rows)
    
    return jsonify(rows)


@app.post('/api/sinistros')
@auth_required
def api_sinistros_post():
    u = g.user
    if u['role'] != 'sinistro':
        return jsonify(message='Acesso negado.'), 403

    data = request.json or {}
    policy_number = str(data.get('policyNumber', '')).strip()
    client        = str(data.get('client', '')).strip()
    cpf           = str(data.get('cpf', '')).strip()
    insurer       = str(data.get('insurer', '')).strip()
    stype         = str(data.get('type', '')).strip()
    description   = str(data.get('description', '')).strip()
    sinistro_date = str(data.get('sinistroDate', '')).strip()
    aviso_date    = str(data.get('avisoDate', '')).strip()
    oficina       = str(data.get('oficina', '')).strip()
    numero_sinistro = str(data.get('numeroSinistro', '')).strip()
    veiculo_modelo = str(data.get('veiculoModelo', '')).strip()
    veiculo_placa = str(data.get('veiculoPlaca', '')).strip()
    tipo_envolvido = str(data.get('tipoEnvolvido', 'segurado')).strip()
    raw_status = data.get('status', 'Em andamento')
    status = validate_sinistro_status(raw_status)
    if status is None:
        return jsonify(message='Status inválido para sinistro.'), 400
    is_terceiro = tipo_envolvido == 'terceiro'

    if is_terceiro:
        if not client or not numero_sinistro:
            return jsonify(message='Informe nome e número do sinistro do terceiro.'), 400
        policy_number = policy_number or 'TERCEIRO'
        insurer = insurer or 'N/A'
        stype = stype or 'Terceiro'
    else:
        if not policy_number or not client or not insurer or not stype:
            return jsonify(message='Dados inválidos.'), 400
        if not db_get("SELECT 1 FROM policies WHERE number=?", (policy_number,)):
            return jsonify(message='A apólice informada não existe no cadastro.'), 400

    # Buscar o vendedor da apólice
    policy = db_get("SELECT seller FROM policies WHERE number=?", (policy_number,)) if not is_terceiro else None
    seller = policy['seller'] if policy else (u['username'] if is_terceiro else 'N/A')

    import random
    opened_at = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    protocol = f"{insurer[:3].upper()}-{datetime.now(timezone.utc).year}-{10000 + random.randint(0,89999)}"

    sid = db_run(
        "INSERT INTO sinistros (policyNumber,client,cpf,insurer,type,status,openedAt,protocol,description,sinistroDate,avisoDate,oficina,seller,numeroSinistro,veiculoModelo,veiculoPlaca,tipoEnvolvido,isFinalizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (policy_number, client, cpf, insurer, stype, status, opened_at, protocol, description, sinistro_date, aviso_date, oficina, seller, numero_sinistro, veiculo_modelo, veiculo_placa, tipo_envolvido, 0)
    )
    db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, opened_at, 'Sinistro registrado', u['name'])
    )

    claim = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    print(f"[INFO] Sinistro registrado: {protocol} por {u['username']}")
    return jsonify(claim), 201


@app.get('/api/chart/sinistros')
@auth_required
def api_chart():
    u = g.user
    if u['role'] not in ('gestor', 'sinistro', 'vendedor'):
        return jsonify(message='Acesso negado.'), 403

    rows = db_all("SELECT openedAt, seller FROM sinistros ORDER BY openedAt DESC LIMIT 365")
    if u['role'] == 'vendedor':
        rows = [r for r in rows if str(r.get('seller') or '') == u['username']]
    counts = {}
    for r in rows:
        month = r['openedAt'][:7]
        counts[month] = counts.get(month, 0) + 1

    result = [{'month': m, 'value': v} for m, v in sorted(counts.items())][-12:]
    return jsonify(result)


@app.get('/api/sinistros/<int:sid>')
@auth_required
def api_sinistro_details(sid):
    """Retorna detalhes completos do sinistro incluindo histórico e anexos"""
    u = g.user
    if u['role'] not in ('gestor', 'sinistro', 'vendedor'):
        return jsonify(message='Acesso negado.'), 403
    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404
    if u['role'] == 'vendedor' and str(sinistro.get('seller') or '') != u['username']:
        return jsonify(message='Acesso negado.'), 403

    history = db_all(
        "SELECT * FROM sinistro_history WHERE sinistro_id=? ORDER BY date DESC",
        (sid,)
    )
    
    attachments = db_all(
        "SELECT * FROM sinistro_attachments WHERE sinistro_id=? ORDER BY uploadedAt DESC",
        (sid,)
    )
    
    # Buscar nome do vendedor
    seller_name = 'N/A'
    if sinistro.get('seller'):
        seller = db_get("SELECT name FROM users WHERE username=?", (sinistro['seller'],))
        if seller:
            seller_name = seller['name']
    
    return jsonify({
        **sinistro,
        'sellerName': seller_name,
        'history': history,
        'attachments': attachments
    })


@app.put('/api/sinistros/<int:sid>')
@auth_required
def api_update_sinistro(sid):
    """Edita dados principais do sinistro"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403

    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404

    data = request.json or {}
    fields = {
        'client': str(data.get('client', sinistro['client'] or '')).strip(),
        'cpf': str(data.get('cpf', sinistro['cpf'] or '')).strip(),
        'type': str(data.get('type', sinistro['type'] or '')).strip(),
        'description': str(data.get('description', sinistro['description'] or '')).strip(),
        'sinistroDate': str(data.get('sinistroDate', sinistro['sinistroDate'] or '')).strip(),
        'avisoDate': str(data.get('avisoDate', sinistro['avisoDate'] or '')).strip(),
        'oficina': str(data.get('oficina', sinistro['oficina'] or '')).strip(),
        'numeroSinistro': str(data.get('numeroSinistro', sinistro['numeroSinistro'] or '')).strip(),
        'veiculoModelo': str(data.get('veiculoModelo', sinistro['veiculoModelo'] or '')).strip(),
        'veiculoPlaca': str(data.get('veiculoPlaca', sinistro['veiculoPlaca'] or '')).strip(),
    }

    if not fields['client'] or not fields['numeroSinistro']:
        return jsonify(message='Informe pelo menos nome e número do sinistro.'), 400

    db_run(
        """
        UPDATE sinistros
        SET client=?, cpf=?, type=?, description=?, sinistroDate=?, avisoDate=?,
            oficina=?, numeroSinistro=?, veiculoModelo=?, veiculoPlaca=?
        WHERE id=?
        """,
        (
            fields['client'], fields['cpf'], fields['type'], fields['description'],
            fields['sinistroDate'], fields['avisoDate'], fields['oficina'],
            fields['numeroSinistro'], fields['veiculoModelo'], fields['veiculoPlaca'], sid
        )
    )
    db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'), 'Dados do sinistro editados', u['name'])
    )
    return jsonify(db_get("SELECT * FROM sinistros WHERE id=?", (sid,)))


@app.delete('/api/sinistros/<int:sid>')
@auth_required
def api_delete_sinistro(sid):
    """Exclui um sinistro cadastrado por erro ou cancelamento"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403

    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404

    db_run("DELETE FROM sinistro_history WHERE sinistro_id=?", (sid,))
    db_run("DELETE FROM sinistro_attachments WHERE sinistro_id=?", (sid,))
    db_run("DELETE FROM sinistros WHERE id=?", (sid,))
    print(f"[INFO] Sinistro {sid} excluído por {u['username']}")
    return jsonify(success=True)


@app.route('/api/sinistros/<int:sid>/history', methods=['POST'])
@auth_required
def api_add_history(sid):
    """Adiciona um evento ao histórico do sinistro"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403
    
    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404
    
    data = request.json or {}
    event = str(data.get('event', '')).strip()
    
    if not event:
        return jsonify(message='Evento não pode estar vazio.'), 400
    
    event_date = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    
    hid = db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, event_date, event, u['name'])
    )
    
    history_item = db_get("SELECT * FROM sinistro_history WHERE id=?", (hid,))
    print(f"[INFO] Andamento adicionado ao sinistro {sid} por {u['username']}")
    return jsonify(history_item), 201


@app.route('/api/sinistros/<int:sid>/attachments', methods=['POST'])
@auth_required
def api_add_attachment(sid):
    """Adiciona um anexo ao sinistro"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403
    
    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404
    
    if 'file' not in request.files:
        return jsonify(message='Nenhum arquivo enviado.'), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify(message='Nenhum arquivo selecionado.'), 400
    
    # Criar pasta de uploads se não existir
    upload_folder = os.path.join(os.path.dirname(__file__), 'uploads', 'sinistros')
    os.makedirs(upload_folder, exist_ok=True)
    
    # Gerar nome único para o arquivo
    import time
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{sid}_{int(time.time())}_{secrets.token_hex(8)}{file_extension}"
    file_path = os.path.join(upload_folder, unique_filename)
    
    file.save(file_path)
    
    uploaded_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    
    aid = db_run(
        "INSERT INTO sinistro_attachments (sinistro_id,filename,originalName,fileType,uploadedAt,uploadedBy) VALUES (?,?,?,?,?,?)",
        (sid, unique_filename, file.filename, file.content_type, uploaded_at, u['name'])
    )
    
    attachment = db_get("SELECT * FROM sinistro_attachments WHERE id=?", (aid,))
    db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, uploaded_at, f'Documento anexado: {file.filename}', u['name'])
    )
    print(f"[INFO] Anexo adicionado ao sinistro {sid} por {u['username']}: {file.filename}")
    return jsonify(attachment), 201


@app.get('/api/sinistros/<int:sid>/attachments/<int:aid>/download')
@auth_required
def api_download_attachment(sid, aid):
    """Faz download de um anexo"""
    u = g.user
    if u['role'] not in ('gestor', 'sinistro', 'vendedor'):
        return jsonify(message='Acesso negado.'), 403

    attachment = db_get(
        "SELECT * FROM sinistro_attachments WHERE id=? AND sinistro_id=?",
        (aid, sid)
    )
    
    if not attachment:
        return jsonify(message='Anexo não encontrado.'), 404

    if u['role'] == 'vendedor':
        sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
        if not sinistro or str(sinistro.get('seller') or '') != u['username']:
            return jsonify(message='Acesso negado.'), 403
    
    upload_folder = os.path.join(os.path.dirname(__file__), 'uploads', 'sinistros')
    return send_from_directory(upload_folder, attachment['filename'], as_attachment=True, download_name=attachment['originalName'])


@app.route('/api/sinistros/<int:sid>/status', methods=['PUT'])
@auth_required
def api_update_status(sid):
    """Atualiza o status do sinistro"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403
    
    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404
    
    data = request.json or {}
    new_status = validate_sinistro_status(data.get('status', ''))

    if not new_status:
        return jsonify(message='Status inválido ou não permitido para este fluxo.'), 400

    if sinistro['isFinalizado'] and new_status != 'Finalizado':
        return jsonify(message='Sinistro finalizado não pode retornar para outro status.'), 400

    db_run("UPDATE sinistros SET status=? WHERE id=?", (new_status, sid))
    if new_status == 'Finalizado':
        db_run("UPDATE sinistros SET isFinalizado=1, finalizadoAt=?, finalizadoBy=? WHERE id=?", (datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S'), u['name'], sid))
    
    # Adicionar ao histórico
    event_date = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, event_date, f'Status alterado para: {new_status}', u['name'])
    )
    
    updated = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    print(f"[INFO] Status do sinistro {sid} atualizado para '{new_status}' por {u['username']}")
    return jsonify(updated)


@app.route('/api/sinistros/<int:sid>/finalize', methods=['PUT'])
@auth_required
def api_finalizar_sinistro(sid):
    """Finaliza o sinistro"""
    u = g.user
    if u['role'] not in ('sinistro', 'gestor'):
        return jsonify(message='Acesso negado.'), 403
    
    sinistro = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    if not sinistro:
        return jsonify(message='Sinistro não encontrado.'), 404
    
    if sinistro['isFinalizado']:
        return jsonify(message='Sinistro já está finalizado.'), 400
    
    finalized_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    
    db_run(
        "UPDATE sinistros SET isFinalizado=1, status='Finalizado', finalizadoAt=?, finalizadoBy=? WHERE id=?",
        (finalized_at, u['name'], sid)
    )
    
    # Adicionar ao histórico
    db_run(
        "INSERT INTO sinistro_history (sinistro_id,date,event,actor) VALUES (?,?,?,?)",
        (sid, finalized_at, 'Sinistro finalizado', u['name'])
    )
    
    updated = db_get("SELECT * FROM sinistros WHERE id=?", (sid,))
    print(f"[INFO] Sinistro {sid} finalizado por {u['username']}")
    return jsonify(updated)


# ─────────────────────────────────────────────
# Segu — Assistente IA
# ─────────────────────────────────────────────
@app.post('/api/chat')
@auth_required
def api_chat():
    import urllib.request as urllib_req
    import urllib.error
    import socket

    api_key = os.environ.get('OPENROUTER_API_KEY', '').strip()
    if not api_key:
        return jsonify(erro='OPENROUTER_API_KEY não configurada no servidor.'), 503

    model = os.environ.get('OPENROUTER_MODEL', 'openai/gpt-oss-120b')
    app_url = os.environ.get('APP_URL', 'http://localhost:3000')

    data = request.json or {}
    pergunta = str(data.get('pergunta', '')).strip()
    historico_raw = data.get('historico', [])

    if not pergunta:
        return jsonify(erro='A pergunta não pode estar vazia.'), 400
    if len(pergunta) > 800:
        return jsonify(erro='Limite de 800 caracteres por pergunta.'), 400

    # Sanitizar histórico: apenas role user/assistant, content str, max 1000 chars, últimos 20
    historico = []
    if isinstance(historico_raw, list):
        for item in historico_raw:
            if not isinstance(item, dict):
                continue
            role = item.get('role', '')
            content = item.get('content', '')
            if role not in ('user', 'assistant') or not isinstance(content, str):
                continue
            historico.append({'role': role, 'content': content[:1000]})
    historico = historico[-20:]

    u = g.user
    role_label = {
        'vendedor': 'Vendedor/Corretor',
        'emissao': 'Analista de Emissão',
        'sinistro': 'Analista de Sinistro',
        'gestor': 'Gestor da Corretora'
    }.get(u['role'], u['role'])

    system_prompt = f"""Voce e Segu, o assistente virtual interno da corretora SeguraTech.

O usuario atual e {u['name']}, com perfil de {role_label}. Ele ja entende o basico do mercado de seguros.

Sua personalidade:
- Direto, tecnico quando necessario, sem enrolacao
- Fala como um colega experiente tirando uma duvida rapida no meio do expediente
- Honesto: se a resposta depende da seguradora ou da apolice, deixa isso claro
- Nunca inventa coberturas, valores ou regras

Voce ajuda com:
- Duvidas sobre tipos de seguro e coberturas (auto, vida, residencial, saude, viagem, empresarial)
- Como orientar o cliente em caso de sinistro
- Terminologia tecnica do setor
- Argumentos para apresentar ao cliente

Formato:
- Seja extremamente direto. 1 a 4 frases resolvem a maioria das perguntas.
- Sem markdown (sem **negrito**, sem #cabecalhos): so texto simples
- Nunca mais de 120 palavras, a menos que pedido explicitamente"""

    mensagens = [
        {'role': 'system', 'content': system_prompt},
        *historico,
        {'role': 'user', 'content': pergunta}
    ]

    payload = json.dumps({
        'model': model,
        'messages': mensagens,
        'temperature': 0.6,
        'max_completion_tokens': 1000,
        'reasoning': {'effort': 'low'}
    }).encode('utf-8')

    req = urllib_req.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': app_url,
            'X-OpenRouter-Title': 'Segu - SeguraTech'
        },
        method='POST'
    )

    _erros_http = {
        401: 'Chave da IA inválida. Avise o administrador.',
        402: 'Sem créditos na conta da IA.',
        429: 'A IA está sobrecarregada, tente de novo em instantes.',
    }

    try:
        with urllib_req.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        msg = result.get('choices', [{}])[0].get('message', {})
        resposta = msg.get('content') or msg.get('reasoning') or ''
        resposta = resposta.strip()
        if not resposta:
            return jsonify(erro='Resposta vazia da IA.'), 502
        return jsonify(resposta=resposta)

    except urllib.error.HTTPError as e:
        codigo = e.code
        detalhe = e.read().decode('utf-8', errors='replace')
        print(f'[SEGU] HTTPError {codigo}: {detalhe[:300]}')
        mensagem = _erros_http.get(codigo, 'Erro ao consultar a IA.')
        return jsonify(erro=mensagem), 502

    except (urllib.error.URLError, socket.timeout, TimeoutError):
        return jsonify(erro='A IA demorou para responder. Tente novamente.'), 502

    except Exception as e:
        print(f'[SEGU] Erro inesperado: {e}')
        return jsonify(erro='Erro interno ao chamar a IA.'), 500


# ─────────────────────────────────────────────
# 404 fallback — apenas rotas não-API
# ─────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify(message='Recurso não encontrado.'), 404
    return send_from_directory('public', 'login.html')


# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────
# Garantir migrações no início, mesmo quando o módulo for importado para testes.
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"[INFO] SeguraTech rodando em http://localhost:{port}")
    print(f"[INFO] Perfis: vendedor/vendas123 · emissao/emissao123 · sinistro/sinistro123 · gestor/gestor123")
    app.run(host='0.0.0.0', port=port, debug=False)
