-- ── Analytics Events ──────────────────────────────────────────────────────────
-- Interne Nutzungsanalyse — kein externes Tracking, kein Werbe-SDK.
-- Sensible Felder (E-Mail, Namen, Texte, Koordinaten etc.) werden niemals
-- in properties gespeichert — das wird client-seitig durch sanitizeProps()
-- erzwungen. user_id wird bei Account-Löschung automatisch auf NULL gesetzt
-- (ON DELETE SET NULL).

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  text,
  event_name  text        NOT NULL,
  screen      text,
  platform    text,
  app_version text,
  properties  jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Indizes
CREATE INDEX IF NOT EXISTS ae_created_at_idx  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ae_event_name_idx  ON public.analytics_events (event_name);
CREATE INDEX IF NOT EXISTS ae_user_id_idx     ON public.analytics_events (user_id);
CREATE INDEX IF NOT EXISTS ae_name_ts_idx     ON public.analytics_events (event_name, created_at DESC);

-- RLS aktivieren
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Eingeloggte Nutzer dürfen INSERT (eigene Events)
CREATE POLICY "authenticated_insert" ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Anonyme Nutzer dürfen INSERT (app_open / pre-login Events) — user_id muss NULL sein
CREATE POLICY "anon_insert" ON public.analytics_events
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Keine SELECT-Policy für normale Nutzer — nur Service Role kann lesen
-- (Auswertung via Supabase Dashboard SQL-Editor oder Service-Key)
