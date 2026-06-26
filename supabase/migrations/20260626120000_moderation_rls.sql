-- ════════════════════════════════════════════════════════════════════════
-- Mod-Delete-Policies für bestehende Tabellen + moderation_log
-- Idempotent: sicher mehrfach ausführbar.
-- ════════════════════════════════════════════════════════════════════════

-- ── table_images: Mod darf freigegebene Bilder löschen ───────────────

DROP POLICY IF EXISTS "table_images_delete_mod" ON public.table_images;
CREATE POLICY "table_images_delete_mod"
  ON public.table_images FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- ── comments: Eigener Kommentar + Mod darf löschen ───────────────────

ALTER TABLE IF EXISTS public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_mod" ON public.comments;
CREATE POLICY "comments_delete_mod"
  ON public.comments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- ── event_messages: Eigene Nachricht + Mod darf löschen ──────────────

ALTER TABLE IF EXISTS public.event_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_messages_delete_own" ON public.event_messages;
CREATE POLICY "event_messages_delete_own"
  ON public.event_messages FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_messages_delete_mod" ON public.event_messages;
CREATE POLICY "event_messages_delete_mod"
  ON public.event_messages FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- ── direct_messages: Sender + Mod darf löschen ───────────────────────

DROP POLICY IF EXISTS "dm_delete" ON public.direct_messages;
CREATE POLICY "dm_delete"
  ON public.direct_messages FOR DELETE
  USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- ── events: Ersteller + Mod darf löschen ─────────────────────────────

ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_delete_own" ON public.events;
CREATE POLICY "events_delete_own"
  ON public.events FOR DELETE
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "events_delete_mod" ON public.events;
CREATE POLICY "events_delete_mod"
  ON public.events FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- ── moderation_log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.moderation_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  mod_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       text        NOT NULL,
  content_type text        NOT NULL,
  content_id   text        NOT NULL,
  details      jsonb,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_moderation_log_created
  ON public.moderation_log (created_at DESC);

DROP POLICY IF EXISTS "modlog_select" ON public.moderation_log;
CREATE POLICY "modlog_select"
  ON public.moderation_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

DROP POLICY IF EXISTS "modlog_insert" ON public.moderation_log;
CREATE POLICY "modlog_insert"
  ON public.moderation_log FOR INSERT
  WITH CHECK (
    auth.uid() = mod_id
    AND EXISTS (SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
