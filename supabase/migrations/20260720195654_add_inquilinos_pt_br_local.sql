/*
# Adiciona Inquilino (Tenant) — versão em português, banco local

## O que faz
1. Cria a tabela `inquilinos` (id, nome, slug, criado_em, atualizado_em).
2. Adiciona a coluna `inquilino_id` em `empresas`, referenciando `inquilinos(id)`.
3. Índice para busca por inquilino.

Pré-requisitos: rodar depois de 20260720194725_schema_pt_br_local.sql
(precisa das roles anon/authenticated e da função atualizar_atualizado_em()
já existentes nesse banco).

Por enquanto o inquilino fica só em `empresas`, igual combinado antes —
dá pra propagar pra `tickets`/`contatos` depois se precisar.
*/

CREATE TABLE IF NOT EXISTS inquilinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);
ALTER TABLE inquilinos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_inquilinos" ON inquilinos;
CREATE POLICY "anon_all_inquilinos" ON inquilinos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_inquilinos_atualizado ON inquilinos;
CREATE TRIGGER trg_inquilinos_atualizado BEFORE UPDATE ON inquilinos
  FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inquilino_id uuid REFERENCES inquilinos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_inquilino ON empresas (inquilino_id);
