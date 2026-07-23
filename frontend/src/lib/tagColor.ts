// Converte um hex (#rrggbb ou #rgb) para rgba(...) com a opacidade pedida —
// usado para renderizar tags/badges com fundo translúcido na cor cadastrada.
export function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '#EF4444').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
