import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Save, Building2, User, Tag, MessageSquare, Send, CheckCircle2, X, Link as LinkIcon, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ticket, Company, Attendant, TicketNote, TicketStatus, TicketPriority, STATUS_LABELS, PRIORITY_LABELS } from '../lib/types';
import { StatusBadge, PriorityBadge, SlaBadge } from '../components/Badges';
import { SLA_HOURS, suggestDueDate } from '../lib/sla';
import TagPicker from '../components/TagPicker';
import TagBadge from '../components/TagBadge';
import { useTagCatalog } from '../lib/useTagCatalog';
import { getCurrentAttendantId } from '../lib/currentAttendant';
import { confirmDialog } from '../lib/confirm';
import { toast } from '../lib/toast';

interface Props {
  id: string;
  onBack: () => void;
}

export default function TicketDetail({ id, onBack }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const tagCatalog = useTagCatalog();

  // Campos editáveis do formulário
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TicketStatus>('novo');
  const [priority, setPriority] = useState<TicketPriority>('media');
  const [companyId, setCompanyId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [linearInput, setLinearInput] = useState('');

  // Nova nota — o autor é sempre o atendente logado neste navegador ("quem é
  // você", mesmo mecanismo do sino de notificações), registrado automaticamente.
  const [newNote, setNewNote] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const currentAttendantId = getCurrentAttendantId();

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
    const [tRes, cRes, aRes, nRes] = await Promise.all([
      supabase.from('tickets').select('*, company(*), contact(*), attendant(*)').eq('id', id).single(),
      supabase.from('companies').select('*').order('name'),
      supabase.from('attendants').select('*').eq('active', true).order('name'),
      supabase.from('ticket_notes').select('*, attendant(*)').eq('ticket_id', id).order('created_at', { ascending: true }),
    ]);

    if (tRes.data) {
      const t = tRes.data as Ticket;
      setTicket(t);
      setSubject(t.subject || '');
      setDescription(t.description || '');
      setStatus(t.status || 'novo');
      setPriority(t.priority || 'media');
      setCompanyId(t.company_id || '');
      setAttendantId(t.attendant_id || '');
      setTags(Array.isArray(t.tags) ? t.tags : []);
      setLinearInput(t.linear_issue_url || t.linear_issue_id || '');
    }

    setCompanies(cRes.data ?? []);
    setAttendants(aRes.data ?? []);
    setNotes(nRes.data ?? []);
    setLoading(false);
  }

  // Muda o status para "Assumido": se ainda não há atendente, atribui
  // automaticamente quem está logado neste navegador.
  function handleStatusChange(value: TicketStatus) {
    setStatus(value);
    if (value === 'assumido' && !attendantId && currentAttendantId) {
      setAttendantId(currentAttendantId);
    }
  }

  // Prazo do SLA: sempre calculado (criação do ticket + horas da prioridade
  // atual) — nunca digitado manualmente.
  const computedDueDate = ticket ? suggestDueDate(priority, new Date(ticket.created_at as string)) : null;

  // Assumir o ticket com um clique: define status "Assumido" + atendente
  // logado e salva na hora, sem precisar abrir o formulário.
  async function handleAssumeTicket() {
    if (!currentAttendantId) {
      toast.error('Selecione "Quem é você?" no topo da tela para assumir o ticket.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tickets').update({ status: 'assumido', attendant_id: currentAttendantId }).eq('id', id);
    if (!error) {
      setStatus('assumido');
      setAttendantId(currentAttendantId);
      toast.success('Ticket assumido.');
      await loadData();
    } else {
      toast.error(`Erro ao assumir o ticket: ${error.message}`);
    }
    setSaving(false);
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

  async function handleSave() {
    setSaving(true);
    const linear = parseLinearInput(linearInput);

    const updatePayload: Partial<Ticket> = {
      subject: subject.trim(),
      description: description.trim() || null,
      status,
      priority,
      due_date: computedDueDate,
      linear_issue_id: linear.id,
      linear_issue_url: linear.url,
      company_id: companyId || null,
      attendant_id: attendantId || null,
      tags,
    };

    const { error } = await supabase.from('tickets').update(updatePayload).eq('id', id);

    if (!error) {
      toast.success('Ticket salvo.');
      await loadData();
    } else {
      toast.error(`Erro ao salvar: ${error.message}`);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!(await confirmDialog('Tem certeza que deseja excluir este ticket?'))) return;
    await supabase.from('tickets').delete().eq('id', id);
    toast.success('Ticket excluído.');
    onBack();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;

    const { error } = await supabase.from('ticket_notes').insert({
      ticket_id: id,
      attendant_id: currentAttendantId || attendantId || null,
      note: newNote.trim(),
      is_internal: isInternal,
    });

    if (error) {
      toast.error(`Erro ao salvar nota: ${error.message}`);
      return;
    }
    setNewNote('');
    loadData();
  }

  // Finalizar ticket com nota de solução obrigatória
  async function handleFinalizeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!solutionNote.trim()) return;

    setFinalizing(true);

    // 1. Salva a nota com a solução do problema
    await supabase.from('ticket_notes').insert({
      ticket_id: id,
      attendant_id: currentAttendantId || attendantId || null,
      note: `[SOLUÇÃO DO PROBLEMA]: ${solutionNote.trim()}`,
      is_internal: false, // Visível/importante
    });

    // 2. Altera o status do ticket para resolvido/fechado
    const { error } = await supabase.from('tickets').update({
      status: 'resolvido',
      closed_at: new Date().toISOString(),
    }).eq('id', id);

    if (!error) {
      toast.success('Ticket finalizado.');
      setShowFinalizeModal(false);
      setSolutionNote('');
      await loadData();
    } else {
      toast.error(`Erro ao finalizar: ${error.message}`);
    }
    setFinalizing(false);
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-[#a1a1aa]">Carregando detalhes do ticket...</div>;
  }

  if (!ticket) {
    return <div className="py-20 text-center text-sm text-[#a1a1aa]">Ticket não encontrado.</div>;
  }

  const isResolved = ticket.status === 'resolvido' || ticket.status === 'fechado';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-2">
          {!isResolved && status !== 'assumido' && (
            <button
              onClick={handleAssumeTicket}
              disabled={saving}
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-[#EF4444]/20"
            >
              <UserCheck className="h-4 w-4" /> Assumir Ticket
            </button>
          )}
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
            <span className="font-mono text-sm text-[#f87171] bg-[#f87171]/10 px-2.5 py-1 rounded">
              #{ticket.ticket_number ?? '—'}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white">{ticket.subject}</h1>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-[#a1a1aa]">
            <span>Criado em {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pt-BR') : ''}</span>
            <span>·</span>
            <StatusBadge status={ticket.status} />
            {ticket.status === 'assumido' && ticket.attendant?.name && (
              <span className="bg-[#0ea5e9]/10 text-[#38bdf8] px-2 py-0.5 rounded font-medium">
                Assumido por {ticket.attendant.name}
              </span>
            )}
            <PriorityBadge priority={ticket.priority} />
            <SlaBadge dueDate={ticket.due_date} resolved={isResolved} />
            {ticket.sistema && (
              <>
                <span>·</span>
                <span className="bg-white/5 px-2 py-0.5 rounded text-white font-medium">Sistema: {ticket.sistema === 'L' ? 'Lonngren' : 'Zorte'}</span>
              </>
            )}
            {ticket.channel && (
              <>
                <span>·</span>
                <span className="bg-white/5 px-2 py-0.5 rounded text-white font-medium">
                  Canal: {({ chat: 'Chat', whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone', presencial: 'Presencial', api: 'API' }[ticket.channel as string] || ticket.channel)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ticket.linear_issue_url && (
            <a
              href={ticket.linear_issue_url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost border border-[#5e6ad2]/40 text-[#8b93f8] hover:bg-[#5e6ad2]/10 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
            >
              {ticket.linear_issue_id || 'Abrir issue no Linear'} ↗
            </a>
          )}
          {ticket.url_atendimento && (
            <a
              href={ticket.url_atendimento}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost border border-[#ef4444]/40 text-[#f87171] hover:bg-[#ef4444]/10 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
            >
              Abrir conversa no Crisp ↗
            </a>
          )}
        </div>
      </div>

      {/* Grid Principal & Painel Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulário de Edição */}
        <div className="lg:col-span-2 card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Editar Ticket</h2>
          
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
              <select className="input" value={status} onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {status === 'assumido' && (
                <p className="mt-1 text-xs text-[#38bdf8]">
                  {attendantId ? `Assumido por ${attendants.find((a) => a.id === attendantId)?.name ?? '—'}` : 'Selecione o atendente que assumiu abaixo.'}
                </p>
              )}
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
              <label className="label">Prioridade (SLA)</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prazo (SLA)</label>
              <div className="input flex items-center justify-between text-[#A1A1AA]">
                <span>{computedDueDate ? new Date(computedDueDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="text-xs">{SLA_HOURS[priority]}h da criação</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Atendente</label>
            <select className="input" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
              <option value="">— Não atribuído —</option>
              {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Tags</label>
            <TagPicker value={tags} onChange={setTags} />
          </div>

          <div>
            <label className="label">Issue vinculada no Linear</label>
            <input
              className="input"
              value={linearInput}
              onChange={(e) => setLinearInput(e.target.value)}
              placeholder="Cole o ID (ex.: ZOR-123) ou a URL da issue"
            />
            <p className="mt-1 text-xs text-[#a1a1aa]">
              Quando essa issue mudar de status no Linear, você recebe um aviso no sino de notificações.
            </p>
          </div>
        </div>

        {/* Informações Rápidas e Dados do Crisp capturados */}
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider">Informações do Cliente</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-[#71717a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#a1a1aa] block">Nome Capturado (Crisp)</span>
                  <span className="text-[#ffffff] font-medium">{ticket.nome_contato || 'Não informado'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-xs font-bold text-[#71717a] mt-0.5 flex-shrink-0">WPP</span>
                <div>
                  <span className="text-xs text-[#a1a1aa] block">WhatsApp Business / Telefone</span>
                  <span className="text-[#ffffff] font-medium">{ticket.telefone_contato || 'Não informado'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-[#71717a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#a1a1aa] block">Empresa Vinculada</span>
                  <span className="text-[#ffffff] font-medium">{ticket.company?.name || 'Nenhuma'}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Tag className="h-4 w-4 text-[#71717a] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-[#a1a1aa] block">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ticket.tags && ticket.tags.length > 0 ? (
                      ticket.tags.map((tag: string) => <TagBadge key={tag} name={tag} catalog={tagCatalog} />)
                    ) : (
                      <span className="text-[#a1a1aa]">—</span>
                    )}
                  </div>
                </div>
              </div>

              {ticket.linear_issue_id && (
                <div className="flex items-start gap-3">
                  <LinkIcon className="h-4 w-4 text-[#71717a] mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs text-[#a1a1aa] block">Issue no Linear</span>
                    {ticket.linear_issue_url ? (
                      <a href={ticket.linear_issue_url} target="_blank" rel="noreferrer" className="text-[#8b93f8] font-medium hover:underline">
                        {ticket.linear_issue_id} ↗
                      </a>
                    ) : (
                      <span className="text-[#ffffff] font-medium">{ticket.linear_issue_id}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Seção de Notas / Interações */}
      <div className="card p-6 space-y-6">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[#ef4444]" /> Interações / Notas ({notes.length})
        </h2>

        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="p-4 rounded-lg bg-[#18181b] border border-[#3f3f46] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#a1a1aa]">
                <span className="font-medium text-white">{note.attendant?.name || 'Sistema'}</span>
                <span>{note.created_at ? new Date(note.created_at).toLocaleString('pt-BR') : ''}</span>
              </div>
              <p className="text-sm text-[#ffffff] whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}

          {notes.length === 0 && (
            <p className="text-sm text-[#a1a1aa] text-center py-4">Nenhuma nota registrada ainda.</p>
          )}
        </div>

        {/* Adicionar Nova Nota */}
        <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-[#3f3f46]">
          <textarea
            className="input min-h-[80px]"
            placeholder="Adicionar interação ou nota..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <span className="text-xs text-[#a1a1aa]">
                Registrando como <span className="text-white font-medium">{attendants.find((a) => a.id === currentAttendantId)?.name ?? 'não identificado'}</span>
              </span>
              <label className="flex items-center gap-2 text-xs text-[#a1a1aa] cursor-pointer">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded bg-[#18181b] border-[#3f3f46]" />
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
          <div className="card w-full max-w-lg p-6 space-y-5 bg-[#18181b] border border-[#3f3f46] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Finalizar Atendimento
              </h3>
              <button 
                onClick={() => setShowFinalizeModal(false)}
                className="text-[#a1a1aa] hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFinalizeSubmit} className="space-y-4">
              <div>
                <label className="label">Descrição da Solução do Problema *</label>
                <p className="text-xs text-[#a1a1aa] mb-2">
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

              <div className="flex justify-end gap-3 pt-3 border-t border-[#3f3f46]">
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