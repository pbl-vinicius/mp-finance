/**
 * services/sheets.js
 * Lê os dados da planilha M&P via Google Sheets API
 */

const { google } = require('googleapis');

// Autenticação via conta de serviço
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/**
 * Lê um intervalo da planilha
 */
async function readRange(range) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

/**
 * Retorna o resumo do Dashboard (receita, despesas, balanço por mês)
 */
async function getDashboard() {
  const rows = await readRange('Dashboard!A1:M15');
  if (!rows.length) return null;

  const meses = rows[0].slice(1); // Jan..Dez
  const result = {};

  rows.slice(1).forEach(row => {
    const label = row[0];
    if (!label) return;
    result[label] = {};
    meses.forEach((mes, i) => {
      result[label][mes] = parseBRL(row[i + 1]);
    });
  });

  return result;
}

/**
 * Retorna as despesas por categoria (linhas 20–57, col A = nome, col do mês = valor)
 */
async function getCategorias(mesAtual = 'Mai') {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const colIdx = meses.indexOf(mesAtual) + 1; // col 0 = label, col 1 = Jan, col 5 = Mai, etc.
  const rows = await readRange('Dashboard!A20:M57');
  const categorias = {};
  rows.forEach(row => {
    const nome = row[0];
    if (!nome) return;
    categorias[nome] = parseBRL(row[colIdx] || '0');
  });
  return categorias;
}

/**
 * Retorna os investimentos do mês (linhas 59–64)
 */
async function getInvestimentos(mesAtual = 'Mai') {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const colIdx = meses.indexOf(mesAtual) + 1;
  const rows = await readRange('Dashboard!A59:M64');

  const parsePct = val => {
    if (!val) return 0;
    return parseFloat(String(val).replace('%', '').replace(',', '.')) || 0;
  };

  return {
    total:       parseBRL(rows[0]?.[colIdx]),
    crescimento: parsePct(rows[1]?.[colIdx]),
    etf:         parseBRL(rows[2]?.[colIdx]),
    rendaFixa:   parseBRL(rows[3]?.[colIdx]),
    cripto:      parseBRL(rows[4]?.[colIdx]),
    medPago:     parseBRL(rows[5]?.[colIdx]),
  };
}

/**
 * Retorna os objetivos (Casa, Carro, Viagem) com valor e % concluída (linhas 68–74)
 */
async function getObjetivos(mesAtual = 'Mai') {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const colIdx = meses.indexOf(mesAtual) + 1;
  const rows = await readRange('Dashboard!A68:M74');

  const parsePct = val => {
    if (!val) return 0;
    return parseFloat(String(val).replace('%', '').replace(',', '.')) || 0;
  };

  return [
    { nome: 'Casa',   valor: parseBRL(rows[1]?.[colIdx]), pct: parsePct(rows[2]?.[colIdx]) },
    { nome: 'Carro',  valor: parseBRL(rows[3]?.[colIdx]), pct: parsePct(rows[4]?.[colIdx]) },
    { nome: 'Viagem', valor: parseBRL(rows[5]?.[colIdx]), pct: parsePct(rows[6]?.[colIdx]) },
  ];
}

/**
 * Retorna as transações do mês especificado
 * mesIndex: 0=Jan, 1=Fev, ..., 4=Mai, etc.
 */
async function getExtrato(mesIndex = 4) {
  // Cada mês ocupa 11 colunas no Extrato; offset base = mesIndex * 11
  const colStart = mesIndex * 11;
  const colEnd = colStart + 10;
  const colLetterStart = colIndexToLetter(colStart + 2); // +2 pois col A,B são fixas no Jan
  const colLetterEnd = colIndexToLetter(colStart + 9);

  // Ajuste: o extrato começa na coluna B para Jan (col 1)
  // Estrutura: Data | Descrição | Valor | Tipo | Categoria | Descrição | Investimento | Valor
  const range = `Extrato!${colLetterStart}2:${colLetterEnd}300`;
  const rows = await readRange(range);

  const transacoes = [];
  rows.forEach(row => {
    const data = row[0];
    const descricao = row[1];
    const valor = parseBRL(row[2]);
    const tipo = row[3];
    const categoria = row[4];

    if (data && descricao && valor) {
      transacoes.push({ data, descricao, valor, tipo, categoria });
    }
  });

  return transacoes;
}

/**
 * Retorna um resumo rico do mês atual para o contexto da IA
 */
async function getContextoCompleto(mesAtual = 'Mai') {
  const [dashboard, categorias, investimentosDetalhe, objetivosDetalhe] = await Promise.all([
    getDashboard(),
    getCategorias(mesAtual),
    getInvestimentos(mesAtual),
    getObjetivos(mesAtual),
  ]);

  const receita              = dashboard?.['Receita']?.[mesAtual] ?? 0;
  const despesasFixas        = dashboard?.['Despesas fixas']?.[mesAtual] ?? 0;
  const despesasEssenciais   = dashboard?.['Despesas essenciais']?.[mesAtual] ?? 0;
  const despesasExtras       = dashboard?.['Despesas Extras']?.[mesAtual] ?? 0;
  const despesasInesperadas  = dashboard?.['Despesas inesperadas']?.[mesAtual] ?? 0;
  const torrar               = dashboard?.['Torrar']?.[mesAtual] ?? 0;
  const objetivos            = dashboard?.['Objetivos']?.[mesAtual] ?? 0;
  const investimentos        = dashboard?.['Investimentos']?.[mesAtual] ?? 0;
  const totalGasto           = dashboard?.['Total gasto']?.[mesAtual] ?? 0;
  const balanco              = dashboard?.['Balanço']?.[mesAtual] ?? 0;
  const metaEconomia         = dashboard?.['Quanto queremos economizar']?.[mesAtual] ?? 0;

  // Contexto dos últimos meses para comparação
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mesIdx = meses.indexOf(mesAtual);
  const historico = {};
  meses.slice(0, mesIdx + 1).forEach(m => {
    historico[m] = {
      receita:             dashboard?.['Receita']?.[m] ?? 0,
      totalGasto:          dashboard?.['Total gasto']?.[m] ?? 0,
      balanco:             dashboard?.['Balanço']?.[m] ?? 0,
      despesasFixas:       dashboard?.['Despesas fixas']?.[m] ?? 0,
      despesasEssenciais:  dashboard?.['Despesas essenciais']?.[m] ?? 0,
      despesasExtras:      dashboard?.['Despesas Extras']?.[m] ?? 0,
      despesasInesperadas: dashboard?.['Despesas inesperadas']?.[m] ?? 0,
      torrar:              dashboard?.['Torrar']?.[m] ?? 0,
      objetivos:           dashboard?.['Objetivos']?.[m] ?? 0,
      investimentos:       dashboard?.['Investimentos']?.[m] ?? 0,
    };
  });

  return {
    mesAtual,
    receita,
    despesasFixas,
    despesasEssenciais,
    despesasExtras,
    despesasInesperadas,
    torrar,
    objetivos,
    investimentos,
    totalGasto,
    balanco,
    metaEconomia,
    saldoRestante: receita - totalGasto,
    categorias,
    investimentosDetalhe,
    objetivosDetalhe,
    historico,
    dataConsulta: new Date().toLocaleDateString('pt-BR'),
  };
}

// ─── Helpers ──────────────────────────────────────────────

function parseBRL(str) {
  if (!str || typeof str !== 'string') return 0;
  const clean = str.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function colIndexToLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

module.exports = { getDashboard, getCategorias, getInvestimentos, getObjetivos, getExtrato, getContextoCompleto };
