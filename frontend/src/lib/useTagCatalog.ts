import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Tag } from './types';

// Catálogo de tags (nome -> cor) compartilhado por qualquer tela que precise
// exibir chips com a cor real cadastrada (em vez de um cinza translúcido fixo).
export function useTagCatalog(): Tag[] {
  const [catalog, setCatalog] = useState<Tag[]>([]);
  useEffect(() => {
    supabase.from('tags').select('*').order('name').then(({ data }) => setCatalog(data ?? []));
  }, []);
  return catalog;
}
