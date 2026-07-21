chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractTenant") {
    let candidates = [];

    try {
      // 1. Tenta pegar o CNPJ ou Nome direto do Widget Lateral (Mais forte)
      const keys = document.querySelectorAll('.c-conversation-profile-widget-data-item__cell--key');
      for (let key of keys) {
        const keyText = key.textContent.toLowerCase().trim();
        if (keyText.includes('cnpj') || keyText.includes('empresa') || keyText.includes('tenant')) {
          const parent = key.closest('.c-conversation-profile-widget-data-item__cell');
          const valueNode = parent ? parent.nextElementSibling : null;
          
          if (valueNode && valueNode.textContent) {
            let rawText = valueNode.textContent.replace(/Dados do perfil/gi, '').trim();
            if (rawText) candidates.push(rawText);
          }
        }
      }

      // 2. Extrai TODOS os Segmentos (Tags do Crisp - Ex: "bracoforte")
      const tagNodes = document.querySelectorAll('.c-base-tag__label');
      tagNodes.forEach(tag => {
        if (tag.textContent) {
          candidates.push(tag.textContent.trim());
        }
      });

      // 3. Extrai o Nickname do cabeçalho (Formato "Nome - Empresa - Zona")
      const nicknameNode = document.querySelector('.c-conversation-profile__nickname');
      if (nicknameNode) {
        const text = nicknameNode.textContent.trim();
        const parts = text.split('-').map(part => part.trim());
        
        if (parts.length >= 3) {
          candidates.push(parts[1]); // Pega o que está entre os traços
        } else if (parts.length === 2) {
          candidates.push(parts[1]); // Pega após o traço
        }
        candidates.push(text); // Adiciona a string inteira como último recurso
      }

      // Limpa a lista: remove itens vazios e duplicados
      candidates = [...new Set(candidates.filter(c => c))];

      sendResponse({ success: true, data: candidates });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; 
});