chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractTenant") {
    let candidates = [];
    let phone = "";
    let personName = "";
    let currentUrl = window.location.href; 

    try {
      const keys = document.querySelectorAll('.c-conversation-profile-widget-data-item__cell--key');
      for (let key of keys) {
        const keyText = key.textContent.toLowerCase().trim();
        const parent = key.closest('.c-conversation-profile-widget-data-item__cell');
        const valueNode = parent ? parent.nextElementSibling : null;
        
        if (valueNode && valueNode.textContent) {
          // Limpeza do texto, removendo palavras dos botões do Crisp
          let rawText = valueNode.textContent
            .replace(/Dados do perfil/gi, '')
            .replace(/Copiar/gi, '')
            .replace(/Excluir/gi, '')
            .trim();
          
          if (keyText.includes('cnpj') || keyText.includes('empresa') || keyText.includes('tenant')) {
            if (rawText) candidates.push(rawText);
          }
          if (keyText.includes('telefone') || keyText.includes('phone') || keyText.includes('whatsapp') || keyText.includes('celular') || keyText.includes('number')) {
            if (rawText) phone = rawText;
          }
        }
      }

      const nameNode = document.querySelector('.c-conversation-profile__name');
      if (nameNode) {
        personName = nameNode.textContent.trim();
      }

      const tagNodes = document.querySelectorAll('.c-base-tag__label');
      tagNodes.forEach(tag => {
        if (tag.textContent) {
          candidates.push(tag.textContent.trim());
        }
      });

      const nicknameNode = document.querySelector('.c-conversation-profile__nickname');
      if (nicknameNode) {
        const text = nicknameNode.textContent.trim();
        const parts = text.split('-').map(part => part.trim());
        
        if (parts.length >= 3) {
          candidates.push(parts[1]); 
        } else if (parts.length === 2) {
          candidates.push(parts[1]); 
        }
        candidates.push(text);
        
        if (!personName && parts.length > 0) {
          personName = parts[0];
        }
      }

      candidates = [...new Set(candidates.filter(c => c))];

      sendResponse({ 
        success: true, 
        data: candidates, 
        extraData: { url: currentUrl, phone: phone, name: personName } 
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; 
});