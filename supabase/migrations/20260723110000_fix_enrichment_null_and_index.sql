-- ── Bugfix: h2+m7 NULL-Semantik in backfill_enriched_names_to_tables ─────────
-- NOT IN schließt NULL-Zeilen aus (SQL NULL != NOT IN → NULL). Zeilen mit
-- t.name_source IS NULL wurden bisher nie aktualisiert.
-- Fix: IS NULL-Check explizit hinzufügen.

CREATE OR REPLACE FUNCTION public.backfill_enriched_names_to_tables()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.tables t
       SET name        = tc.enriched_display_name,
           name_source = tc.enriched_name_source
      FROM public.table_candidates tc
     WHERE t.id        = tc.matched_table_id
       AND tc.enriched_display_name IS NOT NULL
       AND tc.enriched_name_source NOT IN ('fallback')
       AND (
             t.name_source IS NULL
             OR t.name_source NOT IN (
                  'osm_name', 'osm_name_de', 'osm_operator', 'admin_input'
                )
           )
    RETURNING 1
  )
  SELECT count(*)::integer FROM updated;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables() FROM anon;
GRANT  EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables() TO authenticated;

COMMENT ON FUNCTION public.backfill_enriched_names_to_tables() IS
  'Aktualisiert public.tables.name für bereits promovierte Kandidaten mit '
  'enriched_display_name, sofern name_source kein echter/manueller Name ist '
  '(inkl. NULL-Zeilen). Sicher: osm_name, osm_name_de, osm_operator, admin_input '
  'werden nie überschrieben.';


-- ── Bugfix: l1 pg_trgm Index für ILIKE-Suche in list_candidates_for_review ──
-- Führende % in ILIKE '%...' verhindern B-Tree-Indexnutzung.
-- GIN-Trigram-Index ermöglicht Indexsuche für beliebige Substring-Anfragen.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_table_candidates_name_trgm
  ON public.table_candidates USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_table_candidates_ext_id_trgm
  ON public.table_candidates USING gin (external_id gin_trgm_ops);
