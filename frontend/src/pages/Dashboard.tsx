import { useEffect, useState } from 'react';
import { Ticket, Building2, Users, Clock, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ticket as TicketType, STATUS_LABELS } from '../lib/types';
import { StatusBadge, PriorityBadge } from '../components/Badges';
import type { Page } from '../App';

interface Props {
  onNavigate: (p: Page) => void;
  onNewTicket: () => void;
}

export default function Dashboard({ onNavigate, onNewTicket }: Props) {
  const [stats, setStats] = useState({ total: 0, abertos: 0, resolvidos: 0, hoje: 0 });
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: tickets }, { count }] = await Promise.all([
        supabase.from('tickets').select('*, company(*), contact(*), attendant(*)').order('created_at', { ascending: false }).limit(50),
        supabase.from('tickets').select('*', { count: 'exact', head: true }),
      ]);
      const list: TicketType[] = tickets ?? [];
      setRecent(list.slice(0, 6));
      const statusMap: Record<string, number> = {};
      let abertos = 0, resolvidos = 0, hoje = 0;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      list.forEach((t) => {
        statusMap[t.status] = (statusMap[t.status] ?? 0) + 1;
        if (['novo', 'em_andamento', 'aguardando'].includes(t.status)) abertos++;
        if (t.status === 'resolvido') resolvidos++;
        if (t.created_at && new Date(t.created_at) >= todayStart) hoje++;
      });
      setStats({ total: count ?? 0, abertos, resolvidos, hoje });
      setByStatus(statusMap);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: 'Total de Tickets', value: stats.total, icon: Ticket, color: '#2f7ff0' },
    { label: 'Tickets Abertos', value: stats.abertos, icon: AlertCircle, color: '#f59e0b' },
    { label: 'Resolvidos', value: stats.resolvidos, icon: CheckCircle2, color: '#22c55e' },
    { label: 'Criados Hoje', value: stats.hoje, icon: TrendingUp, color: '#16b89a' },
  ];

  const statusColors: Record<string, string> = {
    novo: '#2f7ff0', em_andamento: '#f59e0b', aguardando: '#a855f7', resolvido: '#22c55e', fechado: '#5a6a8a',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#8a99b8]">Visão geral do sistema de atendimento</p>
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
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8a99b8]">{c.label}</p>
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

      {/* Status distribution */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold">Tickets por Status</h3>
        <div className="space-y-3">
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const count = byStatus[key] ?? 0;
            const pct = stats.total ? (count / stats.total) * 100 : 0;
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[#c0cce6]">{label}</span>
                  <span className="text-[#8a99b8]">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: statusColors[key] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent tickets */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tickets Recentes</h3>
          <button onClick={() => onNavigate({ name: 'tickets' })} className="text-xs text-[#5b9cf5] hover:text-[#7db5ff]">Ver todos →</button>
        </div>
        {recent.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#8a99b8]">
            <Ticket className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum ticket criado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigate({ name: 'ticket', id: t.id })}
                className="table-row flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2f7ff0]/10 text-xs font-bold text-[#5b9cf5]">
                  #{t.ticket_number ?? '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="truncate text-xs text-[#8a99b8]">
                    {t.company?.name ?? 'Sem empresa'} · {t.attendant?.name ?? 'Não atribuído'}
                  </p>
                </div>
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
                <span className="hidden text-xs text-[#8a99b8] sm:block">
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
