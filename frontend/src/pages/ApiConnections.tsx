import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Plug, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ApiConnection } from '../lib/types';
import Modal from '../components/Modal';

const API_TYPES = [
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'linea', label: 'Lonngren' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'zendesk', label: 'Zendesk' },
  { value: 'freshdesk', label: 'Freshdesk' },
  { value: 'custom', label: 'API Customizada' },
];

export default function ApiConnections() {
  const [conns, setConns] = useState<ApiConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiConnection | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('claude');
  const [endpoint, setEndpoint] = useState('');
  const [apiKeyRef, setApiKeyRef] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'error'>('inactive');
  const [config, setConfig] = useState('{}');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('api_connections').select('*').order('created_at', { ascending: false });
    setConns(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setName(''); setType('claude'); setEndpoint(''); setApiKeyRef(''); setStatus('inactive'); setConfig('{}');
    setShowForm(true);
  }
  function openEdit(c: ApiConnection) {
    setEditing(c);
    setName(c.name); setType(c.type); setEndpoint(c.endpoint ?? ''); setApiKeyRef(c.api_key_ref ?? ''); setStatus(c.status); setConfig(JSON.stringify(c.config ?? {}, null, 2));
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    let parsedConfig = {};
    try { parsedConfig = config.trim() ? JSON.parse(config) : {}; }
    catch { alert('Config JSON inválido.'); return; }
    if (editing) {
      await supabase.from('api_connections').update({
        name: name.trim(), type, endpoint: endpoint.trim() || null, api_key_ref: apiKeyRef.trim() || null,
        status, config: parsedConfig,
      }).eq('id', editing.id);
    } else {
      const { data } = await supabase.from('api_connections').insert({
        name: name.trim(), type, endpoint: endpoint.trim() || null, api_key_ref: apiKeyRef.trim() || null,
        status, config: parsedConfig,
      }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ action: 'create', entity: 'api_connection', entity_id: data.id, details: { name: name.trim(), type } });
    }
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta conexão de API?')) return;
    await supabase.from('api_connections').delete().eq('id', id);
    await supabase.from('system_logs').insert({ action: 'delete', entity: 'api_connection', entity_id: id });
    await load();
  }

  async function handleTest(c: ApiConnection) {
    setTesting(c.id);
    // Simulate a sync/test — update last_sync_at and status
    let newStatus: 'active' | 'error' = 'active';
    let detail = { tested: true, endpoint: c.endpoint };
    if (!c.endpoint) { newStatus = 'error'; detail = { tested: false, error: 'Endpoint não configurado' }; }
    await supabase.from('api_connections').update({
      status: newStatus, last_sync_at: new Date().toISOString(),
    }).eq('id', c.id);
    await supabase.from('system_logs').insert({ action: 'sync', entity: 'api_connection', entity_id: c.id, details: detail });
    setTesting(null);
    await load();
  }

  const typeLabels: Record<string, string> = Object.fromEntries(API_TYPES.map((t) => [t.value, t.label]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conexões de API</h1>
          <p className="text-sm text-[#8a99b8]">Integrações com Claude, Lonngren e outros sistemas</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova Conexão</button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>
        ) : conns.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <Plug className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#8a99b8]">Nenhuma conexão de API configurada.</p>
          </div>
        ) : conns.map((c) => (
          <div key={c.id} className="card card-hover p-5 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#16b89a]/10">
                  <Plug className="h-5 w-5 text-[#16b89a]" />
                </div>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-xs text-[#8a99b8]">{typeLabels[c.type] ?? c.type}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              {c.endpoint && <p className="truncate text-[#c0cce6]">{c.endpoint}</p>}
              {c.api_key_ref && <p className="text-xs text-[#8a99b8]">Chave: {c.api_key_ref}</p>}
              {c.last_sync_at && (
                <p className="flex items-center gap-1 text-xs text-[#8a99b8]">
                  <Clock className="h-3 w-3" /> Última sync: {new Date(c.last_sync_at).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`badge ${
                c.status === 'active' ? 'bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30' :
                c.status === 'error' ? 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30' :
                'bg-white/5 text-[#8a99b8] border border-white/10'
              }`}>
                {c.status === 'active' ? <CheckCircle2 className="h-3 w-3" /> : c.status === 'error' ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {c.status === 'active' ? 'Ativa' : c.status === 'error' ? 'Erro' : 'Inativa'}
              </span>
              <button onClick={() => handleTest(c)} disabled={testing === c.id} className="btn-outline text-xs px-2.5 py-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${testing === c.id ? 'animate-spin' : ''}`} /> Testar
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar Conexão' : 'Nova Conexão de API'} onClose={() => setShowForm(false)} size="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nome *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Claude API Produção" autoFocus />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  {API_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Endpoint (URL)</label>
              <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.anthropic.com/v1/messages" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Referência da Chave (label)</label>
                <input className="input" value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)} placeholder="ANTHROPIC_API_KEY" />
                <p className="mt-1 text-[11px] text-[#5a6a8a]">Apenas um rótulo — o valor da chave deve ser configurado como secret no Supabase.</p>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | 'error')}>
                  <option value="inactive">Inativa</option>
                  <option value="active">Ativa</option>
                  <option value="error">Erro</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Configuração (JSON)</label>
              <textarea className="input min-h-[100px] resize-y font-mono text-xs" value={config} onChange={(e) => setConfig(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#1f2d4d]">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
              <button type="submit" className="btn-primary">{editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
