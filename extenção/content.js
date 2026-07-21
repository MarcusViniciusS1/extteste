// Content script — roda dentro do app.crisp.chat.
//
// 1) Responde ao popup (action "extractTenant") e ao Side Panel
//    (action "validateCurrent") lendo o perfil da conversa aberta.
// 2) Injeta um botão flutuante que abre o PAINEL LATERAL (Side Panel) do
//    navegador para registrar o atendimento — o Chrome encolhe a aba do Crisp,
//    então o painel não tampa nenhuma informação.

// Lê o widget de perfil da conversa aberta: candidatos (cnpj/empresa/tenant/tags),
// telefone, nome do contato e a URL atual.

// Detecta o canal/origem da conversa aberta (chat, whatsapp, email, telefone)
// a partir do ícone/tooltip de origem do Crisp. Usa o nome do ícone (independe
// do idioma) e cai para o texto do tooltip como reforço.
function detectChannel() {
  try {
    const activeItem = document.querySelector(
      '[class*="conversation-menu-item"][class*="--active"], [class*="conversation-menu-item"][class*="--selected"], [class*="conversation-menu-item"][aria-selected="true"]'
    );
    const scope = activeItem || document;
    const useEl = scope.querySelector('.c-conversation-menu-item-headline__origin use');
    const href = useEl ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '') : '';
    const tip = scope.querySelector('.c-conversation-menu-item-headline__origin .c-base-tooltip__default');
    const tipText = tip ? tip.textContent : '';
    const hay = (href + ' ' + tipText).toLowerCase();
    if (/whats/.test(hay)) return 'whatsapp';
    if (/message_bubble|chat/.test(hay)) return 'chat';
    if (/mail|email|envelope/.test(hay)) return 'email';
    if (/phone|telep|call|sms/.test(hay)) return 'telefone';
  } catch { /* ignora */ }
  return '';
}

function extractProfile() {
  let candidates = [];
  let phone = "";
  let personName = "";
  const currentUrl = window.location.href;

  try {
    const keys = document.querySelectorAll('.c-conversation-profile-widget-data-item__cell--key');
    for (let key of keys) {
      const keyText = key.textContent.toLowerCase().trim();
      const parent = key.closest('.c-conversation-profile-widget-data-item__cell');
      const valueNode = parent ? parent.nextElementSibling : null;

      if (valueNode && valueNode.textContent) {
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
      if (tag.textContent) candidates.push(tag.textContent.trim());
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

    // Empresa vinculada exibida no perfil (ex.: "DFA - TRANSPORTES COMERCIO...").
    const employmentNode = document.querySelector('.c-conversation-profile__employment');
    if (employmentNode && employmentNode.textContent) {
      const emp = employmentNode.textContent.trim();
      if (emp) candidates.push(emp);
    }

    candidates = [...new Set(candidates.filter(c => c))];
  } catch (error) {
    /* ignora falhas de leitura do DOM */
  }

  return { candidates, url: currentUrl, phone, name: personName, channel: detectChannel() };
}

// Extrai o perfil e valida a empresa no banco (mesma lógica do popup).
// Retorna { found, data, extra:{name,phone,url} }.
async function validateCurrent() {
  const profile = extractProfile();
  let data = null;
  if (profile.candidates && profile.candidates.length) {
    data = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'searchDatabase', query: profile.candidates }, (r) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(r && r.success ? r.data : null);
        });
      } catch { resolve(null); }
    });
  }
  return {
    found: !!data,
    data,
    extra: { name: profile.name, phone: profile.phone, url: profile.url || location.href, channel: profile.channel || '' },
  };
}

// Responde ao popup (extractTenant) e ao Side Panel (validateCurrent).
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractTenant") {
    try {
      const p = extractProfile();
      sendResponse({
        success: true,
        data: p.candidates,
        extraData: { url: p.url, phone: p.phone, name: p.name },
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (request.action === "validateCurrent") {
    validateCurrent().then(sendResponse);
    return true; // resposta assíncrona
  }

  return true;
});

// ---- Botão flutuante que abre o Side Panel ----
function mountLauncher() {
  if (document.getElementById('zt-launcher')) return;
  const btn = document.createElement('button');
  btn.id = 'zt-launcher';
  btn.type = 'button';
  btn.textContent = '+ Registrar atendimento';
  btn.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483645;border:0;cursor:pointer;' +
    'padding:10px 16px;border-radius:999px;color:#fff;font:600 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;' +
    'background:linear-gradient(135deg,#2f7ff0,#16b89a);box-shadow:0 6px 24px rgba(47,127,240,.4);';
  // O clique é um gesto do usuário: pede ao background para abrir o Side Panel.
  btn.addEventListener('click', () => {
    try { chrome.runtime.sendMessage({ action: 'openSidePanel' }); } catch { /* ignora */ }
  });
  document.body.appendChild(btn);
}

// O Crisp é uma SPA e recria o DOM; reinsere o botão periodicamente se sumir.
mountLauncher();
setInterval(mountLauncher, 1500);
