# SeguraTech

**Sistema interno de gestão para corretoras de seguros**

> Projeto de Desenvolvimento I — UniSenac | Centro Universitário RS
> Campus Pelotas · Fecomércio · IFEP · Sesc · Sindicatos Empresariais
>
> **Autores:** Natã Hobus Kuhn, Eduarda Prasdio
> **Orientação:** Profª. Me. Bruna Ribeiro, Prof. Me. Gladimir Catarino

---

## Sobre o projeto

O **SeguraTech** é um sistema web interno pensado para o dia a dia de uma **corretora de seguros** — não para o cliente final, mas para a própria equipe (corretores/vendedores, analistas de emissão, analistas de sinistro e o gestor da corretora).

A ideia nasceu de um problema bem concreto observado em uma corretora real: praticamente todo o processo ainda é feito **no papel**. Apólices ficam guardadas em caixas físicas organizadas por mês/ano, propostas são conferidas folha por folha, renovações dependem de alguém lembrar de tirar o papel da caixa, e indicações de clientes (leads) chegam por WhatsApp ou e-mail e acabam viram anotações soltas. Isso gera perda de documentos, retrabalho, atrasos em renovações e nenhuma visibilidade gerencial sobre o que está acontecendo.

O SeguraTech centraliza esse fluxo inteiro em uma única plataforma: **apólices, propostas, emissão, renovações, indicações e sinistros**, cada um com seu processo, seu histórico e seu responsável — eliminando o papel e dando ao gestor uma visão real do negócio.

##  O problema, em detalhes

 Problema no processo atual  Consequência 

- Apólices emitidas em papel, guardadas em caixas por mês/ano | Risco de perda e demora para localizar um documento 
- Conferência manual de propostas (nome, CPF, seguradora) | Sem registro estruturado de erros, retrabalho 
- Renovações dependem do gestor retirar o papel da caixa | Esquecimentos e atrasos 
- Indicações (leads) chegam por e-mail/WhatsApp | Viram planilhas soltas, sem padronização nem visibilidade 
- Sinistros sem controle centralizado | Histórico, anexos e status espalhados entre pastas físicas e anotações à mão 

## 🎯 Público-alvo

**Corretoras de seguros** de pequeno e médio porte que ainda usam processos manuais e físicos para gestão de apólices, renovações e clientes — cenário muito comum no setor, onde soluções prontas do mercado são genéricas demais ou caras demais (CRMs como Salesforce) para o tamanho da operação.

## 👤 Personas

- **Carlos Mendes — Gestor.** Sócio da corretora. Distribui indicações e renovações, acompanha metas. Frustrado com esquecimentos do processo manual; quer relatórios rápidos e alertas.
- **Carla Vendas — Vendedora/Corretora.** Atende clientes pessoalmente e pelo WhatsApp. Cria propostas com PDF e quer ver, num só lugar, suas renovações e indicações.
- **Lucas — Analista de Emissão.** Confere propostas junto à seguradora. Precisa de uma fila organizada, com opção clara de aprovar (anexando a apólice) ou devolver com motivo.
- **Patrícia — Analista de Sinistro.** Registra e acompanha sinistros de segurados e terceiros. Precisa de histórico, anexos e status centralizados, sem depender de papel.

## 💡 Proposta de solução

Um sistema interno único, dividido em módulos que espelham o fluxo real da corretora:

- **Gestão de Apólices** — cadastro, upload de PDF, status de vigência e marcação de renovação, sem caixas físicas.
- **Módulo de Emissão** — fila de propostas com tela de conferência, aprovação (anexando a apólice) ou devolução com motivo.
- **Gestão de Indicações e Renovações** — o gestor envia indicações e renovações ao vendedor, com status de contato e histórico, substituindo planilhas soltas.
- **Módulo de Sinistros** — registro de segurado/terceiro, edição, anexos, histórico de andamento e finalização.
- **Dashboard & Indicadores** — visão gerencial com apólices ativas, renovações pendentes, propostas em aberto e sinistros por mês.
- **Controle de Acesso** — perfis distintos (gestor, vendedor, emissão, sinistro) com permissões específicas por rota da API.

