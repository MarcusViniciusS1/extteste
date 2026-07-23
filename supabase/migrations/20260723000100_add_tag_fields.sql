/*
# Campos extras no catálogo de tags (schema em inglês / Supabase)

Equivalente em inglês de 20260723000000_add_tag_fields_pt_br_local.sql.
*/

ALTER TABLE tags ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#2f7ff0';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_preset boolean NOT NULL DEFAULT false;

UPDATE tags SET is_preset = true, color = CASE name
  WHEN 'Suporte' THEN '#2f7ff0'
  WHEN 'Financeiro' THEN '#16b89a'
  WHEN 'Cliente VIP' THEN '#f59e0b'
  WHEN 'Dúvida' THEN '#5b9cf5'
  WHEN 'Bug' THEN '#ef4444'
  WHEN 'Sugestão' THEN '#a855f7'
  WHEN 'Cancelamento' THEN '#5a6a8a'
  ELSE color
END
WHERE name IN ('Suporte', 'Financeiro', 'Cliente VIP', 'Dúvida', 'Bug', 'Sugestão', 'Cancelamento');
