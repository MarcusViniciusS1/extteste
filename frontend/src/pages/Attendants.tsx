import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, UserCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Attendant } from '../lib/types';
import Modal from '../components/Modal';
import { maskPhone } from '../lib/masks';
import { getCurrentAttendantId } from '../lib/currentAttendant';
import { confirmDialog } from '../lib/confirm';
import { toast } from '../lib/toast';

export default function Attendants() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Attendant | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Atendente');
  const [department, setDepartment] = useState('');
  const [active, setActive] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('attendants').select('*').order('name');
    setAttendants(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setName(''); setEmail(''); setPhone(''); setRole('Atendente'); setDepartment(''); setActive(true);
    setShowForm(true);
  }
  function openEdit(a: Attendant) {
    setEditing(a);
    setName(a.name); setEmail(a.email ?? ''); setPhone(maskPhone(a.phone ?? '')); setRole(a.role ?? 'Atendente'); setDepartment(a.department ?? ''); setActive(a.active ?? true);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      await supabase.from('attendants').update({
        name: name.trim(), email: email.trim() || null, phone: phone.trim() || null,
        role: role.trim() || null, department: department.trim() || null, active,
      }).eq('id', editing.id);
    } else {
      const { data } = await supabase.from('attendants').insert({
        name: name.trim(), email: email.trim() || null, phone: phone.trim() || null,
        role: role.trim() || null, department: department.trim() || null, active,
      }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'create', entity: 'attendant', entity_id: data.id, details: { name: name.trim() } });
    }
    toast.success(editing ? 'Atendente atualizado.' : 'Atendente criado.');
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog('Excluir este atendente?'))) return;
    await supabase.from('attendants').delete().eq('id', id);
    await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'delete', entity: 'attendant', entity_id: id });
    toast.success('Atendente excluído.');
    await load();
  }

  async function toggleActive(a: Attendant) {
    await supabase.from('attendants').update({ active: !a.active }).eq('id', a.id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atendentes</h1>
          <p className="text-sm text-[#a1a1aa]">{attendants.length} atendentes cadastrados</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo Atendente</button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-sm text-[#a1a1aa]">Carregando...</div>
        ) : attendants.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <UserCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#a1a1aa]">Nenhum atendente cadastrado.</p>
          </div>
        ) : attendants.map((a) => (
          <div key={a.id} className="card card-hover p-5 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-base font-bold text-white">
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold">{a.name}</h3>
                  <p className="text-xs text-[#a1a1aa]">{a.role ?? 'Atendente'}{a.department ? ` · ${a.department}` : ''}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(a)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(a.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-[#d4d4d8]">
              {a.email && <p className="truncate">{a.email}</p>}
              {a.phone && <p>{maskPhone(a.phone)}</p>}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => toggleActive(a)} className={`badge cursor-pointer ${a.active ? 'bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30' : 'bg-white/5 text-[#a1a1aa] border border-white/10'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${a.active ? 'bg-[#4ade80]' : 'bg-[#71717a]'} ${a.active ? 'animate-pulse-soft' : ''}`} />
                {a.active ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar Atendente' : 'Novo Atendente'} onClose={() => setShowForm(false)}>
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
                <input className="input" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cargo</label>
                <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
              <div>
                <label className="label">Departamento</label>
                <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#d4d4d8]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#ef4444]" /> Ativo
            </label>
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
