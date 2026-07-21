import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, Pencil, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Company } from '../lib/types';
import Modal from '../components/Modal';

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('name');
    setCompanies(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => [c.name, c.document, c.email, c.phone].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [companies, search]);

  function openNew() {
    setEditing(null);
    setName(''); setDocument(''); setEmail(''); setPhone(''); setAddress(''); setNotes('');
    setShowForm(true);
  }
  function openEdit(c: Company) {
    setEditing(c);
    setName(c.name); setDocument(c.document ?? ''); setEmail(c.email ?? ''); setPhone(c.phone ?? ''); setAddress(c.address ?? ''); setNotes(c.notes ?? '');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      await supabase.from('companies').update({
        name: name.trim(), document: document.trim() || null, email: email.trim() || null,
        phone: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null,
      }).eq('id', editing.id);
      await supabase.from('system_logs').insert({ action: 'update', entity: 'company', entity_id: editing.id, details: { name: name.trim() } });
    } else {
      const { data } = await supabase.from('companies').insert({
        name: name.trim(), document: document.trim() || null, email: email.trim() || null,
        phone: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null,
      }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ action: 'create', entity: 'company', entity_id: data.id, details: { name: name.trim() } });
    }
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta empresa? Contatos vinculizados ficarão sem empresa.')) return;
    await supabase.from('companies').delete().eq('id', id);
    await supabase.from('system_logs').insert({ action: 'delete', entity: 'company', entity_id: id });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-sm text-[#8a99b8]">{companies.length} empresas cadastradas</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova Empresa</button>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6a8a]" />
          <input className="input pl-9" placeholder="Buscar por nome, CNPJ, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-sm text-[#8a99b8]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#8a99b8]">Nenhuma empresa encontrada.</p>
          </div>
        ) : filtered.map((c) => (
          <div key={c.id} className="card card-hover p-5 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2f7ff0]/10">
                  <Building2 className="h-5 w-5 text-[#5b9cf5]" />
                </div>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  {c.document && <p className="text-xs text-[#8a99b8]">{c.document}</p>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm text-[#c0cce6]">
              {c.email && <p className="truncate">{c.email}</p>}
              {c.phone && <p>{c.phone}</p>}
              {c.address && <p className="text-[#8a99b8]">{c.address}</p>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar Empresa' : 'Nova Empresa'} onClose={() => setShowForm(false)} size="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nome *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">CNPJ / CPF</label>
                <input className="input" value={document} onChange={(e) => setDocument(e.target.value)} />
              </div>
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
            <div>
              <label className="label">Endereço</label>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
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
