// Confirmação assíncrona no mesmo padrão visual do sistema — substitui
// window.confirm(), que quebra a identidade visual escura com o diálogo
// nativo do navegador. Sem <ConfirmDialog /> montado, cai de volta pro nativo.
type ConfirmRequest = { message: string; resolve: (value: boolean) => void };
type Listener = (req: ConfirmRequest | null) => void;

let listener: Listener | null = null;

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (listener) listener({ message, resolve });
    else resolve(window.confirm(message));
  });
}

export function _registerConfirmListener(l: Listener | null) {
  listener = l;
}
