/**
 * routes/api.js
 * Endpoints da API M&P Finance
 */

const express = require('express');
const router = express.Router();
const { getContextoCompleto, getDashboard } = require('../services/sheets');
const { chat, clearHistory } = require('../services/claude');
const { enviarAlertaImediato, testarBot } = require('../services/telegram');

const CLOSING_DAY = 24;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Retorna o mês de fatura vigente com base no dia de fechamento do cartão.
// Ex: dia 25/05 → ciclo de junho (fechou dia 24/05).
function getBillingMonth() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth(); // 0-indexed
  return day > CLOSING_DAY ? MESES[(month + 1) % 12] : MESES[month];
}

// Dias decorridos desde o início do ciclo de faturamento atual.
function getDiasDecorridos() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  let startMonth = month, startYear = year;
  if (day <= CLOSING_DAY) {
    startMonth = month - 1;
    if (startMonth < 0) { startMonth = 11; startYear = year - 1; }
  }
  const cycleStart = new Date(startYear, startMonth, CLOSING_DAY + 1);
  const today = new Date(year, month, day);
  return Math.max(1, Math.floor((today - cycleStart) / 86400000) + 1);
}

// Dias restantes até o fechamento do ciclo atual (inclusive o dia de hoje).
function getDiasRestantes() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  let endMonth = month;
  let endYear = year;
  if (day > CLOSING_DAY) {
    endMonth = month + 1;
    if (endMonth === 12) { endMonth = 0; endYear = year + 1; }
  }

  const cycleEnd = new Date(endYear, endMonth, CLOSING_DAY);
  const today    = new Date(year, month, day);
  return Math.floor((cycleEnd - today) / 86400000) + 1;
}

// Cache simples para não bater na Sheets API a cada request
let ctxCache = null;
let ctxCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getCtx() {
  if (ctxCache && Date.now() - ctxCacheTime < CACHE_TTL) return ctxCache;
  ctxCache = await getContextoCompleto(getBillingMonth());
  ctxCacheTime = Date.now();
  return ctxCache;
}

// ─── GET /api/dashboard ────────────────────────────────────
// Retorna resumo do mês atual para o frontend
router.get('/dashboard', async (req, res) => {
  try {
    const ctx = await getCtx();
    const diasRestantes = getDiasRestantes();
    const diasDecorridos = getDiasDecorridos();
    const limiteDiario = ctx.saldoRestante > 0 ? ctx.saldoRestante / diasRestantes : 0;
    const pctGasto = ctx.receita > 0 ? (ctx.totalGasto / ctx.receita) * 100 : 0;
    const totalDias = diasDecorridos + diasRestantes - 1;

    // Gasto real por categoria a partir do extrato (transação a transação)
    const gastoPorCategoria = {};
    (ctx.transacoes || []).forEach(t => {
      if (t.valor > 0 && t.categoria) {
        const cat = t.categoria.trim();
        gastoPorCategoria[cat] = (gastoPorCategoria[cat] || 0) + t.valor;
      }
    });

    // Meta implícita por categoria: média dos últimos 3 meses
    const mesIdx = MESES.indexOf(ctx.mesAtual);
    const prevMonths = MESES.slice(Math.max(0, mesIdx - 3), mesIdx);
    const metasCategorias = {};
    Object.keys(ctx.categoriasHistorico || {}).forEach(nome => {
      const vals = prevMonths
        .map(m => (ctx.categoriasHistorico[nome]?.[m] || 0))
        .filter(v => v > 0);
      metasCategorias[nome] = vals.length > 0
        ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        : 0;
    });

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
      gastoPorCategoria,
      metasCategorias,
      diasDecorridos,
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
    const diasRestantes = getDiasRestantes();

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

// ─── GET /api/metas-forecast ─────────────────────────────
// Previsão inteligente de gastos por categoria via IA (Haiku)
router.get('/metas-forecast', async (req, res) => {
  try {
    const ctx = await getCtx();
    const diasRestantes = getDiasRestantes();
    const diasDecorridos = getDiasDecorridos();
    const totalDias = diasDecorridos + diasRestantes - 1;

    const gastoPorCategoria = {};
    (ctx.transacoes || []).forEach(t => {
      if (t.valor > 0 && t.categoria) {
        const cat = t.categoria.trim();
        gastoPorCategoria[cat] = (gastoPorCategoria[cat] || 0) + t.valor;
      }
    });

    const mesIdx = MESES.indexOf(ctx.mesAtual);
    const prevMonths = MESES.slice(Math.max(0, mesIdx - 3), mesIdx);
    const metasCategorias = {};
    Object.keys(ctx.categoriasHistorico || {}).forEach(nome => {
      const vals = prevMonths
        .map(m => (ctx.categoriasHistorico[nome]?.[m] || 0))
        .filter(v => v > 0);
      metasCategorias[nome] = vals.length > 0
        ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        : 0;
    });

    const catsParaAnalise = Object.keys(gastoPorCategoria)
      .filter(nome => (gastoPorCategoria[nome] || 0) > 0)
      .map(nome => {
        const meta = metasCategorias[nome] || 0;
        const gasto = gastoPorCategoria[nome] || 0;
        const projecao = Math.round(gasto / diasDecorridos * totalDias);
        return { nome, meta, gasto, projecao, riscoPct: meta > 0 ? projecao / meta : 0 };
      })
      .sort((a, b) => b.riscoPct - a.riscoPct)
      .slice(0, 6);

    if (!catsParaAnalise.length) {
      return res.json({ geral: null, insights: [] });
    }

    const { gerarPrevisaoCategorias } = require('../services/claude');
    const result = await gerarPrevisaoCategorias(catsParaAnalise, ctx.mesAtual, diasDecorridos, diasRestantes);
    res.json(result);
  } catch (err) {
    console.error('/api/metas-forecast error:', err.message);
    res.status(500).json({ error: 'Erro ao gerar previsão.' });
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

// ─── POST /api/cache/clear ────────────────────────────────
// Força recarregamento da planilha na próxima requisição
router.post('/cache/clear', (req, res) => {
  ctxCache = null;
  ctxCacheTime = 0;
  res.json({ ok: true });
});

// ─── GET /api/health ──────────────────────────────────────
// Verifica se o servidor está no ar
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
