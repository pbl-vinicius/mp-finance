/**
 * services/claude.js
 * Integração com Claude API para análise financeira inteligente
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Histórico de conversa por sessão (em memória — simples para MVP)
const conversationHistory = new Map();

/**
 * Envia uma mensagem para o Claude com contexto financeiro completo
 * @param {string} userMessage - Pergunta do usuário
 * @param {object} contexto - Dados financeiros da planilha
 * @param {string} sessionId - ID da sessão para manter histórico
 */
async function chat(userMessage, contexto, sessionId = 'default') {
  // Recupera histórico da sessão
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId);

  // Adiciona mensagem do usuário ao histórico
  history.push({ role: 'user', content: userMessage });

  // Monta o system prompt com os dados financeiros reais
  const systemPrompt = buildSystemPrompt(contexto);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: history,
  });

  const assistantMessage = response.content[0].text;

  // Salva resposta no histórico
  history.push({ role: 'assistant', content: assistantMessage });

  // Limita histórico a 20 mensagens para não explodir o contexto
  if (history.length > 20) {
    conversationHistory.set(sessionId, history.slice(-20));
  }

  return assistantMessage;
}

/**
 * Limpa o histórico de uma sessão (botão "Nova conversa")
 */
function clearHistory(sessionId = 'default') {
  conversationHistory.delete(sessionId);
}

/**
 * Gera um insight proativo (chamado pelo cron job)
 */
async function gerarInsightDiario(contexto) {
  const prompt = `
Você é um consultor financeiro analisando os dados de Pablo e Mariana.
Gere um resumo diário conciso (máx 4 linhas) para enviar pelo Telegram, incluindo:
1. Total gasto hoje vs limite diário recomendado
2. Status geral do mês (no caminho certo ou não)
3. Uma observação inteligente ou alerta se houver algo fora do padrão
4. Quanto ainda podem gastar por dia para fechar o mês no limite

Use emojis. Seja direto e motivador. Não use markdown.

DADOS ATUAIS:
${JSON.stringify(contexto, null, 2)}
`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

/**
 * Analisa se alguma categoria está extrapolando e gera alerta
 */
async function verificarAlertas(contexto) {
  const prompt = `
Analise os dados financeiros abaixo e identifique APENAS situações que merecem alerta imediato.
Retorne um JSON com o campo "alertas" (array). Cada alerta tem: tipo (warning/danger/info), titulo, mensagem.
Se não houver alertas importantes, retorne {"alertas": []}.

DADOS:
${JSON.stringify(contexto, null, 2)}
`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { alertas: [] };
  } catch {
    return { alertas: [] };
  }
}

// ─── System Prompt ──────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const diasNoMes = 31;
  const hoje = new Date().getDate();
  const diasRestantes = diasNoMes - hoje;
  const limiteDiario = ctx.saldoRestante > 0
    ? (ctx.saldoRestante / diasRestantes).toFixed(2)
    : 0;

  return `Você é o assistente financeiro pessoal de Pablo e Mariana, um casal que mora no Rio de Janeiro.

PERSONALIDADE: Direto, amigável, usa dados reais nas respostas. Responde em português.
Não faz rodeios — vai direto ao número e ao insight. Usa emojis com moderação.

CONTEXTO FINANCEIRO ATUAL (${ctx.dataConsulta}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mês atual: ${ctx.mesAtual}
Receita: R$ ${fmt(ctx.receita)}
Total gasto até agora: R$ ${fmt(ctx.totalGasto)}
Saldo restante: R$ ${fmt(ctx.saldoRestante)}
Limite por dia (para zerar no mês): R$ ${limiteDiario}
Dias restantes no mês: ${diasRestantes}

DESPESAS POR TIPO:
- Fixas: R$ ${fmt(ctx.despesasFixas)}
- Essenciais: R$ ${fmt(ctx.despesasEssenciais)}
- Extras: R$ ${fmt(ctx.despesasExtras)}

GASTOS POR CATEGORIA (acumulado no ano):
${Object.entries(ctx.categorias || {}).map(([k, v]) => `- ${k}: R$ ${fmt(v)}`).join('\n')}

HISTÓRICO MENSAL:
${Object.entries(ctx.historico || {}).map(([mes, d]) =>
  `- ${mes}: receita R$${fmt(d.receita)}, gasto R$${fmt(d.totalGasto)}, balanço R$${fmt(d.balanco)}`
).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUÇÕES:
- Sempre use os dados reais acima nas respostas
- Quando comparar meses, cite os números exatos
- Identifique padrões: "em março gastaram X, em abril Y — diferença de Z%"
- Para perguntas sobre limite do dia, calcule com base no saldo restante e dias restantes
- Seja honesto se algo estiver fora de controle, mas construtivo
- Respostas curtas quando possível (3-6 linhas). Só detalhe quando pedido explicitamente`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { chat, clearHistory, gerarInsightDiario, verificarAlertas };
