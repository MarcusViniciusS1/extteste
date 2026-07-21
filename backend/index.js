// Servidor-ponte: expõe uma API REST com nomes/campos em inglês (os mesmos
// que o app React já usa), mas por baixo dos panos fala com o Postgres
// local em português (zorte_tickets). O app não precisa saber que o banco
// está em português — só esse arquivo sabe.

import express from 'express';
import cors from 'cors';
import { pool, ping } from './db.js';
import { RESOURCES } from './resources.js';
import { analyzeTicket, claudeConfigured } from './claude.js';
import { updateConversation, crispConfigured } from './crisp.js';

// Rede de segurança: um erro não tratado em qualquer lugar não deve derrubar o
// backend (e junto com ele o acesso ao banco). Apenas logamos e seguimos.
process.on('unhandledRejection', (reason) => {
  console.error('[backend] unhandledRejection (ignorado):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[backend] uncaughtException (ignorado):', err && err.message ? err.message : err);
});

const app = express();
// Private Network Access: o Chrome exige este cabeçalho para permitir que uma
// extensão/página acesse endereços de rede local (localhost). Deve vir ANTES do
// cors() para constar também na resposta de preflight (OPTIONS).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors());
app.use(express.json());

function getResource(key) {
  const res = RESOURCES[key];
  if (!res) throw Object.assign(new Error(`Recurso desconhecido: ${key}`), { status: 404 });
  return res;
}

function dbCol(resource, englishCol) {
  return resource.columns[englishCol] || englishCol;
}

function selectListSql(resource) {
  return Object.entries(resource.columns)
    .map(([alias, col]) => `${resource.table}.${col} AS "${alias}"`)
    .join(', ');
}

// Converte um objeto com chaves em inglês pro formato de colunas do banco,
// aplicando JSON.stringify nas colunas jsonb.
function toDbRow(resource, obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const col = dbCol(resource, key);
    out[col] = resource.jsonb.includes(key) ? JSON.stringify(value ?? {}) : value;
  }
  return out;
}

function parseFilters(query) {
  const eq = {};
  const ilike = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('eq.')) eq[key.slice(3)] = value;
    else if (key.startsWith('ilike.')) ilike[key.slice(6)] = value;
  }
  return { eq, ilike };
}

async function attachEmbeds(rows, resource, embedKeys) {
  if (!embedKeys.length || rows.length === 0) return rows;
  for (const embedName of embedKeys) {
    const spec = resource.embeds?.[embedName];
    if (!spec) continue;
    const foreignResource = getResource(spec.resource);
    const ids = [...new Set(rows.map((r) => r[spec.localKey]).filter(Boolean))];
    let relatedById = {};
    if (ids.length) {
      const cols = selectListSql(foreignResource);
      const dbForeignKey = dbCol(foreignResource, spec.foreignKey);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const { rows: relatedRows } = await pool.query(
        `SELECT ${cols} FROM ${foreignResource.table} WHERE ${foreignResource.table}.${dbForeignKey} IN (${placeholders})`,
        ids
      );
      relatedById = Object.fromEntries(relatedRows.map((r) => [r[spec.foreignKey], r]));
    }
    for (const row of rows) {
      row[embedName] = row[spec.localKey] ? relatedById[row[spec.localKey]] ?? null : null;
    }
  }
  return rows;
}

