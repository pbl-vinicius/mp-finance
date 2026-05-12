# M&P Finance 💰

Aplicativo de controle financeiro inteligente para Pablo e Mariana.

---

## O que é isso?

O M&P Finance nasceu de uma necessidade real: Pablo e Mariana já tinham um sistema de controle financeiro funcionando no Google Sheets + um bot no Telegram (via Google Apps Script), mas queriam algo mais inteligente — que respondesse perguntas em linguagem natural, gerasse insights automáticos, enviasse alertas proativos e permitisse simular gastos antes de fazê-los.

O app conecta a planilha existente a uma IA (Claude da Anthropic) e entrega tudo isso via uma interface web moderna e pelo próprio Telegram.

---

## Objetivo

Ter um copiloto financeiro pessoal que:

- Mostra em tempo real quanto sobrou no mês e quanto podem gastar por dia
- Responde perguntas como "gastei mais em restaurante esse mês?" ou "se eu comprar um tênis de R$ 500, quanto sobra?"
- Envia alertas automáticos no Telegram quando os gastos passam de limites definidos
- Manda resumos diários às 21h e relatório semanal às segundas
- Compara meses entre si para identificar padrões de comportamento

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express |
| IA | Claude API (Anthropic) — Opus 4.6 para chat, Haiku para alertas |
| Planilha | Google Sheets API v4 (conta de serviço read-only) |
| Notificações | Telegram Bot API (`node-telegram-bot-api`) |
| Agendamento | `node-cron` |
| Frontend | HTML + CSS + JS vanilla (single file) |
| Hospedagem | Railway |
| Secrets | `.env` com `dotenv` |

---

## Estrutura do projeto

```
App Finanças/
├── server.js                  # Entry point — Express + init do bot
├── package.json
├── .env                       # Credenciais (não commitar!)
├── .env.example               # Template das variáveis
├── README.md
├── SETUP.md                   # Guia passo a passo de configuração
├── routes/
│   └── api.js                 # Endpoints da API REST
├── services/
│   ├── sheets.js              # Leitura da planilha Google Sheets
│   ├── claude.js              # Chat com IA + geração de insights
│   └── telegram.js            # Bot + alertas agendados
└── public/
    └── index.html             # Frontend (dashboard, chat, simulador)
```

---

## Fontes de dados

- **Planilha:** [Planejamento 2026](https://docs.google.com/spreadsheets/d/17SA6Hslf-jtCabzttauS0vWoVKVy7jQPluYfY8HnGjA)
  - ID: `17SA6Hslf-jtCabzttauS0vWoVKVy7jQPluYfY8HnGjA`
  - Aba **Dashboard**: receita, despesas por categoria, balanço mensal
  - Aba **Extrato**: transações detalhadas mês a mês
- **Conta de serviço Google:** `mp-finance-reader@mp-finance-496017.iam.gserviceaccount.com`
- **Grupo Telegram:** "Gastos - M&P" (Chat ID: `-5298937477`)

---

## Variáveis de ambiente

```env
ANTHROPIC_API_KEY=sk-ant-...
SPREADSHEET_ID=17SA6Hslf-jtCabzttauS0vWoVKVy7jQPluYfY8HnGjA
GOOGLE_SERVICE_ACCOUNT_JSON={...json inteiro em uma linha...}
TELEGRAM_BOT_TOKEN=...
TELEGRAM_GROUP_CHAT_ID=-5298937477
PORT=3000
NODE_ENV=development
```

---

## Como rodar localmente

```bash
cd ~/Documents/Claude/App\ Finanças
npm install
npm run dev
```

Acesse: http://localhost:3000

---

## API

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/health` | Status do servidor |
| GET | `/api/dashboard` | Dados do mês atual |
| POST | `/api/chat` | Pergunta para a IA |
| POST | `/api/chat/clear` | Limpa histórico de conversa |
| POST | `/api/simulate` | Simula impacto de um gasto |
| POST | `/api/telegram/test` | Envia mensagem de teste no grupo |

---

## Alertas automáticos (Telegram)

| Horário | Descrição |
|---|---|
| Todos os dias às 21h | Resumo do dia: quanto gastaram, quanto sobrou |
| Todos os dias às 12h | Verifica se ultrapassaram algum limite de categoria |
| Segundas-feiras às 9h | Relatório semanal com comparativo |

---

## Status atual

- [x] Estrutura do projeto criada
- [x] Integração com Google Sheets funcionando
- [x] Chat com IA funcionando
- [x] Bot do Telegram conectado
- [x] Alertas agendados configurados
- [x] Frontend conectado ao backend
- [x] Servidor rodando localmente
- [ ] Dashboard mostrando dados reais (ajuste de estrutura da planilha em andamento)
- [ ] Deploy no Railway

---

## Planos futuros

**Curto prazo**
- Corrigir leitura das categorias da planilha (estrutura real tem mais linhas: Torrar, Objetivos, Investimentos, Despesas inesperadas)
- Fazer deploy no Railway para rodar 24/7 sem precisar do computador ligado
- Testar alertas reais em dias de uso normal

**Médio prazo**
- Tela de comparativo entre meses (gráfico de evolução)
- A IA sugerir automaticamente onde cortariam gastos com base no histórico
- Mariana conseguir acessar o app pelo celular (domínio próprio ou link do Railway)
- Modo "planejamento": simular como seria o mês se seguissem os limites definidos

**Longo prazo**
- Registro de novos gastos direto pelo app ou pelo Telegram (sem precisar abrir o Sheets)
- Metas de investimento com acompanhamento mensal
- Exportação de relatórios mensais em PDF
- Notificação quando um gasto específico foge muito da média histórica

---

## Histórico de decisões

- **Por que não só o Telegram?** Queria uma interface visual com gráficos e histórico de conversa com a IA.
- **Por que não modificar o Apps Script existente?** Para não quebrar o que já funcionava e ter mais flexibilidade com Node.js.
- **Por que Railway?** Plano gratuito cobre o uso deles (500h/mês), deploy simples via GitHub.
- **Por que conta de serviço e não OAuth?** Mais simples para uso em servidor — não precisa renovar tokens manualmente.
