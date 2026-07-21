const DEFAULTS = { backendUrl: 'http://localhost:3001', headerSelector: '', scopeSelector: '', excludeSelector: '', websiteId: '' };

const $ = (id) => document.getElementById(id);
function setStatus(html, cls) {
  const el = $('status');
  el.className = 'status' + (cls ? ' ' + cls : '');
  el.textContent = html;
}
function backendUrl() {
  return $('backendUrl').value.trim() || DEFAULTS.backendUrl;
}

// Compara versões "x.y.z" -> -1, 0, 1
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const CURRENT_VERSION = chrome.runtime.getManifest().version;
$('ver').textContent = `versão instalada: ${CURRENT_VERSION}`;

// Carrega config salva
chrome.storage.sync.get(DEFAULTS, (c) => {
  $('backendUrl').value = c.backendUrl || '';
  $('headerSelector').value = c.headerSelector || '';
  $('scopeSelector').value = c.scopeSelector || '';
  $('excludeSelector').value = c.excludeSelector || '';
  $('websiteId').value = c.websiteId || '';
});

$('save').addEventListener('click', () => {
  const cfg = {
    backendUrl: $('backendUrl').value.trim() || DEFAULTS.backendUrl,
    headerSelector: $('headerSelector').value.trim(),
    scopeSelector: $('scopeSelector').value.trim(),
    excludeSelector: $('excludeSelector').value.trim(),
    websiteId: $('websiteId').value.trim(),
  };
  chrome.storage.sync.set(cfg, () => setStatus('Configurações salvas.', 'ok'));
});

// ---- Detectar cabeçalho na aba do Crisp ----
$('detect').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !/^https:\/\/app\.crisp\.chat\//.test(tab.url || '')) {
      setStatus('Abra uma conversa no app.crisp.chat e tente de novo.', 'warn');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'detect' }, (snap) => {
      if (chrome.runtime.lastError || !snap) {
        setStatus('Não consegui falar com a página. Recarregue o Crisp.', 'err');
        return;
      }
      const cands = snap.candidates || [];
      const achou = snap.cnpj || cands.length > 0;
      setStatus(
        `CNPJ no HTML: ${snap.cnpj || '—'}\n` +
        `Candidatos a empresa: ${cands.length ? cands.join(' | ') : '—'}\n` +
        `Cabeçalho: ${snap.headerText || '(vazio)'}\n` +
        `website_id: ${snap.websiteId || '(não encontrado)'}\n` +
        `session_id: ${snap.sessionId || '(não encontrado)'}\n` +
        `— trecho varrido (início) —\n${snap.scopePreview || '(vazio)'}`,
        achou ? 'ok' : 'warn'
      );
    });
  });
});

// ---- Testar backend / Crisp ----
$('testStatus').addEventListener('click', () => {
  setStatus('Consultando backend...');
  chrome.runtime.sendMessage({ type: 'health', payload: { backendUrl: backendUrl() } }, (r) => {
    if (!r || !r.ok) {
      const detalhe = (r && r.data && r.data.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta';
      setStatus(`Backend inacessível: ${detalhe}\nBackend está rodando? Tente trocar a URL para http://127.0.0.1:3001 e salvar.`, 'err');
      return;
    }
    const d = r.data || {};
    const cls = d.db && d.crisp ? 'ok' : d.db ? 'warn' : 'err';
    setStatus(
      `Backend: OK\n` +
      `Banco de dados: ${d.db ? 'conectado ✓' : 'FORA ✗ (verifique o Postgres)'}\n` +
      `Crisp: ${d.crisp ? 'configurado ✓' : 'não configurado (falta CRISP_IDENTIFIER/CRISP_KEY)'}`,
      cls
    );
  });
});

// ---- Verificar atualização ----
$('checkUpdate').addEventListener('click', () => {
  setStatus('Verificando versão...');
  $('reload').style.display = 'none';
  chrome.runtime.sendMessage({ type: 'version', payload: { backendUrl: backendUrl() } }, (r) => {
    if (!r || !r.ok || !r.data || !r.data.version) {
      setStatus('Não foi possível checar a versão (backend inacessível?).', 'err');
      return;
    }
    const latest = r.data.version;
    const c = cmpVersion(CURRENT_VERSION, latest);
    if (c < 0) {
      setStatus(`Nova versão disponível: ${latest} (instalada: ${CURRENT_VERSION}).\nAtualize os arquivos da pasta da extensão e clique em Recarregar.`, 'warn');
      $('reload').style.display = 'block';
    } else {
      setStatus(`Você está na versão mais recente (${CURRENT_VERSION}).`, 'ok');
    }
  });
});

// Recarrega a extensão a partir dos arquivos em disco (fecha o popup)
$('reload').addEventListener('click', () => {
  chrome.runtime.reload();
});

// ---- Buscar no banco do Z-Ticket (nome, tenant ou CNPJ) ----
function renderResults(results) {
  const box = $('results');
  box.innerHTML = '';
  if (!results.length) {
    setStatus('Nenhuma empresa encontrada.', 'warn');
    return;
  }
  setStatus(`${results.length} resultado(s).`, 'ok');
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'result';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      (r.document ? `CNPJ ${r.document}` : 'Sem CNPJ') +
      (r.tenant ? ` · Tenant: ${r.tenant}` : '');
    div.appendChild(name);
    div.appendChild(meta);
    box.appendChild(div);
  }
}

function doSearch() {
  const q = $('searchQ').value.trim();
  $('results').innerHTML = '';
  if (!q) { setStatus('Digite um nome, tenant ou CNPJ.', 'warn'); return; }
  setStatus('Buscando no banco...');
  chrome.runtime.sendMessage({ type: 'search', payload: { backendUrl: backendUrl(), q } }, (r) => {
    if (!r || !r.ok) { setStatus('Erro ao consultar o backend.', 'err'); return; }
    renderResults((r.data && r.data.results) || []);
  });
}

$('searchBtn').addEventListener('click', doSearch);
$('searchQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
