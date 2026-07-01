#!/bin/bash
# SeguraTech - Script de inicialização
# Instala dependências Python se necessário e sobe o servidor

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         SeguraTech - Start           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Verifica Python
if ! command -v python3 &> /dev/null; then
    echo "[ERRO] Python3 não encontrado. Instale Python 3.8+"
    exit 1
fi

# Instala dependências
echo "[INFO] Verificando dependências..."
python3 -m pip install flask flask-cors --quiet 2>&1 | tail -1

echo "[INFO] Iniciando servidor na porta 3000..."
echo "[INFO] Acesse: http://localhost:3000"
echo ""
echo "  Perfis de teste:"
echo "  ┌──────────────┬──────────────┐"
echo "  │ Usuário      │ Senha        │"
echo "  ├──────────────┼──────────────┤"
echo "  │ vendedor     │ vendas123    │"
echo "  │ emissao      │ emissao123   │"
echo "  │ sinistro     │ sinistro123  │"
echo "  │ gestor       │ gestor123    │"
echo "  └──────────────┴──────────────┘"
echo ""
echo "  Dica: Na tela de login, pressione v/e/s/g"
echo "  para preencher as credenciais automaticamente."
echo ""

python3 server.py
