chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const API_BASE = 'http://localhost:3001/api/empresas';
  const API_ROOT = 'http://localhost:3001/api';

  // Helpers para o drawer de registro (retornam { ok, data } | { ok:false, error }).
  async function apiGet(path) {
    try {
      const res = await fetch(`${API_ROOT}${path}`);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  async function apiPost(path, body) {
    try {
      const res = await fetch(`${API_ROOT}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  // Abre o painel lateral na aba de onde veio o clique (sempre uma aba do Crisp,
  // pois o content script só roda lá).
  // IMPORTANTE: chrome.sidePanel.open() só funciona dentro do gesto do usuário,
  // então NÃO pode haver await antes dele. O path vem do default_path do
  // manifest; o setOptions abaixo é reforço não-bloqueante (reabilita a aba caso
  // um listener a tenha desabilitado).
  if (request.action === "openSidePanel") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) { sendResponse({ ok: false, error: 'sem aba' }); return true; }
    chrome.sidePanel.setOptions({ tabId, path: 'drawer.html', enabled: true });
    chrome.sidePanel.open({ tabId })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // O Side Panel pede o contexto da conversa: repassa para o content script
  // da aba ativa do Crisp e devolve { ok, found, data, extra }.
  if (request.action === "getContext") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !/app\.crisp\.chat/.test(tab.url || '')) {
        sendResponse({ ok: false, error: 'not-crisp' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'validateCurrent' }, (r) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, found: !!(r && r.found), data: r && r.data, extra: (r && r.extra) || {} });
      });
    });
    return true;
  }

  if (request.action === "getAttendants") {
    apiGet('/attendants?order_by=name&order_dir=asc').then(sendResponse);
    return true;
  }

  if (request.action === "searchCompany") {
    apiGet(`/lookup/company?q=${encodeURIComponent(request.query || '')}`).then(sendResponse);
    return true;
  }

  if (request.action === "createTicket") {
    apiPost('/tickets', request.ticket).then(sendResponse);
    return true;
  }

  if (request.action === "createLog") {
    apiPost('/system_logs', request.log).then(sendResponse);
    return true;
  }

  if (request.action === "searchDatabase") {
    const candidates = request.query;

    fetch(`${API_BASE}/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates })
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data && data.found) { 
          sendResponse({ success: true, data: data.data });
        } else {
          sendResponse({ success: false, reason: "NOT_FOUND" });
        }
      })
      .catch(error => {
        sendResponse({ success: false, reason: "API_ERROR", message: error.message });
      });

    return true; 
  }

  if (request.action === "testConnection") {
    fetch(`${API_BASE}?limit=1`)
      .then(response => {
        if (response.ok) {
          sendResponse({ success: true });
        } else {
          throw new Error(`Erro HTTP: ${response.status}`);
        }
      })
      .catch(error => {
        sendResponse({ success: false, message: error.message });
      });

    return true;
  }
});

// ---- Restringe o painel lateral às abas do Crisp ----
// Sem default_path global no manifest, o painel não fica disponível em nenhuma
// aba por padrão. Aqui habilitamos só nas abas do Crisp e desabilitamos nas
// demais — assim, ao trocar de aba/página, o painel some fora do Crisp.
const CRISP_RE = /^https:\/\/app\.crisp\.chat\//;

async function syncSidePanel(tabId, url) {
  try {
    if (url && CRISP_RE.test(url)) {
      await chrome.sidePanel.setOptions({ tabId, path: 'drawer.html', enabled: true });
    } else {
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
    }
  } catch (e) {
    /* aba pode não existir mais */
  }
}

// Navegação/carregamento dentro de uma aba (inclui sair do Crisp).
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || typeof info.url === 'string') {
    syncSidePanel(tabId, tab && tab.url);
  }
});

// Troca de aba ativa.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    syncSidePanel(tabId, tab && tab.url);
  });
});