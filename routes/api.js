/**
 * routes/api.js
 * Endpoints da API M&P Finance
 */

const express = require('express');
const router = express.Router();
const { getContextoCompleto, getDashboard } = require('../services/sheets');
const { chat, clearHistory } = require('../services/claude');
const { enviarAlertaImediato, testarBot } = require('../services/telegram');

// Cache simples para não bater na Sheets API a cada request
let ctxCache = null;
let ctxCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getCtx() {
  if (ctxCache && Date.now() - ctxCacheTime < CACHE_TTL) return ctxCache;
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mesAtual = meses[new Date().getMonth()];
  ctxCache = await getContextoCompleto(mesAtual);
  ctxCacheTime = Date.now();
  return ctxCache;
}

// ─── GET /api/dashboard ────────────────────────────────────
// Retorna resumo do mês atual para o frontend
router.get('/dashboard', async (req, res) => {
  try {
    const ctx = await getCtx();
    const hoje = new Date().getDate();
    const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const diasRestantes = diasNoMes - hoje;
    const limiteDiario = ctx.saldoRestante > 0 ? ctx.saldoRestante / diasRestantes : 0;
    const pctGasto = ctx.receita > 0 ? (ctx.totalGasto / ctx.receita) * 100 : 0;

    res.json({
      mes: ctx.mesAtual,
      receita: ctx.receita,
      despesasFixas: ctx.despesasFixas,
      despesasEssenciais: ctx.despesasEssenciais,
      despesasExtras: ctx.despesasExtras,
      despesasInesperadas: ctx.despesasInesperadas,
      torrar: ctx.torrar,
      objetivos: ctx.objetivos,
      investimentos: ctx.investimentos,
      totalGasto: ctx.totalGasto,
      balanco: ctx.balanco,
      metaEconomia: ctx.metaEconomia,
      saldoRestante: ctx.saldoRestante,
      limiteDiario: Math.round(limiteDiario),
      pctGasto: Math.round(pctGasto),
      diasRestantes,
      categorias: ctx.categorias,
      investimentosDetalhe: ctx.investimentosDetalhe,
      objetivosDetalhe: ctx.objetivosDetalhe,
      transacoes: ctx.transacoes,
      historico: ctx.historico,
    });
  } catch (err) {
    console.error('/api/dashboard error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar dados da planilha.' });
  }
});

// ─── POST /api/chat ────────────────────────────────────────
// Recebe uma pergunta e responde com IA
router.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'Campo "message" obrigatório.' });

  try {
    const ctx = await getCtx();
    const resposta = await chat(message, ctx, sessionId || 'web');
    res.json({ resposta });
  } catch (err) {
    console.error('/api/chat error:', err.message);
    res.status(500).json({ error: 'Erro ao processar mensagem.' });
  }
});

// ─── POST /api/chat/clear ──────────────────────────────────
// Limpa o histórico de conversa
router.post('/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  clearHistory(sessionId || 'web');
  res.json({ ok: true });
});

// ─── POST /api/simulate ────────────────────────────────────
router.post('/simulate', async (req, res) => {
  const { valor, descricao } = req.body;
  if (!valor) return res.status(400).json({ error: 'Campo "valor" obrigatório.' });

  try {
    const ctx = await getCtx();
    const hoje = new Date().getDate();
    const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const diasRestantes = diasNoMes - hoje;

    const saldoAntes   = ctx.saldoRestante;
    const saldoDepois  = saldoAntes - valor;
    const limiteAntes  = saldoAntes  > 0 ? Math.round(saldoAntes  / diasRestantes) : 0;
    const limiteDepois = saldoDepois > 0 ? Math.round(saldoDepois / diasRestantes) : 0;
    const cortePorDia  = Math.round(valor / diasRestantes);
    const pctUsado     = Math.round(((ctx.totalGasto + valor) / ctx.receita) * 100);

    let status;
    if (saldoDepois >= ctx.receita * 0.1)  status = 'ok';
    else if (saldoDepois >= 0)             status = 'warning';
    else                                   status = 'danger';

    const topCats = Object.entries(ctx.categorias || {})
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([nome, val]) => ({ nome, val: Math.round(val), corte: Math.round(val * 0.2) }));

    res.json({
      descricao, valor,
      saldoAntes, saldoDepois,
      limiteAntes, limiteDepois,
      cortePorDia, diasRestantes,
      pctUsado, status, topCats,
    });
  } catch (err) {
    console.error('/api/simulate error:', err.message);
    res.status(500).json({ error: 'Erro ao simular gasto.' });
  }
});

// ─── POST /api/telegram/test ──────────────────────────────
// Envia mensagem de teste no Telegram
router.post('/telegram/test', async (req, res) => {
  try {
    await testarBot();
    res.json({ ok: true, message: 'Mensagem enviada no grupo!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/health ──────────────────────────────────────
// Verifica se o servidor está no ar
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
