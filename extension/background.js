// Service worker: faz as chamadas HTTP ao backend do Z-Ticket. Rodar aqui (e não
// no content script) evita bloqueios de CORS, pois o worker tem host_permissions.

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

// Se a URL usa localhost, oferece 127.0.0.1 como alternativa (e vice-versa).
// Em algumas instalações do Chrome o service worker resolve um e não o outro.
function altUrl(url) {
  if (url.includes('://localhost')) return url.replace('://localhost', '://127.0.0.1');
  if (url.includes('://127.0.0.1')) return url.replace('://127.0.0.1', '://localhost');
  return null;
}

async function rawFetch(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Faz o fetch; se der erro de rede (não uma resposta HTTP), tenta o host alternativo.
async function request(backendUrl, path, options) {
  const url = `${trimSlash(backendUrl)}${path}`;
  try {
    return await rawFetch(url, options);
  } catch (err) {
    const alt = altUrl(url);
    if (alt) return await rawFetch(alt, options);
    throw err;
  }
}

async function post(backendUrl, path, body) {
  return request(backendUrl, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function get(backendUrl, path) {
  return request(backendUrl, path, {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'enrich') {
        const { backendUrl, website_id, session_id, company, cnpj, candidates } = msg.payload;
        const r = await post(backendUrl, '/api/crisp/enrich', { website_id, session_id, company, cnpj, candidates });
        sendResponse(r);
      } else if (msg.type === 'lookup') {
        const { backendUrl, company } = msg.payload;
        const r = await get(backendUrl, `/api/lookup/cnpj?company=${encodeURIComponent(company)}`);
        sendResponse(r);
      } else if (msg.type === 'status') {
        const r = await get(msg.payload.backendUrl, '/api/crisp/status');
        sendResponse(r);
      } else if (msg.type === 'health') {
        const r = await get(msg.payload.backendUrl, '/api/health');
        sendResponse(r);
      } else if (msg.type === 'search') {
        const { backendUrl, q } = msg.payload;
        const r = await get(backendUrl, `/api/lookup/company?q=${encodeURIComponent(q)}`);
        sendResponse(r);
      } else if (msg.type === 'version') {
        const r = await get(msg.payload.backendUrl, '/api/extension/version');
        sendResponse(r);
      } else {
        sendResponse({ ok: false, status: 0, data: { error: 'tipo desconhecido' } });
      }
    } catch (err) {
      sendResponse({ ok: false, status: 0, data: { error: String(err && err.message ? err.message : err) } });
    }
  })();
  return true; // resposta assíncrona
});
