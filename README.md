# SeguraTech

**Sistema interno de gestão para corretoras de seguros**

> Projeto de Desenvolvimento I — UniSenac | Centro Universitário RS
> Campus Pelotas · Fecomércio · IFEP · Sesc · Sindicatos Empresariais
>
> **Autores:** Natã Hobus Kuhn, Gabriel Schmidt
> **Orientação:** Profª. Me. Bruna Ribeiro, Prof. Me. Gladimir Catarino

---

## Sobre o projeto

O **SeguraTech** é um sistema web interno pensado para o dia a dia de uma **corretora de seguros**. Ele não é para o cliente final, e sim para a equipe: vendedores, analistas de emissão, agentes de sinistro e o gestor da corretora.

A ideia nasceu de um problema observado em uma corretora real: quase todo o processo ainda é feito **no papel**. Apólices ficam em caixas físicas organizadas por mês e ano, propostas são conferidas folha por folha, renovações dependem de alguém lembrar de tirar o papel da caixa, e indicações de clientes chegam por WhatsApp ou e-mail e viram anotações soltas. O resultado é perda de documentos, retrabalho, atraso em renovações e nenhuma visibilidade gerencial.

O SeguraTech centraliza esse fluxo em uma única plataforma: **apólices, propostas, emissão, renovações, indicações e sinistros**, cada um com seu processo, seu histórico e seu responsável.

## O problema, em detalhes

| Problema no processo atual | Consequência |
|---|---|
| Apólices emitidas em papel, guardadas em caixas por mês/ano | Risco de perda e demora para localizar um documento |
| Conferência manual de propostas (nome, CPF, seguradora) | Sem registro estruturado de erros, retrabalho |
| Renovações dependem do gestor retirar o papel da caixa | Esquecimentos e atrasos |
| Indicações (leads) chegam por e-mail/WhatsApp | Viram planilhas soltas, sem padronização nem visibilidade |
| Sinistros sem controle centralizado | Histórico, anexos e status espalhados entre pastas físicas e anotações à mão |
| Cliente passa os dados e documentos do sinistro ao vendedor, que repassa ao agente | Informação perdida no caminho e documentos faltando na hora de comunicar |

## Público-alvo

**Corretoras de seguros** de pequeno e médio porte que ainda usam processos manuais e físicos para gestão de apólices, renovações e clientes. É um cenário comum no setor, onde as soluções prontas do mercado são genéricas demais ou caras demais para o tamanho da operação.

## Personas

- **Carlos Mendes, Gestor.** Sócio da corretora. Distribui indicações e renovações e acompanha metas. Quer relatórios rápidos e alertas.
- **Carla Vendas, Vendedora.** Atende clientes pessoalmente e pelo WhatsApp. Cria propostas e seguros novos, coleta os dados e documentos de sinistros e quer ver tudo num só lugar.
- **Lucas, Analista de Emissão.** Confere propostas junto à seguradora. Precisa de uma fila organizada, com opção clara de aprovar (anexando a apólice) ou devolver com motivo.
- **Patrícia, Agente de Sinistro.** Recebe os sinistros enviados pelos vendedores, confere a documentação, comunica no site da seguradora e acompanha o andamento. Também abre sinistros do zero quando o cliente a procura direto.

## Módulos

- **Apólices:** cadastro, upload de PDF, busca, vigência e marcação de renovação, sem caixas físicas.
- **Seguro novo:** o vendedor monta a proposta de um cliente que não veio por indicação nem renovação e envia direto para a fila de emissão, sem depender do gestor.
- **Emissão:** fila de propostas com tela de conferência, aprovação (anexando a apólice) ou devolução com motivo.
- **Indicações e renovações:** o gestor envia ao vendedor, com status de contato e histórico.
- **Sinistros:** duas portas de entrada (vendedor e agente), com envio, devolução por pendência, comunicação à seguradora e acompanhamento.
- **Dashboard:** visão por perfil, com apólices ativas, renovações pendentes, propostas em aberto e sinistros por status e mês.
- **Segu, assistente interno:** chat em um botão no canto da tela, que responde dúvidas do corretor usando IA (OpenRouter).
- **Controle de acesso:** perfis (gestor, vendedor, emissão, sinistro) com permissões validadas no backend.

## Fluxo de propostas

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
   (gera registro em Apólices)               │
                                             └──────► volta para "Aguardando emissão"
