/*
# Notificações internas + vínculo com o Linear (versão pt-br, banco local)

## Contexto
Integração com o Linear (linear.app, controle de issues/sugestões): quando
uma sugestão/solicitação vinculada a um ticket recebe retorno no Linear (a
issue muda de status), o ATENDENTE que criou/está responsável pelo ticket
deve ser avisado DENTRO do próprio sistema (sino de notificações) — ele então
avisa o cliente específico manualmente.

## O que faz
1. Adiciona `linear_issue_id`/`linear_issue_url` em `tickets`, para vincular
   manualmente um ticket a uma issue do Linear (colados pelo atendente).
2. Cria a tabela `notificacoes` (id, atendente_id, ticket_id, mensagem, lida,
   criado_em) — cada linha é um aviso para um atendente específico.
3. `POST /api/linear/webhook` (backend/index.js) recebe o evento do Linear
   quando a issue muda de status, encontra o ticket pelo `linear_issue_id` e
   cria uma notificação para o `atendente_id` daquele ticket.

## Atenção — integração ainda não é ponta-a-ponta
O Linear avisa mudanças de status via WEBHOOK, que exige uma URL pública
HTTPS. Este backend hoje roda em localhost:3001, então o webhook não é
alcançável pelo Linear ainda. Esta migração + a rota do backend deixam a
integração PRONTA PARA LIGAR assim que houver uma URL pública (deploy ou
túnel) e uma API key/signing secret do Linear.
*/

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linear_issue_id text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linear_issue_url text;
CREATE INDEX IF NOT EXISTS idx_tickets_linear_issue ON tickets (linear_issue_id);

CREATE TABLE IF NOT EXISTS notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendente_id uuid REFERENCES atendentes(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  mensagem text NOT NULL,
  lida boolean DEFAULT false,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_notificacoes" ON notificacoes;
CREATE POLICY "anon_all_notificacoes" ON notificacoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_notificacoes_atendente ON notificacoes (atendente_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes (lida);
