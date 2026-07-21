-- Adiciona o campo "sistema" ao ticket (valores esperados: 'Z' = Zorte, 'L' = Linea).
-- Rodar no Postgres local (zorte_tickets).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sistema text;
