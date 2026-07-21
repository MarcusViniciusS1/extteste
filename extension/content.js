// Content script — roda dentro do app.crisp.chat.
//
// A cada ciclo varre o HTML da CONVERSA ABERTA (escopo) procurando um CNPJ ou
// nome de empresa. Ignora a LISTA DA FILA de atendimento (excludeSelector) para
// não capturar empresas de outras conversas. Se achar algo, pede ao backend do
// Z-Ticket para resolver e gravar CNPJ + tenant no Crisp.

const DEFAULTS = {
  backendUrl: 'http://localhost:3001',
  headerSelector: '',   // seletor do nome/cabeçalho (opcional)
  scopeSelector: '',    // área a varrer (a conversa aberta); vazio = automático
  excludeSelector: '',  // fila a ignorar; vazio = candidatos automáticos
  websiteId: '',
};

let cfg = { ...DEFAULTS };
let lastKey = '';

chrome.storage.sync.get(DEFAULTS, (c) => { cfg = { ...DEFAULTS, ...c }; });
chrome.storage.onChanged.addListener((changes) => {
  for (const k of Object.keys(changes)) cfg[k] = changes[k].newValue;
});

// Candidatos (o DOM do Crisp muda; ajuste no popup se necessário).
const CANDIDATE_HEADERS = [
  '.c-conversation-box-top-identity-name',
  '[class*="conversation-box-top"] [class*="identity-name"]',
  '[class*="conversation"] [class*="header"] [class*="name"]',
];
// Por padrão varremos a página inteira (menos a fila). Excludes conservadores:
// mira só a LISTA da fila, sem risco de zerar o conteúdo da conversa.
const CANDIDATE_EXCLUDES = [
  '[class*="conversation-list"]',
  '[class*="conversations-list"]',
  '[class*="inbox-list"]',
];

function qsa(sel) {
  const out = [];
  if (!sel) return out;
  try { document.querySelectorAll(sel).forEach((e) => out.push(e)); } catch { /* seletor inválido */ }
  return out;
}

function excludeEls() {
  const els = [];
  const sels = [cfg.excludeSelector, ...CANDIDATE_EXCLUDES].filter(Boolean);
  for (const s of sels) for (const e of qsa(s)) els.push(e);

  // Heurística sem seletor: a fila é uma lista de conversas, e cada item
  // referencia o session_id da SUA conversa. Excluímos qualquer item que
  // aponte para uma conversa DIFERENTE da aberta — assim a fila não é varrida.
  const current = (getSessionId() || '').toLowerCase();
  try {
    document
      .querySelectorAll('a[href*="session_"], [data-session-id], [data-session], [data-crisp-session-id]')
      .forEach((el) => {
        const ref =
          el.getAttribute('href') ||
          el.getAttribute('data-session-id') ||
          el.getAttribute('data-session') ||
          el.getAttribute('data-crisp-session-id') ||
          '';
        const m = ref.match(/session_[0-9a-f-]+/i);
        if (m && m[0].toLowerCase() !== current) {
          els.push(el.closest('li, [role="listitem"], [class*="item"], [class*="conversation"]') || el);
        }
      });
  } catch { /* ignora */ }
  return els;
}

function scopeRoots() {
  if (cfg.scopeSelector) {
    const el = document.querySelector(cfg.scopeSelector);
    return el ? [el] : [document.body];
  }
  // padrão: página inteira (a fila é removida pelos excludes)
  return [document.body];
}

function isExcluded(node, excludes) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !!el && excludes.some((ex) => ex.contains(el));
}

// Texto da área da conversa, pulando a fila (excludes).
function scopedText() {
  const roots = scopeRoots();
  const excludes = excludeEls();
  const parts = [];
  for (const root of roots) {
    if (isExcluded(root, excludes)) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue && node.nodeValue.trim();
        if (!v) return NodeFilter.FILTER_REJECT;
        if (isExcluded(node, excludes)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) parts.push(n.nodeValue.trim());
  }
  return parts.join('\n');
}

function findCnpj(text) {
  const m = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (m) return m[0];
  const bare = text.match(/(?<!\d)\d{14}(?!\d)/);
  return bare ? bare[0] : '';
}

