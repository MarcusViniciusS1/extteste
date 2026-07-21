import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Ticket as TicketIcon, Plus, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ticket, STATUS_LABELS } from '../lib/types';
import { StatusBadge } from '../components/Badges';

interface Props {
  onOpen: (id: string) => void;
  onNewTicket: () => void;
}

export default function Tickets({ onOpen, onNewTicket }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sistemaFilter, setSistemaFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tickets')
        .select('*, company(*), contact(*), attendant(*)')
        .order('created_at', { ascending: false });
      setTickets(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      
      // Filtro de Sistema (usando cast para any pois é um campo recém-adicionado no BD)
      if (sistemaFilter !== 'all' && (t as any).sistema !== sistemaFilter) return false;
      
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [
          t.subject, 
          t.description, 
          t.company?.name, 
          t.attendant?.name, 
          (t as any).nome_contato,
          (t as any).telefone_contato,
          ...(t.tags ?? [])
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, search, statusFilter, sistemaFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-[#8a99b8]">{tickets.length} tickets registrados</p>
        </div>
        <button onClick={onNewTicket} className="btn-primary">
          <Plus className="h-4 w-4" /> Novo Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
            <input
              className="input pl-9"
              placeholder="Buscar por assunto, nome do cliente, empresa, tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#5a6a8a]" />
            
            {/* Status */}
            <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            
            {/* Sistema (Substituiu Prioridade) */}
            <select className="input w-auto" value={sistemaFilter} onChange={(e) => setSistemaFilter(e.target.value)}>
              <option value="all">Todos os sistemas</option>
              <option value="Z">Zorte</option>
              <option value="L">Linea</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <TicketIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#8a99b8]">Nenhum ticket encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f2d4d] text-left text-xs uppercase tracking-wide text-[#8a99b8]">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Sis.</th>
                  <th className="px-4 py-3 font-medium">Assunto</th>
                  <th className="px-4 py-3 font-medium">Cliente (Crisp)</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Atendente</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const tAny = t as any; // Cast para ler campos novos que podem não estar na interface Ticket
                  
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpen(t.id)}
                      className="table-row cursor-pointer border-b border-[#1f2d4d]/50 hover:bg-white/5 transition-colors"
                    >
                      {/* Número do Ticket */}
                      <td className="px-4 py-3 font-mono text-xs text-[#5b9cf5]">#{t.ticket_number ?? '—'}</td>
                      
                      {/* Sistema (Z ou L) */}
                      <td className="px-4 py-3 font-bold text-[#c0cce6]">
                        {tAny.sistema === 'L' ? 'L' : 'Z'}
                      </td>
                      
                      {/* Assunto + Link e Tags */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate max-w-[250px]">{t.subject}</p>
                          
                          {/* Ícone de Link caso haja URL capturada */}
                          {tAny.url_atendimento && (
                            <a 
                              href={tAny.url_atendimento} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-[#2f7ff0] hover:text-white transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title="Abrir no Crisp"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        {t.tags && t.tags.length > 0 && (
                          <div className="mt-1 flex gap-1 flex-wrap">
                            {t.tags.map((tag) => (
                              <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[#8a99b8]">{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      
                      {/* Nome e Telefone Capturados */}
                      <td className="px-4 py-3">
                        <div className="text-[#e6edf7]">{tAny.nome_contato || '—'}</div>
                        {tAny.telefone_contato && (
                          <div className="text-xs text-[#8a99b8]">{tAny.telefone_contato}</div>
                        )}
                      </td>
                      
                      {/* Relacionamentos e Restante */}
                      <td className="px-4 py-3 text-[#c0cce6]">{t.company?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#c0cce6]">{t.attendant?.name ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-xs text-[#8a99b8] whitespace-nowrap">
                        {t.created_at ? new Date(t.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}