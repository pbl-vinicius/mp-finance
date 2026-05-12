/**
 * services/telegram.js
 * Bot do Telegram para alertas diários e notificações inteligentes
 */

const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { getContextoCompleto } = require('./sheets');
const { gerarInsightDiario, verificarAlertas } = require('./claude');

let bot = null;
const CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

/**
 * Inicializa o bot do Telegram
 */
function initBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN não configurado — alertas Telegram desativados.');
    return;
  }

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  console.log('✅ Bot do Telegram iniciado');

  agendarAlertas();
}

/**
 * Envia uma mensagem para o grupo
 */
async function enviarMensagem(texto) {
  if (!bot || !CHAT_ID) return;
  try {
    await bot.sendMessage(CHAT_ID, texto, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Erro ao enviar mensagem Telegram:', err.message);
  }
}

/**
 * Agenda os alertas automáticos via cron
 */
function agendarAlertas() {
  // Resumo diário — todo dia às 21h (horário de Brasília = UTC-3)
  // No servidor Railway use UTC, então 21h BRT = 00h UTC (meia-noite)
  cron.schedule('0 0 * * *', async () => {
    console.log('📊 Gerando resumo diário...');
    try {
      const ctx = await getContextoCompleto(getMesAtual());
      const insight = await gerarInsightDiario(ctx);
      await enviarMensagem(`📊 <b>Resumo do dia — M&P Finance</b>\n\n${insight}`);
    } catch (err) {
      console.error('Erro no resumo diário:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // Verificação de alertas — todo dia às 12h
  cron.schedule('0 12 * * *', async () => {
    try {
      const ctx = await getContextoCompleto(getMesAtual());
      const { alertas } = await verificarAlertas(ctx);

      for (const alerta of alertas) {
        const emoji = alerta.tipo === 'danger' ? '🚨' : alerta.tipo === 'warning' ? '⚠️' : 'ℹ️';
        await enviarMensagem(`${emoji} <b>${alerta.titulo}</b>\n${alerta.mensagem}`);
      }
    } catch (err) {
      console.error('Erro na verificação de alertas:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  // Relatório semanal — toda segunda-feira às 9h
  cron.schedule('0 9 * * 1', async () => {
    try {
      const ctx = await getContextoCompleto(getMesAtual());
      const diasPassados = new Date().getDate();
      const mediaGastoDia = ctx.totalGasto / diasPassados;

      const msg = `
📅 <b>Relatório Semanal — M&P Finance</b>

💰 Receita: R$ ${fmt(ctx.receita)}
💸 Gasto até agora: R$ ${fmt(ctx.totalGasto)} (${Math.round(ctx.totalGasto / ctx.receita * 100)}% da receita)
📈 Média/dia: R$ ${fmt(mediaGastoDia)}
💚 Saldo restante: R$ ${fmt(ctx.saldoRestante)}

<b>Top categorias do mês:</b>
${Object.entries(ctx.categorias)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([k, v]) => `  • ${k}: R$ ${fmt(v)}`)
  .join('\n')}

Bom início de semana! 🚀
`.trim();

      await enviarMensagem(msg);
    } catch (err) {
      console.error('Erro no relatório semanal:', err.message);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('⏰ Alertas agendados: resumo 21h, verificação 12h, relatório semanal segunda 9h');
}

/**
 * Envia um alerta imediato (chamado pelo endpoint da API)
 */
async function enviarAlertaImediato(titulo, mensagem, tipo = 'info') {
  const emoji = tipo === 'danger' ? '🚨' : tipo === 'warning' ? '⚠️' : '✅';
  await enviarMensagem(`${emoji} <b>${titulo}</b>\n${mensagem}`);
}

/**
 * Testa o bot enviando uma mensagem de boas-vindas
 */
async function testarBot() {
  await enviarMensagem(`
🤖 <b>M&P Finance Bot ativado!</b>

Olá Pablo e Mariana! Estou configurado e pronto para enviar:
  • 📊 Resumo diário às 21h
  • ⚠️ Alertas quando uma categoria extrapolar
  • 📅 Relatório semanal toda segunda às 9h

Vamos economizar juntos! 💪
`.trim());
}

// ─── Helpers ─────────────────────────────────────────────────

function getMesAtual() {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return meses[new Date().getMonth()];
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { initBot, enviarMensagem, enviarAlertaImediato, testarBot };
