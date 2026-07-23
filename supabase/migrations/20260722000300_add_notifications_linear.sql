/*
# Notifications + Linear link (schema em inglês / Supabase)

Equivalente em inglês de 20260722000200_add_notifications_linear_pt_br_local.sql.
Ver aquele arquivo para o contexto completo (integração com o Linear.app +
sino de notificações para o atendente).
*/

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linear_issue_id text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linear_issue_url text;
CREATE INDEX IF NOT EXISTS idx_tickets_linear_issue ON tickets (linear_issue_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendant_id uuid REFERENCES attendants(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  message text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_notifications" ON notifications;
CREATE POLICY "anon_all_notifications" ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_notifications_attendant ON notifications (attendant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (read);