### Diferencial em relação a outras soluções

| Alternativa | Limitação |
|---|---|
| Sistemas genéricos de corretoras | Focados só na emissão de apólices, sem fila de conferência estruturada, devolução com motivo ou módulo de sinistro integrado |
| CRMs genéricos (Salesforce e afins) | Robustos, mas sem foco em seguros — exigem customização cara para cobrir apólices, renovações e sinistros |
| Planilhas e e-mail | Solução mais comum em corretoras pequenas: totalmente manual, sem alertas nem histórico estruturado, alto risco de perda de dado |

O SeguraTech nasce **sob medida** para a rotina de uma corretora: fluxo de emissão com fila estruturada (aprovar/devolver com motivo) e módulo de sinistros com histórico e anexos.

## ⚙️ Como funciona o fluxo principal (propostas)

Esse é o coração do sistema — o caminho de uma proposta desde a criação até virar apólice:

```
Vendedor cria proposta (com PDF opcional)
        │
        ▼
   "Em elaboração"
        │  (vendedor envia)
        ▼
 "Aguardando emissão" ──────────► Emissão devolve com motivo
        │                                    │
        │ (emissão aprova e                  ▼
        │  anexa PDF da apólice)        "Devolvida"
        ▼                                    │
    "Emitida"                    (vendedor corrige e reenvia)
   (gera/atualiza registro                    │
    em Apólices)                              └──────► volta para "Aguardando emissão"
```

- **Vendedor**: cria a proposta, envia para emissão, corrige propostas devolvidas.
- **Emissão**: confere a proposta, aprova anexando o PDF da apólice emitida pela seguradora (gerando o registro em `policies`) ou devolve com um motivo padronizado (ex.: Pagamento recusado, Vistoria pendente, Documentação incompleta, Erro cadastral, Outros).
- Todo evento (criada, enviada, devolvida, corrigida, emitida) fica registrado no **histórico da proposta**, criando rastreabilidade completa — o que hoje, no papel, simplesmente não existe.

## 🗂️ Casos de uso por perfil

- **Gestor**: enviar indicação para vendedor, marcar apólice para renovação/não renovada, anexar PDF de renovação, visualizar indicadores gerenciais, editar/excluir/atualizar status/finalizar sinistro.
- **Vendedor**: atualizar status da indicação, marcar apólice para renovação/não renovada, criar proposta com PDF, enviar/reenviar proposta para emissão, corrigir proposta devolvida, visualizar indicadores.
- **Analista de Emissão**: conferir dados da proposta, devolver proposta (com motivo), anexar apólice e emitir.
- **Analista de Sinistro**: registrar sinistro (segurado/terceiro), editar/excluir sinistro, anexar documento, atualizar status/finalizar sinistro.

## 🗃️ Modelo de dados

Banco real (`database.sqlite`) com 9 tabelas:

| Tabela | Finalidade |
|---|---|
| `users` | Usuários do sistema e seus perfis (vendedor, emissão, sinistro, gestor) |
| `sessions` | Tokens de sessão ativos por usuário |
| `leads` | Indicações de clientes recebidas pelo gestor e distribuídas aos vendedores |
| `proposals` | Propostas em andamento, do rascunho até a emissão |
| `proposal_history` | Histórico de eventos de cada proposta (auditoria) |
| `policies` | Apólices ativas, com PDF, vigência e status de renovação |
| `sinistros` | Sinistros abertos, de segurados ou terceiros |
| `sinistro_history` | Histórico de andamento de cada sinistro |
| `sinistro_attachments` | Anexos (documentos, fotos) vinculados a um sinistro |

Relacionamentos principais: um usuário (`seller`) pode ter várias `leads`, `proposals`, `policies` e `sinistros`; uma `proposal` pode originar uma `policy`; `proposals` e `sinistros` têm suas tabelas de histórico e anexos associadas via chave estrangeira.

