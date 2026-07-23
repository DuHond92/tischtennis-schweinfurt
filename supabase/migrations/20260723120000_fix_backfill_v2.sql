-- ── Fix: backfill_enriched_names_to_tables v2 ────────────────────────────────
--
-- Die erste Version (20260723110000) wurde mit fehlerhafter Logik eingespielt:
--   - NOT IN statt Positivliste
--   - IS NULL ohne Namenseinschränkung → echte Namen wären überschreibbar
--   - GRANT TO authenticated → Sicherheitslücke (war bereits durch 20260723100000
--     behoben, wurde aber durch CREATE OR REPLACE erneut gesetzt)
--
-- Diese Migration ersetzt die Funktion durch die geprüfte v2-Implementierung.

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
       -- Nur echte Anreicherungs-Quellen als Ziel (kein fallback als neuer Wert)
       AND tc.enriched_name_source IN (
             'osm_park','osm_playground','osm_school','osm_kindergarten',
             'osm_sports','osm_pool','osm_camping','osm_recreation',
             'osm_square','osm_cemetery',
             'osm_street','osm_street_extended','osm_suburb',
             'osm_addr_street','osm_addr_city','enriched'
           )
       -- Positivliste: nur Zeilen mit bekannter automatisch erzeugter Quelle
       AND (
             t.name_source IN (
               'osm_park','osm_playground','osm_school','osm_kindergarten',
               'osm_sports','osm_pool','osm_camping','osm_recreation',
               'osm_square','osm_cemetery',
               'osm_street','osm_street_extended','osm_suburb',
               'osm_addr_street','osm_addr_city','fallback','enriched'
             )
             -- Legacy: name_source NULL + nachweislich generischer Systemname
             OR (
               t.name_source IS NULL
               AND (
                 t.name = 'Tischtennisplatte'
                 OR t.name ~ '^Tischtennisplatte #[0-9]+$'
               )
             )
           )
    RETURNING 1
  )
  SELECT count(*)::integer FROM updated;
$$;

-- Kein GRANT — nur Datenbankbesitzer (postgres) darf diese Funktion aufrufen.
-- Aufruf ausschließlich im SQL-Editor oder via npx supabase db query --linked.
REVOKE EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.backfill_enriched_names_to_tables() IS
  'v2: Positivliste überschreibbarer Quellen statt NOT IN. '
  'NULL-Ast: ausschließlich Systemnamen ''Tischtennisplatte'' / ''Tischtennisplatte #N''. '
  '69 echte Namen mit name_source IS NULL bleiben unberührt. '
  'Nur über Datenbankbesitzer (postgres) aufrufbar — kein GRANT an Rollen.';
