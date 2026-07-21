import { useEffect, useMemo, useState } from 'react';
import { Search, X, Building2, Link as LinkIcon, User, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Attendant, Company, Contact, TicketSystem } from '../lib/types';
import Modal from './Modal';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function NewTicketModal({ onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [urlAtendimento, setUrlAtendimento] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');

  const [status, setStatus] = useState('novo');
  const [sistema, setSistema] = useState<TicketSystem>('Z');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [tags, setTags] = useState('');

  const [companyQuery, setCompanyQuery] = useState('');
  const [companyOpen, setCompanyOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('companies').select('*, tenant(*)').order('name'),
      supabase.from('contacts').select('*, company(*)').order('name'),
      supabase.from('attendants').select('*').eq('active', true).order('name'),
    ]).then(([c, co, a]) => {
      setCompanies(c.data ?? []);
      setContacts(co.data ?? []);
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

      if (params.has('new_ticket')) {
        params.delete('new_ticket');
        params.delete('company_id');
        params.delete('url');
        params.delete('name');
        params.delete('phone');
        
        const newQuery = params.toString();
        const basePath = href.split('?')[0];
        const newUrl = basePath + (newQuery ? `?${newQuery}` : '');
        window.history.replaceState({}, document.title, newUrl);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSaving(true);
    setError('');
    
    const ticketData: any = {
      subject: subject.trim(),
      description: description.trim() || null,
      url_atendimento: urlAtendimento.trim() || null,
      nome_contato: nomeContato.trim() || null,
      telefone_contato: telefoneContato.trim() || null,
      status,
      sistema,
      company_id: companyId || null,
      contact_id: contactId || null,
      attendant_id: attendantId || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    };

    const { data, error } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select('id')
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    
    await supabase.from('system_logs').insert({
      action: 'create',
      entity: 'ticket',
      entity_id: data.id,
      details: { subject: subject.trim(), sistema },
    });
    
    setSaving(false);
    onCreated(data.id);
  }

  return (
    <Modal title="Novo Ticket" subtitle="Registre um novo atendimento" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Assunto *</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do atendimento" autoFocus />
          </div>
          
          <div>
            <label className="label">Nome do Contato</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
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
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
              <input 
                className="input pl-9" 
                value={telefoneContato} 
                onChange={(e) => setTelefoneContato(e.target.value)} 
                placeholder="Número de WhatsApp do cliente" 
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="label">URL do Atendimento (Opcional)</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
              <input 
                className="input pl-9" 
                value={urlAtendimento} 
                onChange={(e) => setUrlAtendimento(e.target.value)} 
                placeholder="https://app.crisp.chat/..." 
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <textarea className="input min-h-[100px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do atendimento..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
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
              <option value="L">L — Linea</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Empresa</label>
            {selectedCompany ? (
              <div className="input flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 flex-shrink-0 text-[#5a6a8a]" />
                  <span className="truncate">
                    {selectedCompany.name}
                    {selectedCompany.tenant?.name ? <span className="text-[#8a99b8]"> · {selectedCompany.tenant.name}</span> : ''}
                  </span>
                </span>
                <button type="button" onClick={() => selectCompany(null)} className="flex-shrink-0 text-[#8a99b8] hover:text-[#e6edf7]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
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
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#1f2d4d] bg-[#0b1220] shadow-lg">
                    {filteredCompanies.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-[#8a99b8]">Nenhuma empresa encontrada.</p>
                    ) : (
                      filteredCompanies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectCompany(c); }}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-white/5"
                        >
                          <span className="text-sm text-[#e6edf7]">{c.name}</span>
                          <span className="text-xs text-[#8a99b8]">
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
            <label className="label">Contato</label>
            <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— Nenhum —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company.name}` : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Atendente</label>
            <select className="input" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
              <option value="">— Não atribuído —</option>
              {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tags (separadas por vírgula)</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="urgente, cliente_vip" />
          </div>
        </div>

        {error && <p className="text-sm text-[#f87171]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-[#1f2d4d]">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={saving || !subject.trim()} className="btn-primary">
            {saving ? 'Salvando...' : 'Criar Ticket'}
          </button>
        </div>
      </form>
    </Modal>
  );
}