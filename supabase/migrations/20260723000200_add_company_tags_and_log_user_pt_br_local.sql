-- Local pt-br: tags em empresas (para o selo automático "Cliente Novo"),
-- usuário responsável nos logs do sistema, e normalização de tags padrão
-- que ficaram com grafias divergentes (ex.: "bug" e "Bug" coexistindo).

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

ALTER TABLE logs_sistema ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES atendentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_logs_sistema_atendente ON logs_sistema (atendente_id);

-- Normaliza a grafia das tags padrão (mantém a primeira linha cadastrada,
-- só corrige o nome exibido).
UPDATE etiquetas SET nome = 'Bug' WHERE nome = 'bug';
UPDATE etiquetas SET nome = 'Cancelamento' WHERE nome = 'cancelamento';
UPDATE etiquetas SET nome = 'Dúvida' WHERE nome = 'dúvida';

INSERT INTO etiquetas (nome, cor, padrao) VALUES
  ('Cliente Novo', '#22c55e', true)
ON CONFLICT (nome) DO NOTHING;
