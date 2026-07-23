import { useEffect, useMemo, useState } from 'react';
import { Ticket, TrendingUp, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ticket as TicketType, STATUS_LABELS, PRIORITY_LABELS, TicketPriority } from '../lib/types';
import { StatusBadge, PriorityBadge, SlaBadge } from '../components/Badges';
import { slaState } from '../lib/sla';
import type { Page } from '../App';

interface Props {
  onNavigate: (p: Page) => void;
  onNewTicket: () => void;
}

export default function Dashboard({ onNavigate, onNewTicket }: Props) {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Sem limite artificial: os indicadores precisam refletir TODOS os
      // tickets, não só os últimos 50 (senão as porcentagens ficam erradas
      // conforme o volume cresce). A lista "recentes" é só um recorte em JS.
      const { data } = await supabase.from('tickets').select('*, company(*), contact(*), attendant(*)').order('created_at', { ascending: false });
      setTickets(data ?? []);
      setLoading(false);
    })();
  }, []);

  const isOpenStatus = (s: string) => !['resolvido', 'fechado'].includes(s);

  const stats = useMemo(() => {
    let abertos = 0, resolvidos = 0, hoje = 0;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const bySla: Record<'ok' | 'warn' | 'overdue' | 'none', number> = { ok: 0, warn: 0, overdue: 0, none: 0 };
    const overdue: TicketType[] = [];

    tickets.forEach((t) => {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority ?? 'media'] = (byPriority[t.priority ?? 'media'] ?? 0) + 1;
      if (isOpenStatus(t.status)) abertos++;
      if (t.status === 'resolvido') resolvidos++;
      if (t.created_at && new Date(t.created_at) >= todayStart) hoje++;

      const resolved = t.status === 'resolvido' || t.status === 'fechado';
      const sla = slaState(t.due_date, resolved);
      bySla[sla]++;
      if (sla === 'overdue') overdue.push(t);
    });

    return { total: tickets.length, abertos, resolvidos, hoje, byStatus, byPriority, bySla, overdue };
  }, [tickets]);

  const recent = useMemo(() => tickets.slice(0, 6), [tickets]);

  const cards = [
    { label: 'Total de Tickets', value: stats.total, icon: Ticket, color: '#ef4444' },
    { label: 'Tickets Abertos', value: stats.abertos, icon: AlertCircle, color: '#f59e0b' },
    { label: 'Resolvidos', value: stats.resolvidos, icon: CheckCircle2, color: '#22c55e' },
    { label: 'Criados Hoje', value: stats.hoje, icon: TrendingUp, color: '#dc2626' },
  ];

  const statusColors: Record<string, string> = {
    novo: '#ef4444', assumido: '#0ea5e9', em_andamento: '#f59e0b', aguardando: '#a855f7', resolvido: '#22c55e', fechado: '#71717a',
  };
  const priorityColors: Record<TicketPriority, string> = {
    baixa: '#71717a', media: '#d4d4d8', alta: '#f59e0b', urgente: '#ef4444',
  };
  const slaColors: Record<'ok' | 'warn' | 'overdue' | 'none', string> = {
    ok: '#22c55e', warn: '#f59e0b', overdue: '#ef4444', none: '#71717a',
  };
  const slaLabels: Record<'ok' | 'warn' | 'overdue' | 'none', string> = {
    ok: 'No prazo', warn: 'Perto do prazo', overdue: 'Atrasado', none: 'Sem prazo definido',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#a1a1aa]">Visão geral do sistema de atendimento</p>
        </div>
        <button onClick={onNewTicket} className="btn-primary">
          <Ticket className="h-4 w-4" /> Novo Ticket
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="card card-hover p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#a1a1aa]">{c.label}</p>
                  <p className="mt-2 text-3xl font-bold">{loading ? '—' : c.value}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: `${c.color}20` }}>
                  <Icon className="h-6 w-6" style={{ color: c.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Distribuições: Status / Prioridade / SLA */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Tickets por Status</h3>
          <div className="space-y-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = stats.byStatus[key] ?? 0;
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[#d4d4d8]">{label}</span>
                    <span className="text-[#a1a1aa]">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: statusColors[key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Tickets por Prioridade</h3>
          <div className="space-y-3">
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => {
              const count = stats.byPriority[key] ?? 0;
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[#d4d4d8]">{label}</span>
                    <span className="text-[#a1a1aa]">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: priorityColors[key as TicketPriority] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Tickets por SLA</h3>
          <div className="space-y-3">
            {(['ok', 'warn', 'overdue', 'none'] as const).map((key) => {
              const count = stats.bySla[key];
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[#d4d4d8]">{slaLabels[key]}</span>
                    <span className="text-[#a1a1aa]">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: slaColors[key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tickets Atrasados */}
      {stats.overdue.length > 0 && (
        <div className="card p-5 border-[#ef4444]/30">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f87171]" />
            <h3 className="text-sm font-semibold">Tickets Atrasados ({stats.overdue.length})</h3>
          </div>
          <div className="divide-y divide-[#3f3f46]/50">
            {stats.overdue.slice(0, 8).map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigate({ name: 'ticket', id: t.id })}
                className="grid w-full grid-cols-[3rem_1fr_auto_auto] items-center gap-3 py-2.5 text-left hover:bg-white/5 rounded-lg px-2"
              >
                <span className="font-mono text-xs text-[#f87171]">#{t.ticket_number ?? '—'}</span>
                <span className="truncate text-sm">{t.subject}</span>
                <PriorityBadge priority={t.priority} />
                <SlaBadge dueDate={t.due_date} resolved={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent tickets */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tickets Recentes</h3>
          <button onClick={() => onNavigate({ name: 'tickets' })} className="text-xs text-[#f87171] hover:text-[#fca5a5]">Ver todos →</button>
        </div>
        {recent.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#a1a1aa]">
            <Ticket className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum ticket criado ainda.
          </div>
        ) : (
          <div className="divide-y divide-[#3f3f46]/50">
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigate({ name: 'ticket', id: t.id })}
                className="table-row grid w-full grid-cols-[3rem_1fr_auto_auto_auto] items-center gap-3 rounded-lg px-2 py-3 text-left"
              >
                <span className="font-mono text-xs font-bold text-[#f87171]">#{t.ticket_number ?? '—'}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="truncate text-xs text-[#a1a1aa]">
                    {t.company?.name ?? 'Sem empresa'} · {t.attendant?.name ?? 'Não atribuído'}
                  </p>
                </div>
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
                <span className="hidden whitespace-nowrap text-xs text-[#a1a1aa] sm:block">
                  {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
