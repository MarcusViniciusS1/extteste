import { hexToRgba } from '../lib/tagColor';
import { Tag } from '../lib/types';

interface Props {
  name: string;
  catalog?: Tag[];
  className?: string;
}

// Chip de tag translúcido (mesmo padrão visual de StatusBadge/PriorityBadge):
// fundo com a cor da tag em baixa opacidade, texto e borda na cor cheia.
export default function TagBadge({ name, catalog, className }: Props) {
  const color = catalog?.find((t) => t.name === name)?.color || '#EF4444';
  return (
    <span
      className={`inline-flex items-center rounded px-2.5 py-1 text-[11px] font-medium leading-none border whitespace-nowrap ${className ?? ''}`}
      style={{ background: hexToRgba(color, 0.15), color, borderColor: hexToRgba(color, 0.3) }}
    >
      {name}
    </span>
  );
}
