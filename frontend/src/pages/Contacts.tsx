import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, Plus, Upload, Trash2, Pencil, Building2, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Contact, Company } from '../lib/types';
import Modal from '../components/Modal';

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: comp }] = await Promise.all([
      supabase.from('contacts').select('*, company(*)').order('name'),
      supabase.from('companies').select('*').order('name'),
    ]);
    setContacts(c ?? []);
    setCompanies(comp ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (companyFilter !== 'all' && c.company_id !== companyFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (![c.name, c.email, c.phone, c.position, c.company?.name].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [contacts, search, companyFilter]);

  function openNew() {
    setEditing(null);
    setName(''); setEmail(''); setPhone(''); setPosition(''); setCompanyId(''); setNotes('');
    setShowForm(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setName(c.name); setEmail(c.email ?? ''); setPhone(c.phone ?? ''); setPosition(c.position ?? ''); setCompanyId(c.company_id ?? ''); setNotes(c.notes ?? '');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      await supabase.from('contacts').update({
        name: name.trim(), email: email.trim() || null, phone: phone.trim() || null,
        position: position.trim() || null, company_id: companyId || null, notes: notes.trim() || null,
      }).eq('id', editing.id);
      await supabase.from('system_logs').insert({ action: 'update', entity: 'contact', entity_id: editing.id, details: { name: name.trim() } });
    } else {
      const { data } = await supabase.from('contacts').insert({
        name: name.trim(), email: email.trim() || null, phone: phone.trim() || null,
        position: position.trim() || null, company_id: companyId || null, notes: notes.trim() || null,
      }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ action: 'create', entity: 'contact', entity_id: data.id, details: { name: name.trim() } });
    }
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este contato?')) return;
    await supabase.from('contacts').delete().eq('id', id);
    await supabase.from('system_logs').insert({ action: 'delete', entity: 'contact', entity_id: id });
    await load();
  }

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { alert('Arquivo CSV vazio ou sem dados.'); return; }
      // detect delimiter
      const delim = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === 'nome' || h === 'name');
      const emailIdx = headers.findIndex((h) => h === 'email' || h === 'e-mail');
      const phoneIdx = headers.findIndex((h) => h === 'telefone' || h === 'phone' || h === 'celular');
      const posIdx = headers.findIndex((h) => h === 'cargo' || h === 'position');
      const compIdx = headers.findIndex((h) => h === 'empresa' || h === 'company');

      if (nameIdx === -1) { alert('Coluna "nome" não encontrada no CSV.'); return; }

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delim);
        rows.push({
          name: (cols[nameIdx] ?? '').trim(),
          email: emailIdx >= 0 ? (cols[emailIdx] ?? '').trim() : '',
          phone: phoneIdx >= 0 ? (cols[phoneIdx] ?? '').trim() : '',
          position: posIdx >= 0 ? (cols[posIdx] ?? '').trim() : '',
          company: compIdx >= 0 ? (cols[compIdx] ?? '').trim() : '',
        });
      }

      let imported = 0;
      for (const row of rows) {
        if (!row.name) continue;
        let cid: string | null = null;
        if (row.company) {
          const { data: existing } = await supabase.from('companies').select('id').ilike('name', row.company).maybeSingle();
          if (existing) cid = existing.id;
          else {
            const { data: nc } = await supabase.from('companies').insert({ name: row.company }).select('id').single();
            if (nc) cid = nc.id;
          }
        }
        const { data } = await supabase.from('contacts').insert({
          name: row.name, email: row.email || null, phone: row.phone || null,
          position: row.position || null, company_id: cid,
        }).select('id').single();
        if (data) {
          imported++;
          await supabase.from('system_logs').insert({ action: 'import', entity: 'contact', entity_id: data.id, details: { name: row.name } });
        }
      }
      alert(`${imported} contato(s) importado(s).`);
      await load();
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  function downloadTemplate() {
    const csv = 'nome,email,telefone,cargo,empresa\nJoão Silva,joao@exemplo.com,(11) 9999-9999,Gerente,ACME Ltda';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo_contatos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-sm text-[#8a99b8]">{contacts.length} contatos cadastrados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="btn-outline">
            <Download className="h-4 w-4" /> Modelo CSV
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-outline">
            <Upload className="h-4 w-4" /> Importar CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo Contato
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
            <input className="input pl-9" placeholder="Buscar por nome, e-mail, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="all">Todas as empresas</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8a99b8]">Nenhum contato encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f2d4d] text-left text-xs uppercase tracking-wide text-[#8a99b8]">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Cargo</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="table-row border-b border-[#1f2d4d]/50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-[#c0cce6]">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-[#c0cce6]">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-[#8a99b8]">{c.position ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.company ? (
                        <span className="flex items-center gap-1.5 text-[#c0cce6]">
                          <Building2 className="h-3.5 w-3.5 text-[#5a6a8a]" />{c.company.name}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar Contato' : 'Novo Contato'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">E-mail</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cargo</label>
                <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
              <div>
                <label className="label">Empresa</label>
                <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="">— Nenhuma —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea className="input min-h-[80px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
