import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tag } from '../lib/types';
import { hexToRgba } from '../lib/tagColor';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
}

// Seletor de tags: mostra as selecionadas como chips removíveis, sugere tags
// já cadastradas no catálogo (reuso) e permite criar uma tag nova na hora —
// que fica salva no catálogo para os próximos atendimentos.
export default function TagPicker({ value, onChange }: Props) {
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from('tags').select('*').order('name').then(({ data }) => setCatalog(data ?? []));
  }, []);

  const selectedLower = useMemo(() => new Set(value.map((t) => t.toLowerCase())), [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((t) => !selectedLower.has(t.name.toLowerCase()))
      .filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [catalog, query, selectedLower]);

  const trimmedQuery = query.trim();
  const exactMatch = catalog.some((t) => t.name.toLowerCase() === trimmedQuery.toLowerCase());
  const canCreate = trimmedQuery.length > 0 && !exactMatch && !selectedLower.has(trimmedQuery.toLowerCase());

  function addTag(name: string) {
    const n = name.trim();
    if (!n || selectedLower.has(n.toLowerCase())) return;
    onChange([...value, n]);
    setQuery('');
    setOpen(false);
  }

  function removeTag(name: string) {
    onChange(value.filter((t) => t !== name));
  }

  async function createAndAdd(name: string) {
    const n = name.trim();
    if (!n) return;
    const { data } = await supabase.from('tags').insert({ name: n }).select('id').single();
    if (data) setCatalog((prev) => [...prev, { id: data.id, name: n, color: '#EF4444' }]);
    addTag(n);
  }

  return (
    <div className="relative">
      <div className="input flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5">
        {value.map((t) => {
          const color = catalog.find((c) => c.name === t)?.color || '#EF4444';
          return (
            <span
              key={t}
              className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
              style={{ background: hexToRgba(color, 0.15), color, borderColor: hexToRgba(color, 0.3) }}
            >
              {t}
              <button type="button" onClick={() => removeTag(t)} className="opacity-80 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-[#71717a]"
          placeholder={value.length ? '' : 'Adicionar tag...'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (suggestions[0]) addTag(suggestions[0].name);
              else if (canCreate) createAndAdd(query);
            }
          }}
        />
      </div>
      {open && (suggestions.length > 0 || canCreate) && (
        <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-[#3f3f46] bg-[#18181b] shadow-lg">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(t.name); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#ffffff] hover:bg-white/5"
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); createAndAdd(query); }}
              className="block w-full border-t border-[#3f3f46] px-3 py-2 text-left text-sm text-[#f87171] hover:bg-white/5"
            >
              + Criar tag "{trimmedQuery}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
