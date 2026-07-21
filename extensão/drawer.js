// Lógica do Drawer (Módulo Penetra)
document.getElementById("closeDrawer")?.addEventListener("click", () => {
  const root = document.getElementById("unified-drawer-container");
  if (root) {
    root.style.display = "none";
  }
});