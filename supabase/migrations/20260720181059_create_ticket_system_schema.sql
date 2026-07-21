/*
# Sistema de Registro de Tickets - Schema Completo

## Visão Geral
Cria o schema para um sistema de atendimento/helpdesk com tickets, empresas, contatos, atendentes, notas de tickets, logs de sistema e conexões de API externas (Claude, LINEA, etc).

## Novas Tabelas

1. `companies` (Empresas)
   - id (uuid, PK)
   - name (text, nome da empresa)
   - document (text, CNPJ/CPF)
   - email (text)
   - phone (text)
   - notes (text)
   - created_at, updated_at

2. `contacts` (Contatos)
   - id (uuid, PK)
   - company_id (FK -> companies)
   - name, email, phone, position, notes
   - created_at, updated_at

3. `attendants` (Atendentes)
   - id (uuid, PK)
   - name, email, phone, role, department, active
   - created_at, updated_at

4. `tickets` (Tickets de atendimento)
   - id (uuid, PK)
   - subject (assunto)
   - description (descrição)
   - status (novo, em_andamento, aguardando, resolvido, fechado)
   - priority (baixa, media, alta, urgente)
   - channel (telefone, email, chat, presencial, api)
   - company_id (FK -> companies, opcional)
   - contact_id (FK -> contacts, opcional)
   - attendant_id (FK -> attendents, opcional)
   - due_date (data limite)
   - tags (text[])
   - created_at, updated_at, closed_at

5. `ticket_notes` (Notas/interações do ticket)
   - id (uuid, PK)
   - ticket_id (FK -> tickets)
   - attendant_id (FK -> attendents)
   - note (texto da interação)
   - is_internal (boolean, nota interna)
   - created_at

6. `system_logs` (Registro de sistema / auditoria)
   - id (uuid, PK)
   - action (create, update, delete, sync, login)
   - entity (ticket, contact, company, etc)
   - entity_id (uuid)
   - details (jsonb)
   - created_at

7. `api_connections` (Conexões de API externas)
   - id (uuid, PK)
   - name (nome da integração)
   - type (claude, linea, custom, etc)
   - endpoint (URL)
   - api_key_ref (referência/label da chave, não o valor)
   - status (active, inactive, error)
   - last_sync_at
   - config (jsonb)
   - created_at, updated_at

## Segurança
- RLS habilitado em todas as tabelas.
- App single-tenant sem login: políticas TO anon, authenticated com USING (true) pois dados são compartilhados localmente.
- Índices criados para colunas de busca frequente.
*/

-- Empresas
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text,
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_companies" ON companies;
CREATE POLICY "anon_select_companies" ON companies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_companies" ON companies;
CREATE POLICY "anon_insert_companies" ON companies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_companies" ON companies;
CREATE POLICY "anon_update_companies" ON companies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_companies" ON companies;
CREATE POLICY "anon_delete_companies" ON companies FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);
CREATE INDEX IF NOT EXISTS idx_companies_document ON companies (document);

-- Contatos
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  position text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_contacts" ON contacts;
CREATE POLICY "anon_select_contacts" ON contacts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_contacts" ON contacts;
CREATE POLICY "anon_insert_contacts" ON contacts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_contacts" ON contacts;
CREATE POLICY "anon_update_contacts" ON contacts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_contacts" ON contacts;
CREATE POLICY "anon_delete_contacts" ON contacts FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts (company_id);

-- Atendentes
CREATE TABLE IF NOT EXISTS attendants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'Atendente',
  department text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE attendants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_attendants" ON attendants;
CREATE POLICY "anon_select_attendants" ON attendants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_attendants" ON attendants;
CREATE POLICY "anon_insert_attendants" ON attendants FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_attendants" ON attendants;
CREATE POLICY "anon_update_attendants" ON attendants FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_attendants" ON attendants;
CREATE POLICY "anon_delete_attendants" ON attendants FOR DELETE TO anon, authenticated USING (true);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number serial,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'novo',
  priority text NOT NULL DEFAULT 'media',
  channel text NOT NULL DEFAULT 'telefone',
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  attendant_id uuid REFERENCES attendants(id) ON DELETE SET NULL,
  due_date timestamptz,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  closed_at timestamptz
);
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_tickets" ON tickets;
CREATE POLICY "anon_select_tickets" ON tickets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tickets" ON tickets;
CREATE POLICY "anon_insert_tickets" ON tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tickets" ON tickets;
CREATE POLICY "anon_update_tickets" ON tickets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tickets" ON tickets;
CREATE POLICY "anon_delete_tickets" ON tickets FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);
CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets (company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON tickets (contact_id);
CREATE INDEX IF NOT EXISTS idx_tickets_attendant ON tickets (attendant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets (created_at);

-- Notas dos tickets
CREATE TABLE IF NOT EXISTS ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  attendant_id uuid REFERENCES attendants(id) ON DELETE SET NULL,
  note text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ticket_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_ticket_notes" ON ticket_notes;
CREATE POLICY "anon_select_ticket_notes" ON ticket_notes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ticket_notes" ON ticket_notes;
CREATE POLICY "anon_insert_ticket_notes" ON ticket_notes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ticket_notes" ON ticket_notes;
CREATE POLICY "anon_update_ticket_notes" ON ticket_notes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ticket_notes" ON ticket_notes;
CREATE POLICY "anon_delete_ticket_notes" ON ticket_notes FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes (ticket_id);

-- Logs do sistema
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_system_logs" ON system_logs;
CREATE POLICY "anon_select_system_logs" ON system_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_system_logs" ON system_logs;
CREATE POLICY "anon_insert_system_logs" ON system_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_system_logs_entity ON system_logs (entity);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs (created_at);

-- Conexões de API
CREATE TABLE IF NOT EXISTS api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'custom',
  endpoint text,
  api_key_ref text,
  status text NOT NULL DEFAULT 'inactive',
  last_sync_at timestamptz,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_api_connections" ON api_connections;
CREATE POLICY "anon_select_api_connections" ON api_connections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_api_connections" ON api_connections;
CREATE POLICY "anon_insert_api_connections" ON api_connections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_api_connections" ON api_connections;
CREATE POLICY "anon_update_api_connections" ON api_connections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_api_connections" ON api_connections;
CREATE POLICY "anon_delete_api_connections" ON api_connections FOR DELETE TO anon, authenticated USING (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated ON companies;
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated ON contacts;
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_attendants_updated ON attendants;
CREATE TRIGGER trg_attendants_updated BEFORE UPDATE ON attendants FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tickets_updated ON tickets;
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_api_connections_updated ON api_connections;
CREATE TRIGGER trg_api_connections_updated BEFORE UPDATE ON api_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
