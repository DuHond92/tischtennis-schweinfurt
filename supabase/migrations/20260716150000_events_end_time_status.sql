-- events: end_time + status für präzise Spielzustandsberechnung.
--
-- Priorität in isEventCompleted / getGameDisplayStatus:
--   1. status (explizit gesetzt: 'completed' | 'cancelled')
--   2. end_time (vom Ersteller eingetragene Endzeit)
--   3. Fallback: 3h nach Startzeit

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_time   time,
  ADD COLUMN IF NOT EXISTS status     text
    CHECK (status IS NULL OR status IN ('active', 'cancelled', 'completed'));

-- Ersteller darf end_time und status auf eigenen Events setzen
DROP POLICY IF EXISTS "Creators can update own event status" ON public.events;
CREATE POLICY "Creators can update own event status"
  ON public.events FOR UPDATE
  USING  (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);
