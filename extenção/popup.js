document.addEventListener("DOMContentLoaded", () => {
  const btnSearch = document.getElementById("btn-search");
  const btnManual = document.getElementById("btn-manual");
  const btnTestConn = document.getElementById("btn-test-conn");
  
  const statusContainer = document.getElementById("status-container");
  const loadingState = document.getElementById("loading-state");
  const resultState = document.getElementById("result-state");
  const resultMessage = document.getElementById("result-message");
  const validationData = document.getElementById("validation-data");
  
  const testContainer = document.getElementById("test-container");
  const testMessage = document.getElementById("test-message");

  const FRONTEND_URL = "http://localhost:5173";

  function setUIState(state, options = {}) {
    statusContainer.classList.remove("hidden");
    loadingState.classList.add("hidden");
    resultState.classList.add("hidden");
    btnManual.classList.add("hidden");
    validationData.classList.add("hidden");

    if (state === "loading") {
      loadingState.classList.remove("hidden");
      btnSearch.disabled = true;
    } else if (state === "result") {
      resultState.classList.remove("hidden");
      btnSearch.disabled = false;
      
      resultMessage.textContent = options.message || "";
      resultMessage.className = `message ${options.isError ? "error-msg" : "success-msg"}`;
      
      if (options.dbData) {
        validationData.innerHTML = `
          <strong>Empresa Validada:</strong>
          Nome: ${options.dbData.name || options.dbData.nome}<br>
          Doc: ${options.dbData.document || options.dbData.documento || 'N/A'}
        `;
        validationData.classList.remove("hidden");
      }

      if (options.showManualBtn) {
        btnManual.classList.remove("hidden");
      }
    }
  }

  // --- 1. AÇÃO: BUSCAR E VALIDAR EMPRESA ---
  btnSearch.addEventListener("click", async () => {
    setUIState("loading");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url.includes("app.crisp.chat")) {
        setUIState("result", { message: "Disponível apenas no Crisp.", isError: true });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "extractTenant" }, (response) => {
        // Se a lista de candidatos vier vazia
        if (chrome.runtime.lastError || !response || !response.success || !response.data || response.data.length === 0) {
          setUIState("result", { 
            message: "Nenhuma tag ou nome identificável na tela.", 
            isError: true, 
            showManualBtn: true 
          });
          return;
        }

        const candidatesArray = response.data;

        chrome.runtime.sendMessage({ action: "searchDatabase", query: candidatesArray }, (apiResponse) => {
          if (apiResponse && apiResponse.success) {
            setUIState("result", { 
              message: "Validado com sucesso! Abrindo...", 
              dbData: apiResponse.data 
            });
            
            const idEmpresa = apiResponse.data.id || '';
            setTimeout(() => {
              window.open(`${FRONTEND_URL}/empresa/${idEmpresa}`, "_blank");
            }, 1500);

          } else {
            setUIState("result", { 
              message: `Nenhum dos segmentos constam no banco.`, 
              isError: true, 
              showManualBtn: true 
            });
          }
        });
      });
    } catch (error) {
      setUIState("result", { message: "Erro interno na extensão.", isError: true, showManualBtn: true });
    }
  });

  // --- 2. AÇÃO: TESTAR CONEXÃO ---
  btnTestConn.addEventListener("click", () => {
    testContainer.classList.remove("hidden");
    testMessage.textContent = "Testando conexão...";
    testMessage.className = "message";
    btnTestConn.disabled = true;

    chrome.runtime.sendMessage({ action: "testConnection" }, (response) => {
      btnTestConn.disabled = false;
      if (response && response.success) {
        testMessage.textContent = "✅ Banco conectado e respondendo!";
        testMessage.classList.add("success-msg");
      } else {
        testMessage.textContent = "❌ Falha na conexão: Verifique se o backend está rodando.";
        testMessage.classList.add("error-msg");
      }
    });
  });

  // --- 3. AÇÃO: BUSCA MANUAL ---
  btnManual.addEventListener("click", () => {
    window.open(`${FRONTEND_URL}/buscar-manualmente`, "_blank");
  });
});