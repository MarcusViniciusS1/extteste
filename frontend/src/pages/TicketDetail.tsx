import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Save, Building2, User, Tag, MessageSquare, Send, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ticket, Company, Contact, Attendant, TicketNote, STATUS_LABELS } from '../lib/types';
import { StatusBadge } from '../components/Badges';

interface Props {
  id: string;
  onBack: () => void;
}

export default function TicketDetail({ id, onBack }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Campos editáveis do formulário
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('novo');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Nova nota
  const [newNote, setNewNote] = useState('');
  const [noteAttendantId, setNoteAttendantId] = useState('');
  const [isInternal, setIsInternal] = useState(true);

  // Modal de Finalização
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [solutionNote, setSolutionNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    setLoading(true);
    const [tRes, cRes, coRes, aRes, nRes] = await Promise.all([
      supabase.from('tickets').select('*, company(*), contact(*), attendant(*)').eq('id', id).single(),
      supabase.from('companies').select('*').order('name'),
      supabase.from('contacts').select('*').order('name'),
      supabase.from('attendants').select('*').eq('active', true).order('name'),
      supabase.from('notas_ticket').select('*, attendant(*)').eq('ticket_id', id).order('criado_em', { ascending: true }),
    ]);

    if (tRes.data) {
      const t = tRes.data as any;
      setTicket(t);
      setSubject(t.subject || '');
      setDescription(t.descricao || '');
      setStatus(t.status || 'novo');
      setCompanyId(t.company_id || '');
      setContactId(t.contact_id || '');
      setAttendantId(t.attendant_id || '');
      setTagsInput(Array.isArray(t.tags) ? t.tags.join(', ') : '');

      if (!t.contact_id && t.telefone_contato && coRes.data) {
        const cleanPhone = t.telefone_contato.replace(/\D/g, '');
        const matchedContact = coRes.data.find(c => c.phone && c.phone.replace(/\D/g, '').includes(cleanPhone));
        if (matchedContact) {
          setContactId(matchedContact.id);
        }
      }
    }

    setCompanies(cRes.data ?? []);
    setContacts(coRes.data ?? []);
    setAttendants(aRes.data ?? []);
    setNotes(nRes.data ?? []);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

    const updatePayload: any = {
      subject: subject.trim(),
      descricao: description.trim() || null,
      status,
      company_id: companyId || null,
      contact_id: contactId || null,
      attendant_id: attendantId || null,
      tags,
    };

    const { error } = await supabase.from('tickets').update(updatePayload).eq('id', id);

    if (!error) {
      await loadData();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja excluir este ticket?')) return;
    await supabase.from('tickets').delete().eq('id', id);
    onBack();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;

    // Salva usando as colunas corretas do banco (ticket_id, atendant_id/atendente_id, nota, interna)
    await supabase.from('notas_ticket').insert({
      ticket_id: id,
      atendant_id: noteAttendantId || attendantId || null,
      nota: newNote.trim(),
      interna: isInternal,
    });

    setNewNote('');
    loadData();
  }

  // Finalizar ticket com nota de solução obrigatória
  async function handleFinalizeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!solutionNote.trim()) return;

    setFinalizing(true);

    // 1. Salva a nota com a solução do problema
    await supabase.from('notas_ticket').insert({
      ticket_id: id,
      atendant_id: attendantId || null,
      nota: `[SOLUÇÃO DO PROBLEMA]: ${solutionNote.trim()}`,
      interna: false, // Visível/importante
    });

    // 2. Altera o status do ticket para resolvido/fechado
    const { error } = await supabase.from('tickets').update({
      status: 'resolvido',
      fechado_em: new Date().toISOString()
    }).eq('id', id);

    if (!error) {
      setShowFinalizeModal(false);
      setSolutionNote('');
      await loadData();
    }
    setFinalizing(false);
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-[#8a99b8]">Carregando detalhes do ticket...</div>;
  }

  if (!ticket) {
    return <div className="py-20 text-center text-sm text-[#8a99b8]">Ticket não encontrado.</div>;
  }

  const tAny = ticket as any;
  const isResolved = ticket.status === 'resolvido' || ticket.status === 'fechado';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-sm text-[#8a99b8] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-2">
          {!isResolved && (
            <button 
              onClick={() => setShowFinalizeModal(true)} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar Ticket
            </button>
          )}
          <button onClick={handleDelete} className="btn-ghost text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 px-3 py-1.5 text-sm">
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-sm">
            <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Top Banner do Ticket */}
      <div className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-[#5b9cf5] bg-[#5b9cf5]/10 px-2.5 py-1 rounded">
              #{ticket.ticket_number ?? '—'}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white">{ticket.subject}</h1>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-[#8a99b8]">
            <span>Criado em {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pt-BR') : ''}</span>
            <span>·</span>
            <StatusBadge status={ticket.status} />
            {tAny.sistema && (
              <>
                <span>·</span>
                <span className="bg-white/5 px-2 py-0.5 rounded text-white font-medium">Sistema: {tAny.sistema === 'L' ? 'Lonngren' : 'Zorte'}</span>
              </>
            )}
            {tAny.channel && (
              <>
                <span>·</span>
                <span className="bg-white/5 px-2 py-0.5 rounded text-white font-medium">
                  Canal: {({ chat: 'Chat', whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone', presencial: 'Presencial', api: 'API' }[tAny.channel as string] || tAny.channel)}
                </span>
              </>
            )}
          </div>
        </div>

        {tAny.url_atendimento && (
          <a 
            href={tAny.url_atendimento} 
            target="_blank" 
            rel="noreferrer" 
            className="btn-ghost border border-[#2f7ff0]/40 text-[#5b9cf5] hover:bg-[#2f7ff0]/10 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
          >
            Abrir conversa no Crisp ↗
          </a>
        )}
      </div>

      {/* Grid Principal & Painel Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulário de Edição */}
        <div className="lg:col-span-2 card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[#8a99b8] uppercase tracking-wider mb-2">Editar Ticket</h2>
          
          <div>
            <label className="label">Assunto</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="label">Descrição</label>
            <textarea className="input min-h-[100px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Empresa</label>
              <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Contato (WhatsApp / Número)</label>
              <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">— Nenhum —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Atendente</label>
              <select className="input" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
                <option value="">— Não atribuído —</option>
                {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Tags (separadas por vírgula)</label>
            <input className="input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: suporte, urgente" />
          </div>
        </div>

        {/* Informações Rápidas e Dados do Crisp capturados */}
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#8a99b8] uppercase tracking-wider">Informações do Cliente</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-[#5a6a8a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#8a99b8] block">Nome Capturado (Crisp)</span>
                  <span className="text-[#e6edf7] font-medium">{tAny.nome_contato || 'Não informado'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-[#5a6a8a] mt-0.5 flex-shrink-0">WPP</span>
                <div>
                  <span className="text-xs text-[#8a99b8] block">WhatsApp Business / Telefone</span>
                  <span className="text-[#e6edf7] font-medium">{tAny.telefone_contato || 'Não informado'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-[#5a6a8a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#8a99b8] block">Empresa Vinculada</span>
                  <span className="text-[#e6edf7] font-medium">{ticket.company?.name || 'Nenhuma'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Tag className="h-4 w-4 text-[#5a6a8a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#8a99b8] block">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ticket.tags && ticket.tags.length > 0 ? (
                      ticket.tags.map((tag: string) => (
                        <span key={tag} className="bg-white/5 text-xs px-2 py-0.5 rounded text-[#8a99b8]">{tag}</span>
                      ))
                    ) : (
                      <span className="text-[#8a99b8]">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Seção de Notas / Interações */}
      <div className="card p-6 space-y-6">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#2f7ff0]" /> Interações / Notas ({notes.length})
        </h2>

        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="p-4 rounded-lg bg-[#0b1220] border border-[#1f2d4d] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#8a99b8]">
                <span className="font-medium text-white">{note.attendant?.name || 'Sistema'}</span>
                <span>{note.criado_em ? new Date(note.criado_em).toLocaleString('pt-BR') : ''}</span>
              </div>
              <p className="text-sm text-[#e6edf7] whitespace-pre-wrap">{note.nota}</p>
            </div>
          ))}

          {notes.length === 0 && (
            <p className="text-sm text-[#8a99b8] text-center py-4">Nenhuma nota registrada ainda.</p>
          )}
        </div>

        {/* Adicionar Nova Nota */}
        <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-[#1f2d4d]">
          <textarea
            className="input min-h-[80px]"
            placeholder="Adicionar interação ou nota..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <select className="input text-xs w-auto" value={noteAttendantId} onChange={(e) => setNoteAttendantId(e.target.value)}>
                <option value="">Atendente responsável</option>
                {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-[#8a99b8] cursor-pointer">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded bg-[#0b1220] border-[#1f2d4d]" />
                Nota interna
              </label>
            </div>
            <button type="submit" disabled={!newNote.trim()} className="btn-primary w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-sm">
              <Send className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </form>
      </div>

      {/* Modal para Finalizar Ticket com Descrição da Solução */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="card w-full max-w-lg p-6 space-y-5 bg-[#0b1220] border border-[#1f2d4d] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Finalizar Atendimento
              </h3>
              <button 
                onClick={() => setShowFinalizeModal(false)}
                className="text-[#8a99b8] hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFinalizeSubmit} className="space-y-4">
              <div>
                <label className="label">Descrição da Solução do Problema *</label>
                <p className="text-xs text-[#8a99b8] mb-2">
                  Informe brevemente como o problema foi resolvido. Esta informação será salva como nota oficial de encerramento.
                </p>
                <textarea
                  className="input min-h-[120px] resize-y"
                  placeholder="Descreva a solução aplicada..."
                  value={solutionNote}
                  onChange={(e) => setSolutionNote(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#1f2d4d]">
                <button
                  type="button"
                  onClick={() => setShowFinalizeModal(false)}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={finalizing || !solutionNote.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {finalizing ? 'Finalizando...' : 'Confirmar e Finalizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}