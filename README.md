# SeguraTech — Sistema Interno de Gestão de Seguros

SeguraTech é um protótipo de plataforma interna para gestão de seguros, focado em renovação, propostas, emissão e sinistros.

## 🧭 Resumo do Projeto

- Backend: **Python + Flask**
- Banco: **SQLite**
- Frontend: **HTML/CSS/JavaScript**
- Perfis: **vendedor**, **emissao**, **sinistro**, **gestor**
- Objetivo: interface interna rápida e funcional, sem excesso de design

## 💡 O que o sistema faz

- Controle de renovação de apólices
- Marcação de apólices como **Renovação solicitada** ou **Não renovada**
- Criação de propostas e envio para emissão
- Upload de PDFs de apólice e proposta
- Gestão de sinistros
- Acesso restrito por função

## 📁 Estrutura principal

```
seguratech-fixed/
├── server.py          # API Flask principal
├── database.sqlite    # Banco SQLite local (gerado em execução)
├── package.json       # Dependências do frontend / scripts npm
├── package-lock.json  # Lockfile npm
├── public/
│   ├── login.html     # Tela de login
│   ├── index.html     # Aplicação principal
│   ├── login.js       # Lógica de autenticação
│   ├── app.js         # Lógica do app
│   ├── styles.css     # Estilos da aplicação
│   └── ...            # Outros arquivos estáticos
├── uploads/           # Anexos e arquivos carregados
└── .gitignore         # Regras de ignorar arquivos
```

## 🛠️ Dependências

- Python 3.7+
- Flask
- SQLite
- Node/npm (opcional, apenas para gerenciar pacotes se necessário)

## 🚀 Como executar

```bash
python server.py
```

Depois, abra no navegador:

```text
http://localhost:3000
```

## 🔐 Perfis de acesso

- `vendedor` — renovações, propostas, apólices
- `emissao` — emissão de propostas e anexos de apólice
- `sinistro` — gestão de sinistros
- `gestor` — acesso a todas as áreas

> O sistema usa um fluxo interno simples, ideal para uso em corretoras pequenas ou equipes enxutas.

## 📌 Pontos importantes

- Login direto no frontend com autenticação por token
- Interface pensada para uso interno, não para cliente externo
- O foco é no fluxo operacional: renovação → proposta → emissão → apólice
- O backend já suporta atualização de status e gravação de notas de não-renovação

## 🧪 Teste rápido

- Pressione `v`, `e`, `s` ou `g` na tela de login para preencher atalhos de teste
- Cadastre renovação, marque não-renovada, crie proposta e envie para emissão

## 📌 Limpeza do repositório

Arquivos removidos ou não versionados:
- `.venv/`
- `node_modules/`
- `__pycache__/`
- `database.sqlite`
- `server.log`
- `uploads/`

## 📣 Observação final

Este é um protótipo funcional. Se quiser avançar para produção, recomenda-se:

- migrar para um banco mais robusto
- adicionar autenticação real
- usar servidor WSGI em produção
- remover dados de teste e habilitar controle de logs

---

**Versão**: 1.0.1 | **Atualizado em**: 2026-07-01
