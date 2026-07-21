// Background unificado para gerenciar eventos e comunicação
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extensão Unificada instalada com sucesso.");
});

// Listener global para mensagens entre o content script, popup e drawer
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_STATUS") {
    sendResponse({ success: true, status: "ativo" });
  }
  return true;
});