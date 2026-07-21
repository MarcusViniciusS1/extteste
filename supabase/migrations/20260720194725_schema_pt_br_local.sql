/*
# Schema em Português (uso local/dev no DBeaver)

## Contexto
Versão com nomes de tabelas e colunas em português, criada para o banco local
`zorte_tickets` (DBeaver). Isso é diferente do schema em inglês usado pelo
app React atual (que continua ligado ao Supabase, em
supabase/migrations/20260720181059_create_ticket_system_schema.sql).
Ou seja: enquanto o app não for adaptado para usar esses nomes em português,
esse banco local fica como ambiente de desenvolvimento/estudo separado.

## Tabelas
1. empresas (antes companies)
2. contatos (antes contacts)
3. atendentes (antes attendants)
4. tickets (nomes de coluna traduzidos)
5. notas_ticket (antes ticket_notes)
6. logs_sistema (antes system_logs)
7. conexoes_api (antes api_connections)

## Como rodar (recomendado, evita erro de "relação não existe")
Rode CADA bloco (CREATE TABLE) SOZINHO primeiro (selecione só ele e
Ctrl+Enter), clique em Commit, confirme em Tabelas que apareceu, e só então
rode o bloco de ALTER/POLICY/ÍNDICE daquela tabela. Repita por tabela.
*/

-- 1) EMPRESAS
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text,
  email text,
  telefone text,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- 2) CONTATOS
CREATE TABLE IF NOT EXISTS contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  email text,
  telefone text,
  cargo text,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- 3) ATENDENTES
CREATE TABLE IF NOT EXISTS atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  cargo text DEFAULT 'Atendente',
  departamento text,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- 4) TICKETS
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ticket serial,
  assunto text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'novo',
  prioridade text NOT NULL DEFAULT 'media',
  canal text NOT NULL DEFAULT 'telefone',
  empresa_id uuid REFERENCES empresas(id) ON DELETE SET NULL,
  contato_id uuid REFERENCES contatos(id) ON DELETE SET NULL,
  atendente_id uuid REFERENCES atendentes(id) ON DELETE SET NULL,
  data_limite timestamptz,
  tags text[] DEFAULT '{}',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  fechado_em timestamptz
);

-- 5) NOTAS DO TICKET
CREATE TABLE IF NOT EXISTS notas_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  atendente_id uuid REFERENCES atendentes(id) ON DELETE SET NULL,
  nota text NOT NULL,
  interna boolean DEFAULT false,
  criado_em timestamptz DEFAULT now()
);

-- 6) LOGS DO SISTEMA
CREATE TABLE IF NOT EXISTS logs_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao text NOT NULL,
  entidade text,
  entidade_id uuid,
  detalhes jsonb,
  criado_em timestamptz DEFAULT now()
);

-- 7) CONEXÕES DE API
CREATE TABLE IF NOT EXISTS conexoes_api (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'custom',
  endpoint text,
  referencia_chave_api text,
  status text NOT NULL DEFAULT 'inactive',
  ultima_sincronizacao timestamptz,
  configuracao jsonb DEFAULT '{}',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- =====================================================
-- RLS + POLÍTICAS + ÍNDICES (rodar depois que as 7 tabelas acima existirem)
-- =====================================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_empresas" ON empresas;
CREATE POLICY "anon_all_empresas" ON empresas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_empresas_nome ON empresas (nome);
CREATE INDEX IF NOT EXISTS idx_empresas_documento ON empresas (documento);

ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_contatos" ON contatos;
CREATE POLICY "anon_all_contatos" ON contatos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_contatos_nome ON contatos (nome);
CREATE INDEX IF NOT EXISTS idx_contatos_empresa ON contatos (empresa_id);

ALTER TABLE atendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_atendentes" ON atendentes;
CREATE POLICY "anon_all_atendentes" ON atendentes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_tickets" ON tickets;
CREATE POLICY "anon_all_tickets" ON tickets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_prioridade ON tickets (prioridade);
CREATE INDEX IF NOT EXISTS idx_tickets_empresa ON tickets (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contato ON tickets (contato_id);
CREATE INDEX IF NOT EXISTS idx_tickets_atendente ON tickets (atendente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_criado ON tickets (criado_em);

ALTER TABLE notas_ticket ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_notas_ticket" ON notas_ticket;
CREATE POLICY "anon_all_notas_ticket" ON notas_ticket FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_notas_ticket_ticket ON notas_ticket (ticket_id);

ALTER TABLE logs_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_logs_sistema" ON logs_sistema;
CREATE POLICY "anon_all_logs_sistema" ON logs_sistema FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_entidade ON logs_sistema (entidade);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_criado ON logs_sistema (criado_em);

ALTER TABLE conexoes_api ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_conexoes_api" ON conexoes_api;
CREATE POLICY "anon_all_conexoes_api" ON conexoes_api FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- TRIGGERS DE atualizado_em
-- =====================================================

CREATE OR REPLACE FUNCTION atualizar_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_atualizado ON empresas;
CREATE TRIGGER trg_empresas_atualizado BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

DROP TRIGGER IF EXISTS trg_contatos_atualizado ON contatos;
CREATE TRIGGER trg_contatos_atualizado BEFORE UPDATE ON contatos FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

DROP TRIGGER IF EXISTS trg_atendentes_atualizado ON atendentes;
CREATE TRIGGER trg_atendentes_atualizado BEFORE UPDATE ON atendentes FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

DROP TRIGGER IF EXISTS trg_tickets_atualizado ON tickets;
CREATE TRIGGER trg_tickets_atualizado BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();

DROP TRIGGER IF EXISTS trg_conexoes_api_atualizado ON conexoes_api;
CREATE TRIGGER trg_conexoes_api_atualizado BEFORE UPDATE ON conexoes_api FOR EACH ROW EXECUTE FUNCTION atualizar_atualizado_em();
