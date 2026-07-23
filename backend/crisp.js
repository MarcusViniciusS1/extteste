// Cliente da API REST do Crisp.
//
// Usado para gravar dados na conversa (ex: a etiqueta "CNPJ"). As credenciais
// ficam SOMENTE aqui no backend, via backend/.env:
//   CRISP_IDENTIFIER, CRISP_KEY  -> token de plugin do Crisp (Marketplace)
//
// Como obter: https://marketplace.crisp.chat/ -> crie um plugin -> gere um
// token de produção com escopo de escrita em "Conversation data". O token vem
// no formato "identifier:key".

const CRISP_API = 'https://api.crisp.chat/v1';

const identifier = process.env.CRISP_IDENTIFIER;
const key = process.env.CRISP_KEY;

export const crispConfigured = Boolean(identifier && key);

function authHeaders() {
  const basic = Buffer.from(`${identifier}:${key}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'X-Crisp-Tier': 'plugin',
    'Content-Type': 'application/json',
  };
}

async function crispFetch(path, options = {}) {
  const res = await fetch(`${CRISP_API}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.reason || json?.data?.message || `Crisp API ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return json.data ?? json;
}

// Lê os metadados atuais da conversa (para não sobrescrever outros dados).
async function getConversationMeta(websiteId, sessionId) {
  return crispFetch(`/website/${websiteId}/conversation/${sessionId}/meta`);
}

// Cria (ou reconhece já existente) um perfil na aba Contatos do Crisp (People).
// Requer que o token do plugin tenha o escopo "People > Write"
// (website:people:write) e esteja conectado ao website.
//
// O Crisp indexa People por E-MAIL. Contatos só-WhatsApp não têm e-mail, então
// sintetizamos um a partir do telefone (ex.: 5584999999999@whatsapp.contato).
export async function upsertPeopleProfile(websiteId, { name, phone, email } = {}) {
  if (!crispConfigured) {
    throw Object.assign(new Error('Credenciais do Crisp não configuradas no backend/.env'), { status: 503 });
  }

  const digits = String(phone || '').replace(/\D/g, '');
  const finalEmail = (email && String(email).trim()) || (digits ? `${digits}@whatsapp.contato` : '');
  if (!finalEmail) {
    throw Object.assign(new Error('Contato sem e-mail nem telefone — o Crisp exige um identificador'), { status: 400 });
  }

  const person = {};
  if (name) person.nickname = String(name).trim();
  if (phone) person.phone = String(phone).trim();

  try {
    const created = await crispFetch(`/website/${websiteId}/people/profile`, {
      method: 'POST',
      body: JSON.stringify({ email: finalEmail, person }),
    });
    return { created: true, existed: false, email: finalEmail, people_id: created?.people_id || null };
  } catch (e) {
    // 409 = perfil com esse e-mail já existe: para o nosso objetivo (garantir
    // que o contato esteja salvo) isso é sucesso.
    if (e.status === 409) return { created: false, existed: true, email: finalEmail };
    throw e;
  }
}

// Atualiza a conversa no Crisp, preservando o que já existe:
//  - dataFields: objeto { chave: valor } gravado em "data" (ex: { CNPJ: '...' }).
//  - segments: lista de segmentos a garantir na conversa (ex: o tenant).
// Faz merge com os dados/segmentos atuais para não apagar nada.
export async function updateConversation(websiteId, sessionId, { dataFields = {}, segments = [] } = {}) {
  if (!crispConfigured) {
    throw Object.assign(new Error('Credenciais do Crisp não configuradas no backend/.env'), { status: 503 });
  }

  let existingData = {};
  let existingSegments = [];
  try {
    const meta = await getConversationMeta(websiteId, sessionId);
    existingData = meta?.data || {};
    existingSegments = Array.isArray(meta?.segments) ? meta.segments : [];
  } catch {
    // se não conseguir ler, segue com valores vazios (o PATCH abaixo cria)
  }

  const body = {};

  const dataEntries = Object.entries(dataFields).filter(([, v]) => v != null && v !== '');
  if (dataEntries.length) {
    body.data = { ...existingData, ...Object.fromEntries(dataEntries) };
  }

  const cleanSegments = segments.map((s) => String(s).trim()).filter(Boolean);
  if (cleanSegments.length) {
    // união, sem diferenciar maiúsculas/minúsculas, preservando os existentes
    const seen = new Set(existingSegments.map((s) => s.toLowerCase()));
    const merged = [...existingSegments];
    for (const s of cleanSegments) {
      if (!seen.has(s.toLowerCase())) { merged.push(s); seen.add(s.toLowerCase()); }
    }
    body.segments = merged;
  }

  if (!body.data && !body.segments) return { data: existingData, segments: existingSegments };

  await crispFetch(`/website/${websiteId}/conversation/${sessionId}/meta`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return { data: body.data ?? existingData, segments: body.segments ?? existingSegments };
}
