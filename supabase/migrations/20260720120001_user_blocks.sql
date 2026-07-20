-- ════════════════════════════════════════════════════════════════════════
-- user_blocks — gegenseitige Account-Blockierungen
-- Idempotent: sicher mehrfach ausführbar.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_unique   UNIQUE (blocker_id, blocked_id)
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks (blocked_id);

-- RLS aktivieren
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- SELECT: Nutzer darf nur eigene Blockierungen lesen
DROP POLICY IF EXISTS "blocks_select" ON public.user_blocks;
CREATE POLICY "blocks_select"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- INSERT: Nur mit blocker_id = eigenem Account
DROP POLICY IF EXISTS "blocks_insert" ON public.user_blocks;
CREATE POLICY "blocks_insert"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND auth.uid() IS NOT NULL);

-- DELETE: Nur eigene Blockierungen aufheben
DROP POLICY IF EXISTS "blocks_delete" ON public.user_blocks;
CREATE POLICY "blocks_delete"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- UPDATE: nicht erlaubt (keine Policy = kein Zugriff)

-- ── Serverseitige Schutz-Funktionen ────────────────────────────────────

-- Prüft bidirektional: ist zwischen uid_a und uid_b eine Blockierung aktiv?
-- SECURITY DEFINER: läuft mit Superuser-Rechten, damit beide Richtungen
-- geprüft werden können, ohne eigene Blockierungen des anderen zu lesen.
CREATE OR REPLACE FUNCTION public.are_users_blocked(uid_a uuid, uid_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = uid_a AND blocked_id = uid_b)
       OR (blocker_id = uid_b AND blocked_id = uid_a)
  );
$$;

-- ── RLS-Hardening für direct_messages ──────────────────────────────────
-- Verhindert serverseitig neue DMs zwischen blockierten Accounts.
-- Ersetzt die bestehende dm_insert-Policy.

DROP POLICY IF EXISTS "dm_insert" ON public.direct_messages;
CREATE POLICY "dm_insert"
  ON public.direct_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IS NOT NULL
    AND NOT public.are_users_blocked(auth.uid(), receiver_id)
  );

-- ── RLS-Hardening für player_connections ───────────────────────────────
-- Verhindert neue Spielpartner-Anfragen zwischen blockierten Accounts.

ALTER TABLE public.player_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connections_insert" ON public.player_connections;
CREATE POLICY "connections_insert"
  ON public.player_connections FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND auth.uid() IS NOT NULL
    AND NOT public.are_users_blocked(auth.uid(), receiver_id)
  );

-- Bestehende SELECT-Policy wiederherstellen (war ggf. noch nicht vorhanden)
DROP POLICY IF EXISTS "connections_select" ON public.player_connections;
CREATE POLICY "connections_select"
  ON public.player_connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "connections_update" ON public.player_connections;
CREATE POLICY "connections_update"
  ON public.player_connections FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "connections_delete" ON public.player_connections;
CREATE POLICY "connections_delete"
  ON public.player_connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- ── RLS-Hardening für event_participants ───────────────────────────────
-- Verhindert Beitreten zu Spielen eines blockierten Hosts.

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select" ON public.event_participants;
CREATE POLICY "participants_select"
  ON public.event_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "participants_insert" ON public.event_participants;
CREATE POLICY "participants_insert"
  ON public.event_participants FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() IS NOT NULL
    AND NOT public.are_users_blocked(
      auth.uid(),
      (SELECT creator_id FROM public.events WHERE id = event_id)
    )
  );

DROP POLICY IF EXISTS "participants_delete" ON public.event_participants;
CREATE POLICY "participants_delete"
  ON public.event_participants FOR DELETE
  USING (auth.uid() = user_id);

-- ── event_messages: keine neuen Kommentare zwischen blockierten Accounts ─

ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_messages_select" ON public.event_messages;
CREATE POLICY "event_messages_select"
  ON public.event_messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "event_messages_insert" ON public.event_messages;
CREATE POLICY "event_messages_insert"
  ON public.event_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() IS NOT NULL
    AND NOT public.are_users_blocked(
      auth.uid(),
      (SELECT creator_id FROM public.events WHERE id = event_id)
    )
  );

DROP POLICY IF EXISTS "event_messages_delete" ON public.event_messages;
CREATE POLICY "event_messages_delete"
  ON public.event_messages FOR DELETE
  USING (auth.uid() = user_id);