async function listResource(resourceKey, { embed = [], orderBy, orderDir = 'asc', limit, filters, countOnly = false }) {
  const resource = getResource(resourceKey);

  if (countOnly) {
    const { where, params } = buildWhere(resource, filters);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${resource.table} ${where}`, params);
    return { count: rows[0].count };
  }

  const { where, params } = buildWhere(resource, filters);
  let sql = `SELECT ${selectListSql(resource)} FROM ${resource.table} ${where}`;
  if (orderBy) sql += ` ORDER BY ${resource.table}.${dbCol(resource, orderBy)} ${orderDir === 'desc' ? 'DESC' : 'ASC'}`;
  if (limit) sql += ` LIMIT ${Number(limit)}`;

  const { rows } = await pool.query(sql, params);
  await attachEmbeds(rows, resource, embed);
  return { rows };
}

function buildWhere(resource, filters) {
  const params = [];
  const clauses = [];
  for (const [col, val] of Object.entries(filters.eq || {})) {
    params.push(val);
    clauses.push(`${resource.table}.${dbCol(resource, col)} = $${params.length}`);
  }
  for (const [col, val] of Object.entries(filters.ilike || {})) {
    params.push(`%${val}%`);
    clauses.push(`${resource.table}.${dbCol(resource, col)} ILIKE $${params.length}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// ---------- Rotas de IA (Claude) ----------

// O frontend consulta isto para saber se deve mostrar os botões de IA.
app.get('/api/ai/status', (req, res) => {
  res.json({ configured: claudeConfigured, model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8' });
});

// Analisa um ticket: carrega o ticket + notas do banco e pede ao Claude um
// resumo, categoria, sentimento, prioridade sugerida, resposta e próximos passos.
app.post('/api/ai/analyze-ticket', async (req, res) => {
  try {
    const ticketId = req.body?.ticket_id;
    if (!ticketId) throw Object.assign(new Error('ticket_id é obrigatório'), { status: 400 });

    const { rows: ticketRows } = await listResource('tickets', {
      embed: ['company', 'contact', 'attendant'],
      filters: { eq: { id: ticketId } },
    });
    const ticket = ticketRows[0];
    if (!ticket) throw Object.assign(new Error('Ticket não encontrado'), { status: 404 });

    const { rows: notes } = await listResource('ticket_notes', {
      embed: ['attendant'],
      orderBy: 'created_at',
      orderDir: 'asc',
      filters: { eq: { ticket_id: ticketId } },
    });

    const analysis = await analyzeTicket({ ticket, notes });
    res.json({ data: analysis });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Rotas do Crisp (extensão de navegador) ----------

// Busca livre por nome, tenant ou CNPJ (com/sem pontuação). Retorna empresas
// com { id, name, document, tenant }.
async function searchCompanies(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const like = `%${query}%`;
  const digits = query.replace(/\D/g, '');
  const digitsLike = digits ? `%${digits}%` : null;
  const { rows } = await pool.query(
    `SELECT e.id,
            e.nome       AS name,
            e.documento  AS document,
            i.nome       AS tenant
       FROM empresas e
       LEFT JOIN inquilinos i ON i.id = e.inquilino_id
      WHERE e.nome ILIKE $1
         OR e.documento ILIKE $1
         OR i.nome ILIKE $1
         OR ($2::text IS NOT NULL AND regexp_replace(coalesce(e.documento,''), '[^0-9]', '', 'g') LIKE $2)
      ORDER BY e.nome
      LIMIT 25`,
    [like, digitsLike]
  );
  return rows;
}

// Escolhe a melhor correspondência: CNPJ exato > nome exato > nome mais curto.
function pickBest(rows, q) {
  const digits = String(q || '').replace(/\D/g, '');
  const lower = String(q || '').toLowerCase().trim();
  if (digits) {
    const byDoc = rows.find((r) => String(r.document || '').replace(/\D/g, '') === digits);
    if (byDoc) return byDoc;
  }
  const exact = rows.find((r) => String(r.name || '').toLowerCase() === lower);
  if (exact) return exact;
  return rows.slice().sort((a, b) => String(a.name || '').length - String(b.name || '').length)[0] || null;
}

// Compatibilidade: busca a melhor empresa por nome (usada em /api/lookup/cnpj).
async function lookupCnpj(company) {
  const rows = await searchCompanies(company);
  return pickBest(rows, company);
}

// A extensão consulta isto para saber se o Crisp está configurado no backend.
app.get('/api/crisp/status', (req, res) => {
  res.json({ crisp: crispConfigured });
});

// Versão mais recente publicada da extensão. Bump aqui quando lançar uma nova.
const EXTENSION_VERSION = '1.3.1';
app.get('/api/extension/version', (req, res) => {
  res.json({ version: EXTENSION_VERSION });
});

// Saúde do backend: responde mesmo se o banco estiver fora, indicando db:false.
app.get('/api/health', async (req, res) => {
  let db = false;
  try { db = await ping(); } catch { db = false; }
  res.json({ ok: true, db, crisp: crispConfigured });
});

// Busca livre no banco do Z-Ticket por nome, tenant OU CNPJ (com ou sem
// pontuação). Não depende do Crisp. Retorna uma lista de empresas.
app.get('/api/lookup/company', async (req, res) => {
  try {
    const results = await searchCompanies(String(req.query.q || ''));
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Só consulta o CNPJ (útil para testes/preview, não grava no Crisp).
app.get('/api/lookup/cnpj', async (req, res) => {
  try {
    const company = String(req.query.company || '');
    const match = await lookupCnpj(company);
    if (!match) return res.json({ found: false, company });
    res.json({
      found: true,
      company,
      matched_name: match.name,
      cnpj: match.document || null,
      tenant: match.tenant?.name || null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fluxo completo: recebe empresa do cabeçalho da conversa, acha o CNPJ e
// grava a etiqueta "CNPJ" nos dados da conversa no Crisp.
app.post('/api/crisp/enrich', async (req, res) => {
  try {
    const { website_id, session_id, company, cnpj, candidates } = req.body || {};
    if (!website_id || !session_id) {
      throw Object.assign(new Error('website_id e session_id são obrigatórios'), { status: 400 });
    }

    // Monta a lista de tentativas: CNPJ primeiro, depois os candidatos a nome.
    const domCnpj = cnpj ? String(cnpj).trim() : '';
    const queries = [];
    if (domCnpj) queries.push(domCnpj);
    if (Array.isArray(candidates)) for (const c of candidates) if (c) queries.push(String(c).trim());
    if (company) queries.push(String(company).trim());

    // dedupe preservando ordem
    const seen = new Set();
    const uniq = queries.filter((q) => q && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()));
    if (!uniq.length) {
      return res.json({ found: false, updated: false, reason: 'nada relacionado a empresa no html' });
    }

    // Tenta cada query; para na primeira empresa que tenha CNPJ ou tenant.
    let match = null;
    let usedQuery = null;
    for (const q of uniq) {
      const best = pickBest(await searchCompanies(q), q);
      if (best && (best.document || best.tenant)) { match = best; usedQuery = q; break; }
      if (best && !match) { match = best; usedQuery = q; }
    }

    const finalCnpj = (match && match.document) || domCnpj || null;
    const tenant = (match && match.tenant) || null;

    if (!finalCnpj && !tenant) {
      return res.json({ found: !!match, updated: false, query: usedQuery, matched_name: match?.name || null, cnpj: null, tenant: null });
    }

    await updateConversation(website_id, session_id, {
      dataFields: { CNPJ: finalCnpj },   // grava o CNPJ nos dados da conversa
      segments: tenant ? [tenant] : [],  // adiciona o tenant como segmento
    });

    res.json({ found: true, updated: true, query: usedQuery, matched_name: match?.name || null, cnpj: finalCnpj, tenant });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Rotas genéricas ----------

app.get('/api/:resource', async (req, res) => {
  try {
    const resourceKey = req.params.resource;
    const embed = req.query.embed ? String(req.query.embed).split(',').filter(Boolean) : [];
    const orderBy = req.query.order_by ? String(req.query.order_by) : undefined;
    const orderDir = req.query.order_dir === 'desc' ? 'desc' : 'asc';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const countOnly = req.query.count === '1';
    const filters = parseFilters(req.query);

    if (countOnly) {
      const { count } = await listResource(resourceKey, { filters, countOnly: true });
      return res.json({ count });
    }

    const { rows } = await listResource(resourceKey, { embed, orderBy, orderDir, limit, filters });
    res.json({ data: rows });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/:resource', async (req, res) => {
  try {
    const resource = getResource(req.params.resource);
    const embed = req.query.embed ? String(req.query.embed).split(',').filter(Boolean) : [];
    const row = toDbRow(resource, req.body);
    const cols = Object.keys(row);
    const values = Object.values(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${resource.table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING ${selectListSql(resource)}`;
    const { rows } = await pool.query(sql, values);
    await attachEmbeds(rows, resource, embed);
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/:resource/:id', async (req, res) => {
  try {
    const resource = getResource(req.params.resource);
    const row = toDbRow(resource, req.body);
    const cols = Object.keys(row);
    const values = Object.values(row);
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    values.push(req.params.id);
    const sql = `UPDATE ${resource.table} SET ${setClause} WHERE id = $${values.length} RETURNING ${selectListSql(resource)}`;
    const { rows } = await pool.query(sql, values);
    res.json({ data: rows[0] ?? null });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/:resource/:id', async (req, res) => {
  try {
    const resource = getResource(req.params.resource);
    await pool.query(`DELETE FROM ${resource.table} WHERE id = $1`, [req.params.id]);
    res.json({ data: null });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Zticket API (ponte pro Postgres local) rodando em http://localhost:${PORT}`);
});
