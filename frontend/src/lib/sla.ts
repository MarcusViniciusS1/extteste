import { TicketPriority } from './types';

// Prazo padrão (em horas) de resposta por nível de prioridade — usado para
// sugerir automaticamente o prazo (SLA) de um ticket novo e para calcular o
// estado visual (no prazo / atenção / estourado) de um ticket existente.
export const SLA_HOURS: Record<TicketPriority, number> = {
  urgente: 4,
  alta: 24,
  media: 48,
  baixa: 72,
};

export function suggestDueDate(priority: TicketPriority, from: Date = new Date()): string {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.media;
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export type SlaState = 'none' | 'ok' | 'warn' | 'overdue';

// Estado visual do SLA com base no prazo (due_date). Tickets já resolvidos/
// fechados nunca aparecem como estourados (não faz sentido cobrar prazo de
// algo que já terminou).
export function slaState(dueDate: string | null | undefined, resolved: boolean): SlaState {
  if (!dueDate || resolved) return 'none';
  const remainingMs = new Date(dueDate).getTime() - Date.now();
  if (remainingMs <= 0) return 'overdue';
  const remainingHours = remainingMs / (1000 * 60 * 60);
  return remainingHours <= 4 ? 'warn' : 'ok';
}

// Abaixo de 1 dia mostra horas/minutos; a partir de 1 dia mostra em dias.
export function formatRemaining(dueDate: string): string {
  const diffMs = new Date(dueDate).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const totalHours = abs / (1000 * 60 * 60);

  let label: string;
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    label = `${days} dia${days === 1 ? '' : 's'}`;
  } else {
    const hours = Math.floor(totalHours);
    const mins = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));
    label = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;
  }
  return diffMs <= 0 ? `${label} atrasado` : `${label} restantes`;
}

// Conversões entre ISO (salvo no banco) e o valor que <input type="datetime-local"> espera/produz.
export function toInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
