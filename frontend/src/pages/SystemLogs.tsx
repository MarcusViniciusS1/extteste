import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SystemLog } from '../lib/types';

const ACTION_COLORS: Record<string, string> = {
  create: '#22c55e',
  update: '#2f7ff0',
  delete: '#ef4444',
  sync: '#16b89a',
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

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(200);
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
          <p className="text-sm text-[#8a99b8]">Registro de auditoria — {logs.length} eventos</p>
        </div>
        <button onClick={load} className="btn-outline"><RefreshCw className="h-4 w-4" /> Atualizar</button>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActionFilter('all')} className={`badge cursor-pointer ${actionFilter === 'all' ? 'bg-[#2f7ff0]/20 text-[#5b9cf5] border border-[#2f7ff0]/30' : 'bg-white/5 text-[#8a99b8] border border-white/10'}`}>Todos</button>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setActionFilter(key)} className={`badge cursor-pointer ${actionFilter === key ? 'border' : 'bg-white/5 text-[#8a99b8] border border-white/10'}`}
              style={actionFilter === key ? { color: ACTION_COLORS[key], background: `${ACTION_COLORS[key]}20`, borderColor: `${ACTION_COLORS[key]}40` } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#8a99b8]">Nenhum log registrado.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1f2d4d]/50">
            {filtered.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 table-row">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: ACTION_COLORS[log.action] ?? '#5a6a8a' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                    {log.entity && <span className="text-xs text-[#8a99b8]">· {log.entity}</span>}
                  </div>
                  {log.details && (
                    <p className="mt-0.5 truncate text-xs text-[#8a99b8]">
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs text-[#8a99b8] whitespace-nowrap">
                  {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
