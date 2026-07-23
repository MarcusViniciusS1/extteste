-- English schema equivalent of 20260723000200_add_company_tags_and_log_user_pt_br_local.sql

ALTER TABLE companies ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS attendant_id uuid REFERENCES attendants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_attendant ON system_logs (attendant_id);

UPDATE tags SET name = 'Bug' WHERE name = 'bug';
UPDATE tags SET name = 'Cancelamento' WHERE name = 'cancelamento';
UPDATE tags SET name = 'Dúvida' WHERE name = 'dúvida';

INSERT INTO tags (name, color, is_preset) VALUES
  ('Cliente Novo', '#22c55e', true)
ON CONFLICT (name) DO NOTHING;
