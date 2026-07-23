/*
# Catálogo de tags reutilizáveis — versão em português, banco local

## O que faz
1. Cria a tabela `etiquetas` (id, nome ÚNICO, criado_em).
2. Semeia algumas tags padrão, para já existir opções prontas no seletor.

## Contexto
`tickets.tags` continua sendo um `text[]` com os NOMES das tags aplicadas em
cada ticket (nada muda aí) — esta tabela é só o CATÁLOGO de tags disponíveis
para reutilização/autocomplete, evitando ter que redigitar a mesma tag em
cada atendimento. Reaproveita as rotas genéricas do backend (GET/POST/DELETE
/api/tags), sem precisar de rota dedicada.

Pré-requisitos: rodar depois de 20260720194725_schema_pt_br_local.sql
(precisa das roles anon/authenticated já existentes nesse banco).
*/

CREATE TABLE IF NOT EXISTS etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE etiquetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_etiquetas" ON etiquetas;
CREATE POLICY "anon_all_etiquetas" ON etiquetas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_etiquetas_nome ON etiquetas (nome);

INSERT INTO etiquetas (nome) VALUES
  ('Suporte'),
  ('Financeiro'),
  ('Cliente VIP'),
  ('Dúvida'),
  ('Bug'),
  ('Sugestão'),
  ('Cancelamento')
ON CONFLICT (nome) DO NOTHING;
