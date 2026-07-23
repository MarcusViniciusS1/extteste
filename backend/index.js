// Servidor-ponte: expõe uma API REST com nomes/campos em inglês (os mesmos
// que o app React já usa), mas por baixo dos panos fala com o Postgres
// local em português (zorte_tickets). O app não precisa saber que o banco
// está em português — só esse arquivo sabe.

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { pool, ping } from './db.js';
import { RESOURCES } from './resources.js';
import { analyzeTicket, claudeConfigured } from './claude.js';
import { updateConversation, upsertPeopleProfile, crispConfigured } from './crisp.js';

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
// Guarda o corpo cru da requisição (req.rawBody) além do já parseado (req.body):
// necessário para validar a assinatura HMAC do webhook do Linear.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

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

app.get('/api/ai/status', (req, res) => {
  res.json({ configured: claudeConfigured, model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8' });
});

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

async function searchCompanies(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const like = `%${query}%`;
  const digits = query.replace(/\D/g, '');
  const digitsLike = digits ? `%${digits}%` : null;
  const params = [like, digitsLike];

  const sqlComTenant =
    `SELECT e.id, e.nome AS name, e.documento AS document, i.nome AS tenant
       FROM empresas e
       LEFT JOIN inquilinos i ON i.id = e.inquilino_id
      WHERE e.nome ILIKE $1
         OR e.documento ILIKE $1
         OR i.nome ILIKE $1
         OR ($2::text IS NOT NULL AND regexp_replace(coalesce(e.documento,''), '[^0-9]', '', 'g') LIKE $2)
      ORDER BY e.nome
      LIMIT 25`;
  // Fallback caso a tabela inquilinos / coluna inquilino_id não exista.
  const sqlSemTenant =
    `SELECT e.id, e.nome AS name, e.documento AS document
       FROM empresas e
      WHERE e.nome ILIKE $1
         OR e.documento ILIKE $1
         OR ($2::text IS NOT NULL AND regexp_replace(coalesce(e.documento,''), '[^0-9]', '', 'g') LIKE $2)
      ORDER BY e.nome
      LIMIT 25`;

  try {
    const { rows } = await pool.query(sqlComTenant, params);
    return rows;
  } catch (e) {
    console.warn('⚠️ [searchCompanies] busca por tenant indisponível, usando fallback sem tenant:', e.message);
    const { rows } = await pool.query(sqlSemTenant, params);
    return rows;
  }
}

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

async function lookupCnpj(company) {
  const rows = await searchCompanies(company);
  return pickBest(rows, company);
}

app.get('/api/crisp/status', (req, res) => {
  res.json({ crisp: crispConfigured });
});

const EXTENSION_VERSION = '1.3.1';
app.get('/api/extension/version', (req, res) => {
  res.json({ version: EXTENSION_VERSION });
});

app.get('/api/health', async (req, res) => {
  let db = false;
  try { db = await ping(); } catch { db = false; }
  res.json({ ok: true, db, crisp: crispConfigured });
});

app.get('/api/lookup/company', async (req, res) => {
  try {
    const results = await searchCompanies(String(req.query.q || ''));
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

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

app.post('/api/crisp/enrich', async (req, res) => {
  try {
    const { website_id, session_id, company, cnpj, candidates } = req.body || {};
    if (!website_id || !session_id) {
      throw Object.assign(new Error('website_id e session_id são obrigatórios'), { status: 400 });
    }

    const domCnpj = cnpj ? String(cnpj).trim() : '';
    const queries = [];
    if (domCnpj) queries.push(domCnpj);
    if (Array.isArray(candidates)) for (const c of candidates) if (c) queries.push(String(c).trim());
    if (company) queries.push(String(company).trim());

    const seen = new Set();
    const uniq = queries.filter((q) => q && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()));
    if (!uniq.length) {
      return res.json({ found: false, updated: false, reason: 'nada relacionado a empresa no html' });
    }

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
      dataFields: { CNPJ: finalCnpj },
      segments: tenant ? [tenant] : [],
    });

    res.json({ found: true, updated: true, query: usedQuery, matched_name: match?.name || null, cnpj: finalCnpj, tenant });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


// Salva o contato no banco local (tabela contatos), deduplicando por telefone.
async function saveLocalContact({ name, phone }) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits) {
    const { rows: ex } = await pool.query(
      `SELECT id, nome AS name, telefone AS phone
         FROM contatos
        WHERE regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') = $1
        LIMIT 1`,
      [digits]
    );
    if (ex.length) return { row: ex[0], existed: true };
  }
  const { rows } = await pool.query(
    `INSERT INTO contatos (nome, telefone) VALUES ($1, $2)
     RETURNING id, nome AS name, telefone AS phone`,
    [name || null, phone || null]
  );
  return { row: rows[0], existed: false };
}

// Adiciona o contato da conversa na aba Contatos do Crisp (People) e no banco
// local. Sucesso parcial é reportado: se o Crisp falhar, o save local ainda
// acontece (e vice-versa), com o erro devolvido em crispError/localError.
app.post('/api/crisp/contact', async (req, res) => {
  try {
    const { website_id, name, phone, email } = req.body || {};
    if (!name && !phone) {
      throw Object.assign(new Error('Informe ao menos nome ou telefone'), { status: 400 });
    }

    // 1) Aba Contatos do Crisp (People)
    let crisp = null;
    let crispError = null;
    if (website_id) {
      try {
        crisp = await upsertPeopleProfile(website_id, { name, phone, email });
      } catch (e) {
        crispError = e.message;
      }
    } else {
      crispError = 'website_id ausente na URL do Crisp';
    }

    // 2) Banco local (contatos)
    let contact = null;
    let localError = null;
    try {
      const r = await saveLocalContact({ name, phone });
      contact = { ...r.row, existed: r.existed };
    } catch (e) {
      localError = e.message;
    }

    res.json({ ok: true, crisp, crispError, contact, localError });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- NOVA ROTA DA EXTENSÃO ----------
// 1. Rota GET: Mantida apenas para testar se a conexão da extensão está viva
app.get('/api/empresas', async (req, res) => {
  try {
    const { limit } = req.query;
    if (limit === '1') {
      const result = await pool.query('SELECT id, nome AS name, documento AS document FROM empresas LIMIT 1');
      return res.json(result.rows);
    }
    const result = await pool.query('SELECT id, nome AS name, documento AS document FROM empresas');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Rota POST: Busca agressiva recebendo VÁRIOS candidatos simultâneos (Tags, Nome, CNPJ)
app.post('/api/empresas/validar', async (req, res) => {
  try {
    const { candidates } = req.body;

    // Se a extensão não mandou nada, retorna falso
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.json({ found: false });
    }

    // Tira os repetidos
    const uniq = [...new Set(candidates.map(c => String(c).trim()).filter(Boolean))];

    // Query com tenant (inquilinos). Preferida.
    const sqlComTenant = `
      SELECT e.id, e.nome AS name, e.documento AS document, i.nome AS tenant
      FROM empresas e
      LEFT JOIN inquilinos i ON i.id = e.inquilino_id
      WHERE e.nome ILIKE $1
         OR i.nome ILIKE $1
         OR e.documento ILIKE $1
         OR ($2::text IS NOT NULL AND regexp_replace(coalesce(e.documento,''), '[^0-9]', '', 'g') LIKE $2)
      LIMIT 1
    `;
    // Fallback sem tenant, caso a tabela inquilinos / coluna inquilino_id não
    // exista neste banco (migração de tenant não aplicada). Evita quebrar a
    // identificação de empresas.
    const sqlSemTenant = `
      SELECT e.id, e.nome AS name, e.documento AS document
      FROM empresas e
      WHERE e.nome ILIKE $1
         OR e.documento ILIKE $1
         OR ($2::text IS NOT NULL AND regexp_replace(coalesce(e.documento,''), '[^0-9]', '', 'g') LIKE $2)
      LIMIT 1
    `;

    let usarTenant = true;

    // Testa candidato por candidato
    for (const q of uniq) {
      const like = `%${q}%`;
      // Extrai os números do candidato (útil se for um CNPJ não formatado testando contra o formatado no DB)
      const digits = q.replace(/\D/g, '');
      const digitsLike = digits ? `%${digits}%` : null;
      const paramsArr = [like, digitsLike];

      let result = null;
      if (usarTenant) {
        try {
          result = await pool.query(sqlComTenant, paramsArr);
        } catch (e) {
          console.warn('⚠️ [validar] busca por tenant indisponível, usando fallback sem tenant:', e.message);
          usarTenant = false;
        }
      }
      if (!usarTenant) {
        result = await pool.query(sqlSemTenant, paramsArr);
      }

      // Se encontrou batendo o nome OR tenant OR CNPJ, já retorna sucesso e para o loop!
      if (result && result.rows.length > 0) {
        return res.json({ found: true, data: result.rows[0] });
      }
    }

    // Se rodou tudo e não achou, não existe no banco
    res.json({ found: false });

  } catch (error) {
    console.error('❌ Erro na rota POST /api/empresas/validar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ---------- Integração com o Linear (linear.app) ----------
// Quando uma issue vinculada a um ticket (ticket.linear_issue_id, colado
// manualmente pelo atendente na tela do ticket) muda de status no Linear, o
// Linear chama este webhook. Localizamos o ticket pelo identificador da issue
// e criamos uma notificação para o atendente responsável — ele vê no sino de
// notificações do sistema e avisa o cliente específico.
//
// ATENÇÃO — integração ainda não é ponta-a-ponta: o Linear exige uma URL
// pública HTTPS para configurar o webhook, e este backend roda em
// localhost:3001 por padrão. A rota já fica pronta para ligar assim que
// houver uma URL pública (deploy ou túnel) e o Signing Secret do Linear.

const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET || '';

function linearSignatureValida(req) {
  if (!LINEAR_WEBHOOK_SECRET) return true; // sem secret configurado: aceita (modo dev/teste)
  const recebida = req.header('Linear-Signature') || req.header('linear-signature');
  if (!recebida || !req.rawBody) return false;
  const calc = crypto.createHmac('sha256', LINEAR_WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return recebida === calc;
}

app.post('/api/linear/webhook', async (req, res) => {
  try {
    if (!linearSignatureValida(req)) {
      console.warn('⚠️ [linear/webhook] assinatura inválida — pedido recusado.');
      return res.status(401).json({ ok: false, error: 'assinatura inválida' });
    }

    const data = (req.body && req.body.data) || {};
    const issueIdentifier = data.identifier || data.id;
    const stateName = data.state && data.state.name;

    if (!issueIdentifier) {
      return res.status(200).json({ ok: false, reason: 'sem identificador de issue no payload' });
    }

    const { rows } = await pool.query(
      `SELECT id, numero_ticket, atendente_id FROM tickets WHERE linear_issue_id = $1 LIMIT 1`,
      [issueIdentifier]
    );
    const ticket = rows[0];
    if (!ticket) {
      return res.status(200).json({ ok: false, reason: `nenhum ticket vinculado à issue ${issueIdentifier}` });
    }
    if (!ticket.atendente_id) {
      return res.status(200).json({ ok: false, reason: 'ticket sem atendente responsável para notificar' });
    }

    const mensagem = `Sugestão do ticket #${ticket.numero_ticket ?? ticket.id} teve retorno no Linear (${issueIdentifier})${stateName ? `: ${stateName}` : ''}.`;
    await pool.query(
      `INSERT INTO notificacoes (atendente_id, ticket_id, mensagem) VALUES ($1, $2, $3)`,
      [ticket.atendente_id, ticket.id, mensagem]
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ [linear/webhook] erro:', err);
    // Responde 200 mesmo em erro para o Linear não ficar re-tentando indefinidamente.
    res.status(200).json({ ok: false, error: err.message });
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