import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Trash2, MessageSquarePlus, Clock, User, Building2, Tag, Sparkles, Copy, Wand2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Ticket as TicketType, TicketNote, Attendant, Company, Contact,
  TicketStatus, TicketPriority, TicketChannel, STATUS_LABELS, PRIORITY_LABELS, CHANNEL_LABELS,
} from '../lib/types';
import { StatusBadge, PriorityBadge } from '../components/Badges';
import { analyzeTicket as aiAnalyzeTicket, getAiStatus, TicketAnalysis } from '../lib/ai';

interface Props {
  id: string;
  onBack: () => void;
}

export default function TicketDetail({ id, onBack }: Props) {
  const [ticket, setTicket] = useState<TicketType | null>(null);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteInternal, setNoteInternal] = useState(false);
  const [addNoteAttendant, setAddNoteAttendant] = useState('');

  // editable fields
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TicketStatus>('novo');
  const [priority, setPriority] = useState<TicketPriority>('media');
  const [channel, setChannel] = useState<TicketChannel>('telefone');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [attendantId, setAttendantId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');

  // IA (Claude)
  const [aiConfigured, setAiConfigured] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TicketAnalysis | null>(null);
  const [aiError, setAiError] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: t }, { data: n }, { data: att }, { data: comp }, { data: cont }] = await Promise.all([
      supabase.from('tickets').select('*, company(*), contact(*), attendant(*)').eq('id', id).maybeSingle(),
      supabase.from('ticket_notes').select('*, attendant(*)').eq('ticket_id', id).order('created_at', { ascending: false }),
      supabase.from('attendants').select('*').order('name'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('contacts').select('*, company(*)').order('name'),
    ]);
    setTicket(t);
    setNotes(n ?? []);
    setAttendants(att ?? []);
    setCompanies(comp ?? []);
    setContacts(cont ?? []);
    if (t) {
      setSubject(t.subject);
      setDescription(t.description ?? '');
      setStatus(t.status);
      setPriority(t.priority);
      setChannel(t.channel);
      setCompanyId(t.company_id ?? '');
      setContactId(t.contact_id ?? '');
      setAttendantId(t.attendant_id ?? '');
      setDueDate(t.due_date ? new Date(t.due_date).toISOString().slice(0, 16) : '');
      setTags((t.tags ?? []).join(', '));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { setAnalysis(null); setAiError(''); }, [id]);
  useEffect(() => { getAiStatus().then((s) => setAiConfigured(s.configured)); }, []);

  async function handleAnalyze() {
    setAnalyzing(true);
    setAiError('');
    try {
      setAnalysis(await aiAnalyzeTicket(id));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao analisar o ticket.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!ticket) return;
    setSaving(true);
    const { error } = await supabase.from('tickets').update({
      subject: subject.trim(),
      description: description.trim() || null,
      status,
      priority,
      channel,
      company_id: companyId || null,
      contact_id: contactId || null,
      attendant_id: attendantId || null,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      closed_at: status === 'fechado' && !ticket.closed_at ? new Date().toISOString() : ticket.closed_at,
    }).eq('id', id);
    if (!error) {
      await supabase.from('system_logs').insert({
        action: 'update', entity: 'ticket', entity_id: id, details: { subject: subject.trim() },
      });
      await load();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Excluir este ticket permanentemente?')) return;
    await supabase.from('tickets').delete().eq('id', id);
    await supabase.from('system_logs').insert({ action: 'delete', entity: 'ticket', entity_id: id });
    onBack();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    const { data } = await supabase.from('ticket_notes').insert({
      ticket_id: id,
      attendant_id: addNoteAttendant || null,
      note: newNote.trim(),
      is_internal: noteInternal,
    }).select('*, attendant(*)').single();
    if (data) {
      setNotes([data, ...notes]);
      setNewNote('');
      setNoteInternal(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>;
  if (!ticket) return <div className="py-16 text-center text-sm text-[#f87171]">Ticket não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="btn-danger">
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2f7ff0]/10 text-lg font-bold text-[#5b9cf5]">
            #{ticket.ticket_number ?? '—'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a99b8]">
              <Clock className="h-3.5 w-3.5" />
              {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pt-BR') : ''}
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Edit form */}
        <div className="card p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold">Editar Ticket</h3>
          <div>
            <label className="label">Assunto</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input min-h-[120px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Canal</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as TicketChannel)}>
                {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Empresa</label>
              <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
              <label className="label">Data Limite</label>
              <input type="datetime-local" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Tags (separadas por vírgula)</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Informações</h3>
            <div className="space-y-3 text-sm">
              <InfoRow icon={Building2} label="Empresa" value={ticket.company?.name ?? '—'} />
              <InfoRow icon={User} label="Contato" value={ticket.contact?.name ?? '—'} />
              <InfoRow icon={User} label="Atendente" value={ticket.attendant?.name ?? '—'} />
              <InfoRow icon={Tag} label="Tags" value={(ticket.tags ?? []).join(', ') || '—'} />
              {ticket.due_date && (
                <InfoRow icon={Clock} label="Prazo" value={new Date(ticket.due_date).toLocaleString('pt-BR')} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* IA */}
      {aiConfigured && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[#a78bfa]" /> Análise com IA (Claude)
            </h3>
            <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary">
              <Sparkles className="h-4 w-4" /> {analyzing ? 'Analisando...' : 'Analisar ticket'}
            </button>
          </div>

          {aiError && <p className="mt-3 text-sm text-[#f87171]">{aiError}</p>}

          {analysis && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge border border-white/10 bg-white/5 text-[#c0cce6]">Categoria: {analysis.categoria}</span>
                <span className="badge border border-white/10 bg-white/5 text-[#c0cce6]">Sentimento: {analysis.sentimento}</span>
                <span className="badge border border-white/10 bg-white/5 text-[#c0cce6]">Prioridade sugerida: {PRIORITY_LABELS[analysis.prioridade_sugerida]}</span>
                {analysis.prioridade_sugerida !== priority && (
                  <button onClick={() => setPriority(analysis.prioridade_sugerida)} className="btn-outline text-xs px-2.5 py-1.5">
                    <Wand2 className="h-3.5 w-3.5" /> Aplicar prioridade
                  </button>
                )}
              </div>

              <div>
                <p className="label">Resumo</p>
                <p className="whitespace-pre-wrap text-sm text-[#c0cce6]">{analysis.resumo}</p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="label">Resposta sugerida</p>
                  <button onClick={() => setNewNote(analysis.resposta_sugerida)} className="btn-outline text-xs px-2.5 py-1.5">
                    <Copy className="h-3.5 w-3.5" /> Usar como resposta
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#1f2d4d] bg-[#0b1220] p-3 text-sm text-[#c0cce6]">{analysis.resposta_sugerida}</p>
              </div>

              {analysis.proximos_passos.length > 0 && (
                <div>
                  <p className="label">Próximos passos</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#c0cce6]">
                    {analysis.proximos_passos.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold">Interações / Notas ({notes.length})</h3>
        <form onSubmit={handleAddNote} className="mb-5 space-y-3 rounded-lg border border-[#1f2d4d] bg-[#0b1220] p-4">
          <textarea className="input min-h-[80px] resize-y" placeholder="Adicionar interação..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <select className="input w-auto" value={addNoteAttendant} onChange={(e) => setAddNoteAttendant(e.target.value)}>
              <option value="">Sem atendente</option>
              {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-[#c0cce6]">
              <input type="checkbox" checked={noteInternal} onChange={(e) => setNoteInternal(e.target.checked)} className="accent-[#2f7ff0]" />
              Nota interna
            </label>
            <button type="submit" disabled={!newNote.trim()} className="btn-primary ml-auto">
              <MessageSquarePlus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#8a99b8]">Nenhuma interação registrada.</p>
          ) : notes.map((n) => (
            <div key={n.id} className={`rounded-lg border p-4 ${n.is_internal ? 'border-[#f59e0b]/20 bg-[#f59e0b]/5' : 'border-[#1f2d4d] bg-[#0b1220]'}`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2f7ff0]/15 text-xs font-bold text-[#5b9cf5]">
                    {(n.attendant?.name ?? '?').charAt(0)}
                  </div>
                  <span className="text-sm font-medium">{n.attendant?.name ?? 'Sistema'}</span>
                  {n.is_internal && <span className="badge bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30">Interna</span>}
                </div>
                <span className="text-xs text-[#8a99b8]">{n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : ''}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[#c0cce6]">{n.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#5a6a8a]" />
      <div>
        <p className="text-xs text-[#8a99b8]">{label}</p>
        <p className="text-sm text-[#e6edf7]">{value}</p>
      </div>
    </div>
  );
}