## 🛠️ Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Backend | Python 3 + Flask + Flask-CORS — API REST com autenticação por token de sessão |
| Banco de dados | SQLite (modo WAL), com migração incremental de colunas no boot da aplicação |
| Frontend | HTML5 + CSS3 + JavaScript puro (SPA leve, sem framework), consumo da API via `fetch` |
| Infraestrutura | Git/GitHub para versionamento, scripts `start.sh`/`start.bat` para subir o ambiente |
| Ferramentas | Insomnia (testes de API), VS Code |

> **Observação:** o planejamento inicial (RNF) previa Node.js/TypeScript + MySQL/Sequelize. A implementação foi migrada para Python/Flask/SQLite por restrição do ambiente de execução disponível para o protótipo.

## 📋 Requisitos funcionais

| ID | Descrição |
|---|---|
| RF01 | Autenticação por usuário/senha com token de sessão e controle de acesso por perfil (vendedor, emissão, sinistro, gestor) |
| RF02 | Gestão de indicações (leads): gestor envia ao vendedor; vendedor atualiza status (Novo, Em contato, Em proposta, Fechado...) |
| RF03 | Gestão de apólices: consulta, upload de PDF e marcação de status (Renovar, Renovação solicitada, Não renovada, Emitida) |
| RF04 | Criação de renovação avulsa pelo gestor, com PDF, telefone, vigência e vendedor de destino |
| RF05 | Módulo de Emissão: proposta com PDF → fila "Aguardando emissão" → aprovação (anexa apólice) ou devolução com motivo |
| RF06 | Correção e reenvio de propostas devolvidas pelo vendedor, mantendo histórico de eventos da proposta |
| RF07 | Módulo de Sinistros: registro (segurado/terceiro), edição, exclusão, anexos, histórico de andamento e finalização |
| RF08 | Dashboard com indicadores: apólices ativas, renovações pendentes, indicações abertas, propostas pendentes e sinistros por status/mês |

## 📐 Requisitos não funcionais

| ID | Categoria | Descrição |
|---|---|---|
| RNF01 | Desempenho | Aplicação local/single-host: SQLite em modo WAL, respostas simples de listagem sem paginação pesada |
| RNF02 | Segurança | Sessão via token opaco (7 dias), validado em toda rota protegida. **Ponto de evolução:** hoje a senha é armazenada em texto simples — recomenda-se hashing (bcrypt) antes de produção |
| RNF03 | Usabilidade | Interface web responsiva em HTML/CSS/JS, com atalhos de login para teste rápido por perfil (v/e/s/g) |
| RNF04 | Manutenibilidade | Backend em camadas simples (rotas Flask + helpers de banco), API REST documentada em `API_TESTS.sh`, front-end desacoplado do back |
| RNF05 | Escalabilidade | Estrutura preparada para migrar de SQLite para um banco cliente-servidor (ex.: PostgreSQL/MySQL) sem alterar o contrato da API |

## 📁 Estrutura do projeto

```
seguratech/
├── server.py              # API Flask principal (rotas, regras de negócio, banco)
├── database.sqlite        # Banco SQLite local (gerado em execução)
├── API_TESTS.sh           # Roteiro de testes da API (curl)
├── package.json           # Metadados/scripts do projeto
├── start.sh / start.bat   # Scripts para subir o ambiente (Linux/Mac e Windows)
├── public/
│   ├── login.html         # Tela de login
│   ├── login.js           # Lógica de autenticação
│   ├── index.html         # Aplicação principal (SPA)
│   ├── app.js              # Lógica do app (rotas de tela, chamadas à API)
│   └── styles.css         # Estilos da aplicação
├── uploads/
│   ├── propostas/         # PDFs de propostas enviadas pelo vendedor
│   ├── policies/          # PDFs de apólices emitidas/renovadas
│   └── sinistros/         # Anexos de sinistros
└── .gitignore
```

## ✅ Etapa atual validada

A aplicação já está com a base funcional validada em execução local:

- Login com visual em fundo preto e interface mais limpa
- Atalhos por perfil (`v`, `e`, `s`, `g`) preenchendo usuário e senha sem automatizar o envio
- Mensagens de erro/êxito mais discretas, sem o flash vermelho agressivo
- Controle de acesso por perfil validado no backend
- Bloqueio de login por excesso de tentativas inválidas
- Validação de status de sinistro e regra de acesso por papel
- Busca de apólices funcionando via rota de consulta, inclusive para emissões

