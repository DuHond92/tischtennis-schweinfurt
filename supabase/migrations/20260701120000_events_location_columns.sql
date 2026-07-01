-- ════════════════════════════════════════════════════════════════════════
-- events — Location-Spalten für Mitspieler-Gesuche
-- Idempotent: sicher auf einem DB-Stand wo Spalten schon existieren.
-- TODO (Zukunft): PostGIS/geography-Typ + GiST-Index für echte
--   DB-seitige Radius-Queries statt client-seitiger Haversine-Filterung.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lat              double precision,
  ADD COLUMN IF NOT EXISTS lng              double precision,
  ADD COLUMN IF NOT EXISTS location_label   text,
  ADD COLUMN IF NOT EXISTS search_radius_km integer DEFAULT 5;

-- ── Backfill: Koordinaten aus altem description-JSON in echte Spalten ──
-- Geht zeile für zeile durch Gesuche mit NULL-Koordinaten.
-- Ungültiges JSON wird pro Zeile abgefangen und übersprungen.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, description
    FROM public.events
    WHERE mode = 'player_search'
      AND description IS NOT NULL
      AND description != ''
      AND lat IS NULL
  LOOP
    BEGIN
      UPDATE public.events
      SET
        lat              = COALESCE(lat,              ((r.description::jsonb)->>'lat')::double precision),
        lng              = COALESCE(lng,              ((r.description::jsonb)->>'lng')::double precision),
        location_label   = COALESCE(location_label,   (r.description::jsonb)->>'location_label'),
        search_radius_km = COALESCE(search_radius_km, ((r.description::jsonb)->>'search_radius_km')::integer)
      WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      -- Ungültiges JSON oder Cast-Fehler: Zeile überspringen
      NULL;
    END;
  END LOOP;
END;
$$;
