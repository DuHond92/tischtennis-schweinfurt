-- ════════════════════════════════════════════════════════════════════════
-- reports — Nutzer-Meldungen über Inhalte
-- Idempotent: sicher mehrfach ausführbar.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reports (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content_type text        NOT NULL,
  content_id   text        NOT NULL,
  reason       text        NOT NULL
               CHECK (reason IN ('spam', 'inappropriate', 'wrong_info', 'other')),
  preview      text,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  reviewed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports (status, created_at DESC);

-- Eingeloggte Nutzer dürfen Meldungen einreichen
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id AND auth.uid() IS NOT NULL);

-- Nur Mods/Admins dürfen Meldungen lesen
DROP POLICY IF EXISTS "reports_select" ON public.reports;
CREATE POLICY "reports_select"
  ON public.reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );

-- Nur Mods/Admins dürfen Status ändern
DROP POLICY IF EXISTS "reports_update" ON public.reports;
CREATE POLICY "reports_update"
  ON public.reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