### Verificação executada

A validação foi feita diretamente contra `http://localhost:3000` usando requisições reais à API:

- perfil `vendedor` em `/api/sinistros` → `200`
- perfil `emissao` em `/api/sinistros` → `403`
- perfil `sinistro` em `/api/sinistros` → `200`
- perfil `gestor` em `/api/sinistros` → `200`
- tentativas inválidas 1 a 4 → `401`
- tentativas inválidas 5 e 6 → `429`
- status inválido em sinistro → `400`
- regressão final do backend e regras de negócio → `OK`

```bash
cd segura-tech
python scripts/test_permissoes.py
```

## 🚀 Como executar localmente

**Pré-requisitos:** Python 3.7+

```bash
# 1. Clone o repositório
git clone https://github.com/natahobus/segura-tech.git
cd segura-tech

# 2. Crie o arquivo local de ambiente a partir do exemplo
copy .env.example .env

# 3. Instale as dependências
pip install flask flask-cors

# 4. Rode o servidor
python server.py
```

Depois, abra no navegador:

```
http://localhost:3000
```

> O arquivo `.env.example` contém os parâmetros esperados de ambiente e evita expor segredos no repositório.

### Teste rápido por perfil

Na tela de login, pressione uma das teclas de atalho para preencher o usuário de teste correspondente:

| Tecla | Perfil |
|---|---|
| `v` | Vendedor |
| `e` | Emissão |
| `s` | Sinistro |
| `g` | Gestor |

Fluxo sugerido para testar: cadastrar uma proposta como vendedor → enviar para emissão → aprovar ou devolver como emissão → acompanhar o histórico gerado.

## 🔐 Perfis de acesso

- **`vendedor`** — cria e acompanha propostas, atualiza indicações, gerencia suas renovações.
- **`emissao`** — confere e aprova/devolve propostas, anexa apólices emitidas.
- **`sinistro`** — registra e acompanha sinistros, anexos e histórico.
- **`gestor`** — acesso a todas as áreas, cria indicações e renovações avulsas, visualiza indicadores gerenciais.

## 🔎 Principais rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/login` | Autenticação e geração de token |
| `GET` | `/api/overview` | Indicadores do dashboard |
| `GET/POST` | `/api/leads` | Listagem e criação de indicações |
| `PUT` | `/api/leads/<id>` | Atualização de status da indicação |
| `GET/POST` | `/api/propostas` | Listagem e criação de propostas |
| `PUT` | `/api/propostas/<id>` | Edição/correção de proposta |
| `POST` | `/api/propostas/<id>/send` | Envio da proposta para emissão |
| `POST` | `/api/propostas/<id>/emit` | Aprovação e emissão da apólice |
| `POST` | `/api/propostas/<id>/reject` | Devolução da proposta com motivo |
| `GET` | `/api/apolices` | Listagem de apólices |
| `POST` | `/api/apolices/<id>/upload` | Upload de PDF da apólice |
| `POST` | `/api/renovacoes` | Criação de renovação avulsa |
| `GET/POST` | `/api/sinistros` | Listagem e criação de sinistros |
| `PUT` | `/api/sinistros/<id>/status` | Atualização de status do sinistro |
| `PUT` | `/api/sinistros/<id>/finalize` | Finalização do sinistro |

Roteiro completo de testes disponível em `API_TESTS.sh`.

## 🧭 Estado atual e próximos passos

Este é um **protótipo funcional** desenvolvido como parte do Projeto de Desenvolvimento I. Pontos já mapeados para evolução:

- Hashing de senha (bcrypt) antes de qualquer uso em produção.
- Revisão do fluxo de devolução/reenvio de propostas (consistência de notas e histórico).
- Migração de SQLite para um banco cliente-servidor (PostgreSQL/MySQL), conforme já previsto na arquitetura (RNF05).
- Ampliação do dashboard com mais indicadores gerenciais.

## 📄 Licença

Projeto acadêmico desenvolvido para a disciplina de Projeto de Desenvolvimento— UniSenac.
