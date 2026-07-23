/*
# Catálogo de tags reutilizáveis (schema em inglês / Supabase)

## O que faz
1. Cria a tabela `tags` (id, name ÚNICO, created_at).
2. Semeia algumas tags padrão.

Equivalente em inglês de 20260722000000_add_etiquetas_pt_br_local.sql.
`tickets.tags` continua um `text[]` com os nomes das tags do ticket; esta
tabela é só o catálogo reutilizável.

Pré-requisitos: rodar depois de 20260720181059_create_ticket_system_schema.sql.
*/

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_tags" ON tags;
CREATE POLICY "anon_all_tags" ON tags FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

INSERT INTO tags (name) VALUES
  ('Suporte'),
  ('Financeiro'),
  ('Cliente VIP'),
  ('Dúvida'),
  ('Bug'),
  ('Sugestão'),
  ('Cancelamento')
ON CONFLICT (name) DO NOTHING;
