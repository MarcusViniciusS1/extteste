import { useEffect, useState } from 'react';
import { Tag as TagIcon, Plus, Trash2, Pencil, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tag } from '../lib/types';
import Modal from '../components/Modal';
import { getCurrentAttendantId } from '../lib/currentAttendant';
import { confirmDialog } from '../lib/confirm';
import { toast } from '../lib/toast';

const PALETTE = ['#ef4444', '#dc2626', '#f59e0b', '#ef4444', '#a855f7', '#f87171', '#22c55e', '#71717a'];

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ef4444');
  const [description, setDescription] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('tags').select('*').order('name');
    setTags(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setName(''); setColor('#ef4444'); setDescription('');
    setShowForm(true);
  }
  function openEdit(t: Tag) {
    setEditing(t);
    setName(t.name); setColor(t.color); setDescription(t.description ?? '');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Mantém a grafia digitada (mesmo padrão do TagPicker) — nada de
    // minúsculas/underscore, para não divergir das tags padrão (ex.: "Cliente VIP").
    const cleanName = name.trim();
    if (editing) {
      await supabase.from('tags').update({ name: cleanName, color, description: description.trim() || null }).eq('id', editing.id);
    } else {
      const { data } = await supabase.from('tags').insert({ name: cleanName, color, description: description.trim() || null, is_preset: false }).select('id').single();
      if (data) await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'create', entity: 'tag', entity_id: data.id, details: { name: cleanName } });
    }
    toast.success(editing ? 'Tag atualizada.' : 'Tag criada.');
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog('Excluir esta tag?'))) return;
    await supabase.from('tags').delete().eq('id', id);
    await supabase.from('system_logs').insert({ attendant_id: getCurrentAttendantId() || null, action: 'delete', entity: 'tag', entity_id: id });
    toast.success('Tag excluída.');
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tags Padronizadas</h1>
          <p className="text-sm text-[#a1a1aa]">{tags.length} tags · {tags.filter((t) => t.is_preset).length} de exemplo</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova Tag</button>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3 rounded-lg bg-[#ef4444]/5 p-3 text-xs text-[#a1a1aa]">
          <Star className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#f87171]" />
          <p>Tags de exemplo (marcadas com estrela) são pré-cadastradas para reutilização. Crie novas tags para padronizar a filtragem de tickets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-16 text-center text-sm text-[#a1a1aa]">Carregando...</div>
        ) : tags.length === 0 ? (
          <div className="col-span-full py-16 text-center">
            <TagIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm text-[#a1a1aa]">Nenhuma tag cadastrada.</p>
          </div>
        ) : tags.map((t) => (
          <div key={t.id} className="card card-hover p-4 group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg" style={{ background: `${t.color}25`, border: `1px solid ${t.color}40` }} />
                <div>
                  <div className="flex items-center gap-1.5">
                    {t.is_preset && <Star className="h-3.5 w-3.5 text-[#fbbf24]" />}
                    <h3 className="font-semibold">{t.name}</h3>
                  </div>
                  {t.description && <p className="text-xs text-[#a1a1aa]">{t.description}</p>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => openEdit(t)} className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(t.id)} className="btn-ghost p-1.5 text-[#f87171] hover:bg-[#ef4444]/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar Tag' : 'Nova Tag'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: cliente_vip" autoFocus />
            </div>
            <div>
              <label className="label">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b]' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div>
              <label className="label">Descrição</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Uso da tag..." />
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
