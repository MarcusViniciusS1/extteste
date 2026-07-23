// O sistema não tem login/autenticação (single-tenant, uso compartilhado —
// ver comentários de RLS nas migrations). Para o sino de notificações saber
// "de quem" mostrar avisos, cada atendente escolhe uma vez quem é (mesma
// ideia já usada no popup da extensão do Crisp) e isso fica salvo no
// navegador local.
const KEY = 'zticket:current_attendant_id';

export function getCurrentAttendantId(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setCurrentAttendantId(id: string): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* localStorage indisponível (modo privado, etc.) — ignora */
  }
}