```

A proposta pode nascer de três lugares: uma **indicação**, uma **renovação** ou a tela **Seguro novo**. Todo evento fica registrado no histórico da proposta.

## Fluxo de sinistros

O vendedor faz o primeiro contato com o cliente e junta os dados e documentos, mas **nunca comunica na seguradora**. Quem comunica, no site da seguradora, é sempre o agente de sinistro. O cliente também pode procurar o agente direto.

```
Porta A: Vendedor                          Porta B: Agente de sinistro
   │                                              │
   ▼                                              ▼
"Rascunho" (só ele vê)                  Abre do zero ("Em andamento")
   │  (envia ao agente)                           │
   ▼                                              │
"Aguardando agente"                               │
   │  (agente assume)                             │
   ▼                                              │
"Em análise" ◄────────────────────────────────────┘
   │
   ├──► Falta documento: devolve ao vendedor com motivo ("Aguardando documentos")
   │         └── vendedor corrige, anexa e reenvia ──► volta para o agente
   │
   ▼  (agente comunica no site da seguradora e registra o número)
"Comunicado à seguradora"
   │
   ▼
Acompanhamento ──► demais status ──► "Finalizado"
```

**Tela do agente de sinistro**

- **Adicionar sinistro:** barra com os sinistros recebidos dos vendedores (com contador), mais o formulário de abertura direta. Em cada sinistro há o botão "Assumir", um resumo pronto para copiar e colar no site da seguradora, o campo do número da seguradora e a opção de devolver ao vendedor.
- **Acompanhar sinistro:** sinistros já comunicados, em abas (Aguardando documentos, Em andamento, Finalizados), separados em **Segurado** e **Terceiro**.

**Tela do vendedor:** formulário "Novo sinistro" com upload de documentos por tipo (B.O., CNH, CRLV, fotos e outros), "Salvar rascunho" ou "Enviar ao agente", e abas Devolvidos pelo agente, Rascunhos, Enviados e Finalizados. Quando o agente devolve, o motivo aparece em destaque.

## Facilidades de preenchimento

- **Autopreenchimento:** ao digitar o CPF (11 números) ou o número da apólice nos formulários de sinistro, o sistema puxa nome, telefone, seguradora e, quando houver, o veículo do último sinistro. Só preenche campos vazios. O vendedor só encontra clientes das próprias apólices.
- **Máscara e validação de CPF:** formato `000.000.000-00`, exatamente 11 números, validado também no servidor.
- **Máscara de telefone:** `(53) 99999-9999`, com ou sem DDI (`+55`), fixo ou celular.
- **Vigência automática:** ao informar o início da vigência, o fim é preenchido com um ano depois (28/10/2026 vira 28/10/2027). O campo continua editável.
- **Upload seguro:** apenas PDF, JPG e PNG, até 10 MB por arquivo, com conferência do cabeçalho do PDF.

## Casos de uso por perfil

- **Gestor:** enviar indicação ao vendedor, marcar apólice para renovação ou não renovada, anexar PDF de renovação, acompanhar indicadores e ver todos os sinistros e propostas.
- **Vendedor:** atualizar status de indicações, criar proposta e seguro novo, enviar ou reenviar para emissão, corrigir proposta devolvida, abrir sinistro e enviá-lo ao agente.
- **Analista de Emissão:** conferir dados da proposta, devolver com motivo, anexar apólice e emitir.
- **Agente de Sinistro:** assumir sinistros enviados, devolver por pendência, comunicar à seguradora, abrir sinistro direto e acompanhar até finalizar.

## Modelo de dados

Banco `database.sqlite` com 9 tabelas:

| Tabela | Finalidade |
|---|---|
| `users` | Usuários do sistema e seus perfis |
| `sessions` | Tokens de sessão ativos |
| `leads` | Indicações recebidas pelo gestor e distribuídas aos vendedores |
| `proposals` | Propostas, do rascunho até a emissão |
| `proposal_history` | Histórico de eventos de cada proposta |
| `policies` | Apólices, com PDF, vigência e status de renovação |
| `sinistros` | Sinistros, com origem (vendedor ou agente), responsável e dados da comunicação |
| `sinistro_history` | Histórico de andamento de cada sinistro |
| `sinistro_attachments` | Documentos vinculados a um sinistro |

O esquema evolui por migração aditiva: no início do servidor, colunas novas são criadas com `ALTER TABLE`, sem apagar dados existentes.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Python 3 + Flask + Flask-CORS, API REST com autenticação por token de sessão |
| Banco de dados | SQLite (modo WAL) |
| Frontend | HTML5 + CSS3 + JavaScript puro, sem framework, consumindo a API via `fetch` |
| IA (Segu) | API do OpenRouter, chamada pelo backend |
| Infraestrutura | Git/GitHub, scripts `start.sh` e `start.bat` |

> O planejamento inicial previa Node.js/TypeScript + MySQL. A implementação foi para Python/Flask/SQLite por restrição do ambiente disponível para o protótipo.

## Requisitos funcionais

| ID | Descrição |
|---|---|
| RF01 | Autenticação por usuário e senha, com token de sessão e controle de acesso por perfil |
| RF02 | Gestão de indicações: o gestor envia ao vendedor e o vendedor atualiza o status |
| RF03 | Gestão de apólices: consulta, upload de PDF e marcação de status (Renovar, Renovação solicitada, Não renovada, Emitida) |
| RF04 | Renovação avulsa pelo gestor, com PDF, telefone, vigência e vendedor de destino |
| RF05 | Emissão: proposta com PDF, fila "Aguardando emissão", aprovação (anexa apólice) ou devolução com motivo |
| RF06 | Correção e reenvio de propostas devolvidas, com histórico |
| RF07 | Seguro novo: o vendedor cria proposta avulsa e envia direto à emissão |
| RF08 | Sinistros com duas portas de entrada (vendedor e agente), envio, assunção, pendência com motivo e comunicação à seguradora |
| RF09 | Acompanhamento de sinistros separado por segurado e terceiro, com anexos e histórico |
| RF10 | Autopreenchimento de dados do cliente por CPF ou número da apólice |
| RF11 | Dashboard com indicadores por perfil |
| RF12 | Assistente Segu para dúvidas do corretor |

## Requisitos não funcionais

| ID | Categoria | Descrição |
|---|---|---|
| RNF01 | Desempenho | Aplicação local de um servidor, SQLite em modo WAL, listagens simples |
| RNF02 | Segurança | Senhas com hash (PBKDF2/scrypt), sessão com token opaco de 7 dias, bloqueio após tentativas de login inválidas (HTTP 429), permissões validadas no backend (403/404), upload restrito por extensão, tamanho e conteúdo |
| RNF03 | Usabilidade | Interface responsiva, máscaras de entrada, atalhos de login por perfil (`v`/`e`/`s`/`g`) |
| RNF04 | Manutenibilidade | Rotas Flask com helpers de banco, API testável por `API_TESTS.sh` e `scripts/test_permissoes.py` |
| RNF05 | Escalabilidade | Estrutura preparada para trocar o SQLite por PostgreSQL ou MySQL sem mudar o contrato da API |

## Estrutura do projeto

```
seguratech/
├── server.py                  # API Flask (rotas, regras de negócio, banco)
├── database.sqlite            # Banco local (gerado na execução, fora do Git)
├── API_TESTS.sh               # Roteiro de testes da API (curl)
├── start.sh / start.bat       # Sobem o ambiente (Linux/Mac e Windows)
├── .env.example               # Modelo das variáveis de ambiente
├── public/
│   ├── login.html / login.js  # Tela de login
│   ├── index.html             # Aplicação principal
│   ├── app.js                 # Lógica das telas e chamadas à API
│   └── styles.css             # Estilos
├── scripts/
│   ├── test_permissoes.py     # Testes de permissão por perfil
│   └── limpar_dados.py        # Limpa dados de teste (com backup)
└── uploads/                   # Arquivos enviados (fora do Git)
    ├── propostas/
    ├── policies/
    └── sinistros/
