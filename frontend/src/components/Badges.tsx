import { TicketStatus, TicketPriority, STATUS_LABELS, PRIORITY_LABELS } from '../lib/types';
import { slaState, formatRemaining } from '../lib/sla';

export function StatusBadge({ status }: { status: TicketStatus }) {
  const styles: Record<TicketStatus, string> = {
    novo: 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30',
    assumido: 'bg-[#0ea5e9]/15 text-[#38bdf8] border border-[#0ea5e9]/30',
    em_andamento: 'bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30',
    aguardando: 'bg-[#a855f7]/15 text-[#c084fc] border border-[#a855f7]/30',
    resolvido: 'bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30',
    fechado: 'bg-white/5 text-[#a1a1aa] border border-white/10',
  };
  return <span className={`badge ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority?: TicketPriority | null }) {
  const styles: Record<TicketPriority, string> = {
    baixa: 'bg-white/5 text-[#a1a1aa] border border-white/10',
    media: 'bg-white/10 text-[#d4d4d8] border border-white/20',
    alta: 'bg-[#f59e0b]/10 text-[#fbbf24] border border-[#f59e0b]/20',
    urgente: 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30',
  };
  const p = priority ?? 'media';
  return <span className={`badge ${styles[p]}`}>{PRIORITY_LABELS[p]}</span>;
}

// Indicador visual do prazo (SLA): verde = tranquilo, amarelo = pouco tempo,
// vermelho = estourado. Some (retorna null) se o ticket não tem prazo ou já
// foi resolvido/fechado.
export function SlaBadge({ dueDate, resolved }: { dueDate?: string | null; resolved?: boolean }) {
  const state = slaState(dueDate, !!resolved);
  if (state === 'none' || !dueDate) return null;
  const styles: Record<'ok' | 'warn' | 'overdue', string> = {
    ok: 'bg-[#22c55e]/10 text-[#4ade80] border border-[#22c55e]/20',
    warn: 'bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30',
    overdue: 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30',
  };
  return <span className={`badge ${styles[state]}`}>{formatRemaining(dueDate)}</span>;
}