function readHeaderText() {
  const roots = scopeRoots();
  const excludes = excludeEls();
  const sels = [cfg.headerSelector, ...CANDIDATE_HEADERS].filter(Boolean);
  for (const root of roots) {
    if (isExcluded(root, excludes)) continue;
    for (const sel of sels) {
      try {
        const el = root.querySelector(sel);
        const t = el && el.textContent ? el.textContent.trim() : '';
        if (t && !isExcluded(el, excludes)) return t;
      } catch { /* ignora seletor inválido */ }
    }
  }
  return '';
}

// "João Silva - Acme Ltda" -> { contact, company }
function parseHeader(text) {
  if (!text) return null;
  const m = text.match(/^(.*?)\s[-–—]\s(.+)$/);
  if (!m) return { contact: text.trim(), company: '' };
  return { contact: m[1].trim(), company: m[2].trim() };
}

function getWebsiteId() {
  if (cfg.websiteId) return cfg.websiteId;
  const m = location.href.match(/\/website\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : '';
}
function getSessionId() {
  const m = location.href.match(/(session_[0-9a-f-]+)/i);
  return m ? m[1] : '';
}

// Coleta candidatos a nome de empresa: do cabeçalho e de QUALQUER linha no
// formato "Algo - Empresa" (nome do dispositivo/visitante, segmento, etc.).
// É liberal de propósito: o backend só grava se o candidato casar com uma
// empresa real no banco, então candidato errado simplesmente não faz nada.
function extractCandidates(headerText, scanText) {
  const set = new Set();
  const add = (v) => {
    const c = String(v || '').trim();
    if (c && c.length >= 2 && c.length <= 80 && !/^\d{2}\.\d{3}\.\d{3}/.test(c)) set.add(c);
  };
  const h = parseHeader(headerText);
  if (h && h.company) add(h.company);
  for (const line of scanText.split('\n')) {
    const m = line.match(/^(.{1,60}?)\s[-–—]\s(.{2,60})$/);
    if (m) add(m[2]);
  }
  return [...set].slice(0, 15);
}

function snapshot() {
  const headerText = readHeaderText();
  const text = scopedText();
  return {
    headerText,
    parsed: parseHeader(headerText),
    cnpj: findCnpj(text),
    candidates: extractCandidates(headerText, text),
    websiteId: getWebsiteId(),
    sessionId: getSessionId(),
    scopePreview: text.slice(0, 1500),
  };
}

function tick() {
  const s = snapshot();
  if (!s.sessionId || !s.websiteId) return;
  const cnpj = s.cnpj || '';
  const candidates = s.candidates || [];
  if (!cnpj && candidates.length === 0) return;

  const key = `${s.sessionId}|${cnpj}|${candidates.join(',').toLowerCase()}`;
  if (key === lastKey) return;
  lastKey = key;

  chrome.runtime.sendMessage(
    {
      type: 'enrich',
      payload: {
        backendUrl: cfg.backendUrl,
        website_id: s.websiteId,
        session_id: s.sessionId,
        cnpj,
        candidates,
        company: candidates[0] || '',
      },
    },
    (resp) => {
      if (chrome.runtime.lastError) { lastKey = ''; return; }
      handleResult(cnpj || candidates[0] || 'empresa', resp);
    }
  );
}

function handleResult(label, resp) {
  if (!resp || !resp.ok) {
    const err = resp && resp.data && resp.data.error ? resp.data.error : 'falha ao contatar o backend';
    lastKey = '';
    toast(`Erro: ${err}`, 'error');
    return;
  }
  const d = resp.data || {};
  if (d.updated) {
    const partes = [];
    if (d.cnpj) partes.push(`CNPJ ${d.cnpj}`);
    if (d.tenant) partes.push(`tenant "${d.tenant}"`);
    toast(`"${label}" → ${partes.join(' · ')} gravado no Crisp`, 'ok');
  } else if (d.found === false && d.reason) {
    // nada relacionado a empresa — silencioso
  } else {
    toast(`Nada gravado para "${label}" (sem correspondência com CNPJ/tenant)`, 'warn');
  }
}

// ---- Toast ----
let toastEl = null;
function toast(message, kind) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;' +
      'padding:10px 14px;border-radius:10px;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;' +
      'color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.3);transition:opacity .3s;opacity:0;';
    document.body.appendChild(toastEl);
  }
  toastEl.style.background = kind === 'ok' ? '#16a34a' : kind === 'error' ? '#dc2626' : '#d97706';
  toastEl.textContent = message;
  toastEl.style.opacity = '1';
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, 4000);
}

// Responde ao popup ("Detectar agora")
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'detect') sendResponse(snapshot());
  return true;
});

setInterval(tick, 1500);
