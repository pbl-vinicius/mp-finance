# M&P Finance — Guia de Setup

Siga estes passos na ordem. Leva ~30 minutos na primeira vez.

---

## Passo 1 — Criar bot no Telegram

1. Abra o Telegram e procure por **@BotFather**
2. Envie `/newbot`
3. Dê um nome: `M&P Finance`
4. Dê um username (precisa terminar em `bot`): ex. `mpfinance_pablo_bot`
5. Copie o **token** gerado (formato: `123456789:AAF...`)
6. Adicione o bot ao grupo "Gastos - M&P" como administrador

> O Chat ID do grupo já está no `.env.example`: `-5298937477`
> Se precisar confirmar, adicione `@userinfobot` ao grupo e ele vai te dizer o ID.

---

## Passo 2 — Criar API Key da Anthropic (Claude)

1. Acesse https://console.anthropic.com/settings/keys
2. Clique em **Create Key**
3. Dê um nome: `mp-finance`
4. Copie a chave (começa com `sk-ant-...`)
5. **Importante:** copie agora — ela só aparece uma vez

> Custo estimado: R$ 5–15/mês com uso normal de vocês dois.

---

## Passo 3 — Criar credenciais do Google Sheets

1. Acesse https://console.cloud.google.com
2. Crie um projeto novo chamado `mp-finance`
3. Ative a **Google Sheets API**:
   - Menu → APIs e Serviços → Biblioteca
   - Pesquise "Google Sheets API" → Ativar
4. Crie uma conta de serviço:
   - Menu → APIs e Serviços → Credenciais
   - + Criar credenciais → Conta de serviço
   - Nome: `mp-finance-reader`
   - Função: **Visualizador**
5. Baixe a chave JSON:
   - Clique na conta criada → Chaves → Adicionar chave → JSON
   - Um arquivo `.json` vai ser baixado
6. **Compartilhe a planilha com a conta de serviço:**
   - Abra o arquivo JSON e copie o campo `client_email`
     (algo como `mp-finance-reader@mp-finance-xxxxx.iam.gserviceaccount.com`)
   - Abra a planilha no Google Sheets
   - Clique em Compartilhar → cole o e-mail → permissão **Leitor**

---

## Passo 4 — Configurar o .env

1. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` em qualquer editor de texto
3. Preencha os campos:
   - `ANTHROPIC_API_KEY` — a chave do Passo 2
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — cole o conteúdo **inteiro** do arquivo JSON do Passo 3
     (tudo em uma linha, sem quebras)
   - `TELEGRAM_BOT_TOKEN` — o token do Passo 1

---

## Passo 5 — Rodar localmente (teste)

Você precisa ter **Node.js 18+** instalado. Se não tiver:
- Acesse https://nodejs.org e instale a versão LTS

```bash
# Entre na pasta do projeto
cd mp-finance

# Instale as dependências
npm install

# Rode o servidor
npm run dev
```

Abra http://localhost:3000 no navegador. Se o dashboard carregar com os dados da planilha, está funcionando! 🎉

---

## Passo 6 — Deploy no Railway

1. Acesse https://railway.app e crie uma conta (pode usar o Google)
2. Clique em **New Project → Deploy from GitHub repo**
   - Faça upload do projeto ou conecte ao GitHub
3. Vá em **Variables** e adicione todas as variáveis do `.env`
4. Railway vai gerar uma URL pública (ex: `https://mp-finance-production.up.railway.app`)
5. Acesse essa URL — o app estará no ar!

> O plano gratuito do Railway inclui 500 horas/mês — mais que suficiente para uso contínuo.

---

## Dúvidas frequentes

**"Erro ao buscar dados da planilha"**
→ Verifique se compartilhou a planilha com o e-mail da conta de serviço (Passo 3, item 6).

**"Telegram: bot não responde"**
→ Confirme que o bot foi adicionado ao grupo como administrador.

**"Chave da Anthropic inválida"**
→ Verifique se copiou a chave completa, sem espaços extras.

---

Qualquer dúvida, me chame! 🚀