```

## Como executar localmente

**Pré-requisito:** Python 3.8 ou superior.

```bash
# 1. Clone o repositório
git clone https://github.com/natahobus/segura-tech.git
cd segura-tech

# 2. Crie o arquivo de ambiente a partir do exemplo
copy .env.example .env        # no Linux/Mac: cp .env.example .env

# 3. Instale as dependências
pip install flask flask-cors python-dotenv requests

# 4. Rode o servidor
python server.py
```

Abra `http://localhost:3000` no navegador.

### Variáveis de ambiente (`.env`)

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `OPENROUTER_API_KEY` | Chave da API usada pelo assistente Segu |
| `OPENROUTER_MODEL` | Modelo de IA do Segu |
| `APP_URL` | Endereço da aplicação |
| `SEED_DEMO_DATA` | Com valor `1`, cria apólices, indicações, propostas e sinistros de exemplo em um banco vazio. Sem isso, o banco nasce só com os 4 usuários |

O arquivo `.env` guarda segredos e **não deve ser enviado ao Git**; o `.gitignore` já o protege.

### Perfis de teste

| Usuário | Senha | Perfil |
|---|---|---|
| `vendedor` | `vendas123` | Vendedor |
| `emissao` | `emissao123` | Emissão |
| `sinistro` | `sinistro123` | Agente de sinistro |
| `gestor` | `gestor123` | Gestor |

