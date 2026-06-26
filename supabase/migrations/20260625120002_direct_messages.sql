-- ════════════════════════════════════════════════════════════════════════
-- direct_messages — Baseline
-- Direktnachrichten zwischen Spielpartnern.
-- Vollständig idempotent: sicher auch wenn die Tabelle schon existiert.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     text        NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Index für schnelle Konversationsabfragen (beide Richtungen)
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON public.direct_messages (sender_id, receiver_id, created_at);

CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
  ON public.direct_messages (receiver_id, read_at)
  WHERE read_at IS NULL;

-- Sender und Empfänger dürfen ihre eigenen Nachrichten lesen
DROP POLICY IF EXISTS "dm_select" ON public.direct_messages;
CREATE POLICY "dm_select"
  ON public.direct_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Nur eingeloggte Nutzer dürfen als sender_id = sich selbst senden
DROP POLICY IF EXISTS "dm_insert" ON public.direct_messages;
CREATE POLICY "dm_insert"
  ON public.direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND auth.uid() IS NOT NULL);

-- Nur der Empfänger darf read_at setzen
DROP POLICY IF EXISTS "dm_update_read" ON public.direct_messages;
CREATE POLICY "dm_update_read"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- Eigene gesendete Nachrichten löschen erlaubt
DROP POLICY IF EXISTS "dm_delete" ON public.direct_messages;
CREATE POLICY "dm_delete"
  ON public.direct_messages FOR DELETE
  USING (auth.uid() = sender_id);
