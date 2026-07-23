import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SystemLog } from '../lib/types';

const ACTION_COLORS: Record<string, string> = {
  create: '#22c55e',
  update: '#ef4444',
  delete: '#ef4444',
  sync: '#dc2626',
  import: '#f59e0b',
  login: '#a855f7',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
  sync: 'Sincronização',
  import: 'Importação',
  login: 'Login',
};

const ENTITY_LABELS: Record<string, string> = {
  ticket: 'Tickets',
  company: 'Empresas',
  contact: 'Contatos',
  attendant: 'Atendentes',
  tag: 'Tags',
  api_connection: 'Conexões API',
};

// Formata os detalhes (jsonb) como "chave: valor, chave2: valor2" em vez de
// JSON.stringify cru — evita blocos ilegíveis com colchetes/aspas.
function formatDetails(details: SystemLog['details']): string {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('system_logs').select('*, attendant(*)').order('created_at', { ascending: false }).limit(200);
    setLogs(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = actionFilter === 'all' ? logs : logs.filter((l) => l.action === actionFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs do Sistema</h1>
          <p className="text-sm text-[#a1a1aa]">Registro de auditoria — {logs.length} eventos</p>
        </div>
        <button onClick={load} className="btn-outline"><RefreshCw className="h-4 w-4" /> Atualizar</button>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActionFilter('all')} className={`badge cursor-pointer ${actionFilter === 'all' ? 'bg-[#ef4444]/20 text-[#f87171] border border-[#ef4444]/30' : 'bg-white/5 text-[#a1a1aa] border border-white/10'}`}>Todos</button>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setActionFilter(key)} className={`badge cursor-pointer ${actionFilter === key ? 'border' : 'bg-white/5 text-[#a1a1aa] border border-white/10'}`}
              style={actionFilter === key ? { color: ACTION_COLORS[key], background: `${ACTION_COLORS[key]}20`, borderColor: `${ACTION_COLORS[key]}40` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#a1a1aa]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#a1a1aa]">Nenhum log registrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#3f3f46] text-left text-xs uppercase tracking-wide text-[#a1a1aa]">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Data/Hora</th>
                  <th className="px-4 py-3 font-medium">Usuário</th>
                  <th className="px-4 py-3 font-medium">Módulo</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                  <th className="px-4 py-3 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="table-row border-b border-[#3f3f46]/50">
                    <td className="px-4 py-3 text-xs text-[#a1a1aa] whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#ffffff] font-medium whitespace-nowrap">{log.attendant?.name ?? 'Sistema'}</td>
                    <td className="px-4 py-3 text-[#d4d4d8] whitespace-nowrap">{(log.entity && ENTITY_LABELS[log.entity]) ?? log.entity ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="badge" style={{ color: ACTION_COLORS[log.action] ?? '#a1a1aa', background: `${ACTION_COLORS[log.action] ?? '#71717a'}20`, border: `1px solid ${ACTION_COLORS[log.action] ?? '#71717a'}40` }}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#a1a1aa] max-w-md truncate" title={formatDetails(log.details)}>
                      {formatDetails(log.details) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
