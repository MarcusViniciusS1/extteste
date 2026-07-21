// Content Script unificado (Responsável por injetar a interface 'penetra' / drawer)
function injectDrawer() {
  if (document.getElementById("unified-drawer-container")) return;

  const container = document.createElement("div");
  container.id = "unified-drawer-container";
  
  // Carrega o layout HTML do Drawer
  fetch(chrome.runtime.getURL("drawer.html"))
    .then(response => response.text())
    .then(html => {
      container.innerHTML = html;
      document.body.appendChild(container);

      // Carrega o comportamento em JS do Drawer
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("drawer.js");
      document.body.appendChild(script);
    })
    .catch(err => console.error("Erro ao injetar o drawer da extensão:", err));
}

// Inicializa a injeção ao carregar a página
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectDrawer);
} else {
  injectDrawer();
}