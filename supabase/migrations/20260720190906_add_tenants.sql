/*
# Adiciona suporte a Tenant (Empresa/Organização)

## Contexto
Antes de rodar este script, a tabela `companies` (e o restante do schema base)
já deve existir. Se estiver aplicando num banco novo/vazio, rode primeiro:
  supabase/migrations/20260720181059_create_ticket_system_schema.sql
e só então este arquivo.

## O que este script faz
1. Cria a tabela `tenants` (id, name, slug, created_at, updated_at).
2. Adiciona a coluna `tenant_id` em `companies`, referenciando `tenants(id)`.
3. Cria índice para busca por tenant.

## Observações
- Por enquanto o tenant fica só em `companies`. Se no futuro for necessário
  filtrar `tickets`, `contacts` etc. diretamente por tenant, dá para adicionar
  `tenant_id` nessas tabelas depois (elas já se relacionam com companies via
  `company_id`).
- RLS habilitado com policies abertas (anon/authenticated), seguindo o mesmo
  padrão do restante do schema (app single-tenant sem login).
*/

-- Tabela de tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tenants" ON tenants;
CREATE POLICY "anon_select_tenants" ON tenants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tenants" ON tenants;
CREATE POLICY "anon_insert_tenants" ON tenants FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tenants" ON tenants;
CREATE POLICY "anon_update_tenants" ON tenants FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tenants" ON tenants;
CREATE POLICY "anon_delete_tenants" ON tenants FOR DELETE TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS trg_tenants_updated ON tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vínculo em companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies (tenant_id);
