/**
 * server.js — M&P Finance Backend
 * Node.js + Express
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initBot } = require('./services/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ─────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas da API ────────────────────────────────────────
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// ─── Frontend (SPA fallback) ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 M&P Finance rodando em http://localhost:${PORT}`);
  console.log(`📊 API disponível em http://localhost:${PORT}/api`);

  // Inicia o bot do Telegram (com alertas agendados)
  initBot();

  console.log('\nEndpoints disponíveis:');
  console.log('  GET  /api/health       — status do servidor');
  console.log('  GET  /api/dashboard    — dados do mês atual');
  console.log('  POST /api/chat         — chat com IA');
  console.log('  POST /api/chat/clear   — limpar histórico');
  console.log('  POST /api/simulate     — simular um gasto');
  console.log('  POST /api/telegram/test — testar bot Telegram\n');
});
