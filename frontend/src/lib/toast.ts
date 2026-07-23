// Sistema simples de notificações (toast) — substitui window.alert(), que
// quebra a identidade visual escura do sistema com o diálogo nativo do navegador.
export type ToastType = 'success' | 'error' | 'info';
export type ToastItem = { id: number; type: ToastType; message: string };

let items: ToastItem[] = [];
let listeners: Array<(items: ToastItem[]) => void> = [];
let nextId = 1;

function emit() {
  listeners.forEach((l) => l(items));
}

function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

function push(type: ToastType, message: string) {
  const id = nextId++;
  items = [...items, { id, type, message }];
  emit();
  setTimeout(() => dismiss(id), 4000);
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
  dismiss,
  subscribe(listener: (items: ToastItem[]) => void) {
    listeners.push(listener);
    listener(items);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};
