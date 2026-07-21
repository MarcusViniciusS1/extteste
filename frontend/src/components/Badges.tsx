import { TicketStatus, TicketPriority, STATUS_LABELS, PRIORITY_LABELS } from '../lib/types';

export function StatusBadge({ status }: { status: TicketStatus }) {
  const styles: Record<TicketStatus, string> = {
    novo: 'bg-[#2f7ff0]/15 text-[#5b9cf5] border border-[#2f7ff0]/30',
    em_andamento: 'bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30',
    aguardando: 'bg-[#a855f7]/15 text-[#c084fc] border border-[#a855f7]/30',
    resolvido: 'bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30',
    fechado: 'bg-white/5 text-[#8a99b8] border border-white/10',
  };
  return <span className={`badge ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, string> = {
    baixa: 'bg-white/5 text-[#8a99b8] border border-white/10',
    media: 'bg-[#2f7ff0]/10 text-[#5b9cf5] border border-[#2f7ff0]/20',
    alta: 'bg-[#f59e0b]/10 text-[#fbbf24] border border-[#f59e0b]/20',
    urgente: 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30',
  };
  return <span className={`badge ${styles[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
}
