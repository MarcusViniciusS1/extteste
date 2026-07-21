chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const API_BASE = 'http://localhost:3001/api/empresas';

  // Ação 1: Validar enviando a lista de nomes/segmentos/cnpj
  if (request.action === "searchDatabase") {
    const candidates = request.query; // Agora é um array

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

  // Ação 2: Testar conexão com o banco de dados
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