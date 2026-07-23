import { useEffect, useMemo, useState } from 'react';
import { Search, X, Building2, Link as LinkIcon, ArrowLeft, User, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Attendant, Company, Ticket, TicketStatus, TicketSystem, TicketPriority, PRIORITY_LABELS } from '../lib/types';
import { SLA_HOURS, suggestDueDate } from '../lib/sla';
import TagPicker from '../components/TagPicker';
import { maskPhone } from '../lib/masks';
import { getCurrentAttendantId } from '../lib/currentAttendant';

export default function Registro() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [urlAtendimento, setUrlAtendimento] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');

  const [status, setStatus] = useState<TicketStatus>('novo');
  const [sistema, setSistema] = useState<TicketSystem>('Z');
  const [priority, setPriority] = useState<TicketPriority>('media');
  const [companyId, setCompanyId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [linearInput, setLinearInput] = useState('');

  // Prazo do SLA: sempre calculado (criação + horas da prioridade), nunca
  // digitado manualmente.
  const dueDatePreview = useMemo(() => suggestDueDate(priority), [priority]);

  const [companyQuery, setCompanyQuery] = useState('');
  const [companyOpen, setCompanyOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('companies').select('*, tenant(*)').order('name'),
      supabase.from('attendants').select('*').eq('active', true).order('name'),
    ]).then(([c, a]) => {
      setCompanies(c.data ?? []);
      setAttendants(a.data ?? []);
    });

    const href = window.location.href;
    if (href.includes('?')) {
      const queryString = href.split('?')[1];
      const params = new URLSearchParams(queryString);
      
      const compId = params.get('company_id');
      const urlParam = params.get('url');
      const nameParam = params.get('name');
      const phoneParam = params.get('phone');

      if (compId) setCompanyId(compId);
      if (urlParam) setUrlAtendimento(urlParam);
      if (nameParam) setNomeContato(nameParam);
      if (phoneParam) setTelefoneContato(phoneParam);
      
      if (nameParam) {
        setSubject(`Atendimento - ${nameParam}`);
      }
    }
  }, []);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  );

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const hay = [c.name, c.document ?? '', c.tenant?.name ?? '', c.tenant?.slug ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [companies, companyQuery]);

  function selectCompany(c: Company | null) {
    setCompanyId(c?.id ?? '');
    setCompanyQuery('');
    setCompanyOpen(false);
  }

  // Aceita colar o ID da issue (ex.: "ZOR-123") ou a URL completa do Linear;
  // extrai o identificador de qualquer um dos dois formatos.
  function parseLinearInput(raw: string): { id: string | null; url: string | null } {
    const v = raw.trim();
    if (!v) return { id: null, url: null };
    const m = v.match(/([A-Z]{2,10}-\d+)/i);
    const id = m ? m[1].toUpperCase() : v;
    const url = /^https?:\/\//i.test(v) ? v : null;
    return { id, url };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSaving(true);
    setError('');

    const linear = parseLinearInput(linearInput);
    const ticketData: Partial<Ticket> = {
      subject: subject.trim(),
      description: description.trim() || null,
      url_atendimento: urlAtendimento.trim() || null,
      nome_contato: nomeContato.trim() || null,
      telefone_contato: telefoneContato.trim() || null,
      status,
      sistema,
      priority,
      due_date: suggestDueDate(priority),
      linear_issue_id: linear.id,
      linear_issue_url: linear.url,
      company_id: companyId || null,
      attendant_id: attendantId || null,
      tags,
    };

    const { data, error } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single();

    if (error) {
      setError(`Erro ao salvar no banco: ${error.message}`);
      setSaving(false);
      return;
    }
    
    await supabase.from('system_logs').insert({
      attendant_id: getCurrentAttendantId() || null,
      action: 'create',
      entity: 'ticket',
      entity_id: data.id,
      details: { subject: subject.trim(), sistema },
    });
    
    setSaving(false);
    window.location.href = '/tickets'; 
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => window.location.href = '/tickets'} 
          className="p-2 text-[#a1a1aa] hover:text-white hover:bg-white/5 rounded-full transition-colors"
          title="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registrar Novo Atendimento</h1>
          <p className="text-sm text-[#a1a1aa]">Preencha as informações do cliente capturadas do Crisp.</p>
        </div>
      </div>

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            
            {/* Linha 1: Assunto */}
            <div className="sm:col-span-2">
              <label className="label">Assunto *</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do atendimento" autoFocus />
            </div>

            {/* Linha 2: Nome e Telefone */}
            <div>
              <label className="label">Nome do Contato</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <input 
                  className="input pl-9" 
                  value={nomeContato} 
                  onChange={(e) => setNomeContato(e.target.value)} 
                  placeholder="Nome do cliente atual" 
                />
              </div>
            </div>

            <div>
              <label className="label">Telefone / WhatsApp</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <input
                  className="input pl-9"
                  value={telefoneContato}
                  onChange={(e) => setTelefoneContato(maskPhone(e.target.value))}
                  placeholder="Número de WhatsApp do cliente"
                />
              </div>
            </div>
            
            {/* Linha 3: URL */}
            <div className="sm:col-span-2">
              <label className="label">URL do Atendimento (Opcional)</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                <input 
                  className="input pl-9" 
                  value={urlAtendimento} 
                  onChange={(e) => setUrlAtendimento(e.target.value)} 
                  placeholder="https://app.crisp.chat/..." 
                />
              </div>
            </div>

            {/* Linha 4: Descrição */}
            <div className="sm:col-span-2">
              <label className="label">Descrição</label>
              <textarea className="input min-h-[120px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do atendimento..." />
            </div>

            {/* Linha 5: Status e Sistema */}
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                <option value="novo">Novo</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="aguardando">Aguardando</option>
                <option value="resolvido">Resolvido</option>
                <option value="fechado">Fechado</option>
              </select>
            </div>
            <div>
              <label className="label">Sistema</label>
              <select className="input" value={sistema} onChange={(e) => setSistema(e.target.value as TicketSystem)}>
                <option value="Z">Z — Zorte</option>
                <option value="L">L — Lonngren</option>
              </select>
            </div>

            {/* Linha 5.5: Prioridade (SLA) e Prazo */}
            <div>
              <label className="label">Prioridade (SLA)</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prazo (SLA)</label>
              <div className="input flex items-center justify-between text-[#A1A1AA]">
                <span>{new Date(dueDatePreview).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-xs">{SLA_HOURS[priority]}h</span>
              </div>
            </div>

            {/* Linha 6: Empresa e Atendente */}
            <div className="relative">
              <label className="label">Empresa</label>
              {selectedCompany ? (
                <div className="input flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 flex-shrink-0 text-[#71717a]" />
                    <span className="truncate">
                      {selectedCompany.name}
                      {selectedCompany.tenant?.name ? <span className="text-[#a1a1aa]"> · {selectedCompany.tenant.name}</span> : ''}
                    </span>
                  </span>
                  <button type="button" onClick={() => selectCompany(null)} className="flex-shrink-0 text-[#a1a1aa] hover:text-[#ffffff]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
                    <input
                      className="input pl-9"
                      placeholder="Buscar por nome, CNPJ ou tenant..."
                      value={companyQuery}
                      onChange={(e) => { setCompanyQuery(e.target.value); setCompanyOpen(true); }}
                      onFocus={() => setCompanyOpen(true)}
                      onBlur={() => setTimeout(() => setCompanyOpen(false), 150)}
                    />
                  </div>
                  {companyOpen && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#3f3f46] bg-[#18181b] shadow-lg">
                      {filteredCompanies.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-[#a1a1aa]">Nenhuma empresa encontrada.</p>
                      ) : (
                        filteredCompanies.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectCompany(c); }}
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-white/5"
                          >
                            <span className="text-sm text-[#ffffff]">{c.name}</span>
                            <span className="text-xs text-[#a1a1aa]">
                              {c.document ? `CNPJ ${c.document}` : 'Sem CNPJ'}
                              {c.tenant?.name ? ` · ${c.tenant.name}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div>
              <label className="label">Atendente</label>
              <select className="input" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
                <option value="">— Não atribuído —</option>
                {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Linha 7: Tags */}
            <div className="sm:col-span-2">
              <label className="label">Tags</label>
              <TagPicker value={tags} onChange={setTags} />
            </div>

            {/* Linha 8: Issue no Linear (necessário em casos de Bug/Sugestão) */}
            <div className="sm:col-span-2">
              <label className="label">Issue vinculada no Linear (opcional)</label>
              <input
                className="input"
                value={linearInput}
                onChange={(e) => setLinearInput(e.target.value)}
                placeholder="Cole o ID (ex.: ZOR-123) ou a URL da issue — necessário em casos de bug/sugestão"
              />
            </div>

          </div>

          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-400">{error}</div>}

          <div className="flex justify-end gap-3 pt-6 border-t border-[#3f3f46]">
            <button type="button" onClick={() => window.location.href = '/tickets'} className="btn-ghost px-6 py-2">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !subject.trim()} className="btn-primary px-8 py-2">
              {saving ? 'Salvando...' : 'Criar Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}