Na tela de login, as teclas `v`, `e`, `s` e `g` preenchem o usuário e a senha do perfil correspondente. **Troque essas senhas antes de qualquer uso real.**

### Roteiros para testar

- **Emissão:** como vendedor, crie uma proposta (ou use Seguro novo) e envie; como emissão, aprove ou devolva; acompanhe o histórico.
- **Sinistro:** como vendedor, crie um rascunho e envie ao agente; como agente, assuma, devolva por pendência ou comunique; depois confira o sinistro em Acompanhar.

### Limpar os dados de teste

Com o servidor parado:

```bash
python scripts/limpar_dados.py
```

O script mostra o que será apagado, pede que você digite `LIMPAR`, salva um backup do banco e mantém os usuários. Os arquivos `database_backup_*.sqlite` não devem ir para o Git.

### Testes automatizados

Com o servidor rodando em `http://localhost:3000`:

```bash
python scripts/test_permissoes.py
```

## Perfis de acesso

- **`vendedor`:** cria propostas e seguros novos, atualiza indicações, gerencia renovações e abre sinistros até enviá-los ao agente. Vê só o que é seu.
- **`emissao`:** confere, aprova ou devolve propostas e anexa as apólices emitidas. Não acessa sinistros.
- **`sinistro`:** recebe, assume, devolve, comunica e acompanha sinistros. Não vê rascunhos de vendedor.
- **`gestor`:** acesso de leitura a todas as áreas, cria indicações e renovações avulsas e vê os indicadores.

## Principais rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/login` | Autenticação e geração de token |
| `GET` | `/api/overview` | Indicadores do dashboard |
| `GET/POST` | `/api/leads` | Listagem e criação de indicações |
| `GET/POST` | `/api/propostas` | Listagem e criação de propostas |
| `PUT` | `/api/propostas/<id>` | Correção de proposta |
| `POST` | `/api/propostas/<id>/send` | Envio para emissão |
| `POST` | `/api/propostas/<id>/emit` | Aprovação e emissão da apólice |
| `POST` | `/api/propostas/<id>/reject` | Devolução com motivo |
| `GET` | `/api/apolices` | Listagem e busca de apólices |
| `GET` | `/api/clientes/buscar` | Dados do cliente por CPF ou número da apólice |
| `POST` | `/api/apolices/<id>/upload` | Upload do PDF da apólice |
| `POST` | `/api/renovacoes` | Renovação avulsa |
| `GET/POST` | `/api/sinistros` | Listagem e criação de sinistros |
| `PUT` | `/api/sinistros/<id>` | Edição dos dados do sinistro |
| `POST` | `/api/sinistros/<id>/enviar` | Vendedor envia ao agente |
| `POST` | `/api/sinistros/<id>/assumir` | Agente assume |
| `POST` | `/api/sinistros/<id>/pendencia` | Agente devolve com motivo |
| `POST` | `/api/sinistros/<id>/comunicar` | Agente registra a comunicação e o número da seguradora |
| `PUT` | `/api/sinistros/<id>/status` | Atualização de status |
| `PUT` | `/api/sinistros/<id>/finalize` | Finalização |
| `POST` | `/api/chat` | Pergunta ao assistente Segu |

Roteiro completo de testes em `API_TESTS.sh`.

## Estado atual e próximos passos

Este é um **protótipo funcional** do Projeto de Desenvolvimento I. Pontos mapeados para evoluir:

- Validar os dígitos verificadores do CPF, além da quantidade de números.
- Permitir ao vendedor remover um anexo enviado por engano.
- Ajustar o contador do menu "Sinistros" para contar só os que aguardam comunicação.
- Aviso de prazo para sinistro parado sem ser assumido.
- Migrar de SQLite para um banco cliente-servidor (PostgreSQL ou MySQL).
- Ampliar o dashboard com mais indicadores gerenciais.
- Trocar as senhas de teste e rever a configuração antes de qualquer uso em produção.

## Licença

Projeto acadêmico desenvolvido para a disciplina de Projeto de Desenvolvimento I — UniSenac.
