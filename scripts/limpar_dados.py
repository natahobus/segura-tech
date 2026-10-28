#!/usr/bin/env python3
"""Limpa os dados de teste do SeguraTech.

Apaga: apólices, indicações, propostas, sinistros, históricos, anexos e os
arquivos PDF/imagens enviados. MANTÉM os usuários (logins) e a estrutura.
Antes de apagar, faz uma cópia de segurança do banco.

Uso (com o servidor PARADO):
    python scripts/limpar_dados.py
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(RAIZ, 'database.sqlite')
UPLOADS = os.path.join(RAIZ, 'uploads')
TABELAS = [
    'sinistro_attachments', 'sinistro_history', 'sinistros',
    'proposal_history', 'proposals', 'policies', 'leads', 'sessions',
]


def main():
    if not os.path.exists(DB):
        sys.exit('database.sqlite não encontrado.')

    con = sqlite3.connect(DB)
    existentes = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    print('Vai apagar:')
    for t in TABELAS:
        if t in existentes:
            print(f'  {t}: {con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]} registros')
    print('Os usuários (vendedor, emissao, sinistro, gestor) serão mantidos.')
    if input('Digite LIMPAR para confirmar: ').strip() != 'LIMPAR':
        sys.exit('Cancelado. Nada foi alterado.')

    backup = os.path.join(RAIZ, f'database_backup_{datetime.now():%Y%m%d_%H%M%S}.sqlite')
    shutil.copy2(DB, backup)
    print(f'Backup salvo em {os.path.basename(backup)}')

    for t in TABELAS:
        if t in existentes:
            con.execute(f'DELETE FROM {t}')
    if 'sqlite_sequence' in {r[0] for r in con.execute("SELECT name FROM sqlite_master")}:
        marcas = ','.join('?' * len(TABELAS))
        con.execute(f'DELETE FROM sqlite_sequence WHERE name IN ({marcas})', TABELAS)
    con.commit()
    con.execute('VACUUM')
    con.close()

    removidos = 0
    for pasta in ('policies', 'propostas', 'sinistros'):
        caminho = os.path.join(UPLOADS, pasta)
        if os.path.isdir(caminho):
            for nome in os.listdir(caminho):
                arq = os.path.join(caminho, nome)
                if os.path.isfile(arq) and nome != 'README.md':
                    os.remove(arq)
                    removidos += 1
    print(f'{removidos} arquivos enviados removidos.')
    print('Pronto. Suba o servidor normalmente.')


if __name__ == '__main__':
    main()