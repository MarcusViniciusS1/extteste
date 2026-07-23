import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, Pencil, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Company, Tenant } from '../lib/types';
import Modal from '../components/Modal';
import TagBadge from '../components/TagBadge';
import { useTagCatalog } from '../lib/useTagCatalog';
import { maskDocument, maskPhone } from '../lib/masks';
import { getCurrentAttendantId } from '../lib/currentAttendant';
import { confirmDialog } from '../lib/confirm';
import { toast } from '../lib/toast';

const NEW_CLIENT_TAG = 'Cliente Novo';
const NEW_CLIENT_DAYS = 60;

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const tagCatalog = useTagCatalog();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: companiesData }, { data: tenantsData }] = await Promise.all([
      supabase.from('companies').select('*, tenant(*)').order('name'),
      supabase.from('tenants').select('*').order('name'),
    ]);
    const list = companiesData ?? [];

    // Expira o selo "Cliente Novo" depois de NEW_CLIENT_DAYS dias — checagem
    // preguiçosa (feita ao carregar a lista) em vez de um job agendado.
    const cutoff = Date.now() - NEW_CLIENT_DAYS * 24 * 60 * 60 * 1000;
    for (const c of list as Company[]) {
      const tags: string[] | null | undefined = c.tags;
      if (tags?.includes(NEW_CLIENT_TAG) && c.created_at && new Date(c.created_at).getTime() < cutoff) {
        const nextTags = tags.filter((t: string) => t !== NEW_CLIENT_TAG);
        c.tags = nextTags;
        void supabase.from('companies').update({ tags: nextTags }).eq('id', c.id);
      }
    }

    setCompanies(list);
    setTenants(tenantsData ?? []);
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
    setName(''); setDocument(''); setEmail(''); setPhone(''); setTenantName(''); setNotes('');
    setShowForm(true);
  }
  function openEdit(c: Company) {
    setEditing(c);
    setName(c.name); setDocument(maskDocument(c.document ?? '')); setEmail(c.email ?? ''); setPhone(maskPhone(c.phone ?? '')); setTenantName(c.tenant?.name ?? ''); setNotes(c.notes ?? '');
    setShowForm(true);
  }

  // Resolve o nome digitado para um tenant_id: reaproveita um tenant existente
  // com o mesmo nome (case-insensitive) ou cria um novo na hora.
  async function resolveTenantId(rawName: string): Promise<string | null> {
    const nm = rawName.trim();
    if (!nm) return null;
    const existing = tenants.find((t) => t.name.toLowerCase() === nm.toLowerCase());
    if (existing) return existing.id;
    const { data } = await supabase.from('tenants').insert({ name: nm }).select('id').single();
    return data?.id ?? null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const tenantId = await resolveTenantId(tenantName);
    if (editing) {
      await supabase.from('companies').update({
        name: name.trim(), document: document.trim() || null, email: email.trim() || null,
        phone: phone.trim() || null, tenant_id: tenantId, notes: notes.trim() || null,
      }).eq('id', editing.id);
      await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'update', entity: 'company', entity_id: editing.id, details: { name: name.trim() } });
    } else {
      const { data } = await supabase.from('companies').insert({
        name: name.trim(), document: document.trim() || null, email: email.trim() || null,
        phone: phone.trim() || null, tenant_id: tenantId, notes: notes.trim() || null,
        tags: [NEW_CLIENT_TAG],
      }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'create', entity: 'company', entity_id: data.id, details: { name: name.trim() } });
    }
    toast.success(editing ? 'Empresa atualizada.' : 'Empresa criada.');
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog('Excluir esta empresa? Contatos vinculados ficarão sem empresa.'))) return;
    await supabase.from('companies').delete().eq('id', id);
    await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'delete', entity: 'company', entity_id: id });
    toast.success('Empresa excluída.');
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-sm text-[#a1a1aa]">{companies.length} empresas cadastradas</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova Empresa</button>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
          <input className="input pl-9" placeholder="Buscar por nome, CNPJ, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-sm text-[#a1a1aa]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#a1a1aa]">Nenhuma empresa encontrada.</p>
          </div>
        ) : filtered.map((c) => (
          <div key={c.id} className="card card-hover p-5 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ef4444]/10">
                  <Building2 className="h-5 w-5 text-[#f87171]" />
                </div>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  {c.document && <p className="text-xs text-[#a1a1aa]">{maskDocument(c.document)}</p>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(c)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm text-[#d4d4d8]">
              {c.email && <p className="truncate">{c.email}</p>}
              {c.phone && <p>{maskPhone(c.phone)}</p>}
              {c.tenant?.name && <p className="text-[#a1a1aa]">{c.tenant.name}</p>}
            </div>
            {c.tags && c.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {c.tags.map((tag) => <TagBadge key={tag} name={tag} catalog={tagCatalog} />)}
              </div>
            )}
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
                <input className="input" value={document} onChange={(e) => setDocument(maskDocument(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">E-mail</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label">Tenant</label>
              <input
                className="input"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Nome do tenant (criado se não existir)"
                list="tenant-options"
              />
              <datalist id="tenant-options">
                {tenants.map((t) => <option key={t.id} value={t.name} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea className="input min-h-[80px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#3f3f46]">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
              <button type="submit" className="btn-primary">{editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
