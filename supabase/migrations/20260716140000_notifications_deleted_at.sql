-- notifications: deleted_at-Spalte für Soft-Delete.
--
-- Trennt "gelesen" (read_at) von "gelöscht" (deleted_at):
--   • read_at gesetzt  → Benachrichtigung ist gelesen, bleibt im Verlauf sichtbar
--   • deleted_at gesetzt → aus dem Verlauf entfernt (kein Client-Zugriff mehr)
--
-- RLS-Policy erlaubt dem jeweiligen User, deleted_at auf seinen eigenen Notifs zu setzen.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index für schnelle Abfragen (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS notifications_deleted_at_idx
  ON public.notifications (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- RLS-Policy: User darf nur deleted_at auf eigenen Notifs setzen
-- (read_at bleibt über bestehende Policy abgedeckt)
DROP POLICY IF EXISTS "Users can soft-delete own notifications" ON public.notifications;
CREATE POLICY "Users can soft-delete own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
