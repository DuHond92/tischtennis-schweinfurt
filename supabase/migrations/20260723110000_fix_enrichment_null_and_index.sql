-- ══════════════════════════════════════════════════════════════════════════════
-- Vorschau: Diese Abfrage zeigt exakt die Zeilen, die backfill_enriched_names_to_tables()
-- aktualisieren würde. Vor dem Aufruf der Funktion im SQL-Editor ausführen.
--
-- SELECT
--   t.id,
--   t.name               AS aktueller_name,
--   t.name_source        AS aktueller_source,
--   tc.enriched_display_name AS neuer_name,
--   tc.enriched_name_source  AS neuer_source,
--   CASE WHEN t.name_source IS NULL THEN 'IS NULL — Fallback-Muster' ELSE '' END AS hinweis
-- FROM public.tables t
-- JOIN public.table_candidates tc ON tc.matched_table_id = t.id
-- WHERE tc.enriched_display_name IS NOT NULL
--   AND tc.enriched_name_source IN (
--     'osm_park','osm_playground','osm_school','osm_kindergarten',
--     'osm_sports','osm_pool','osm_camping','osm_recreation',
--     'osm_square','osm_cemetery',
--     'osm_street','osm_street_extended','osm_suburb',
--     'osm_addr_street','osm_addr_city','fallback','enriched'
--   )
--   AND (
--     t.name_source IN (
--       'osm_park','osm_playground','osm_school','osm_kindergarten',
--       'osm_sports','osm_pool','osm_camping','osm_recreation',
--       'osm_square','osm_cemetery',
--       'osm_street','osm_street_extended','osm_suburb',
--       'osm_addr_street','osm_addr_city','fallback','enriched'
--     )
--     OR (
--       t.name_source IS NULL
--       AND (
--         t.name = 'Tischtennisplatte'
--         OR t.name ~ '^Tischtennisplatte #[0-9]+$'
--       )
--     )
--   )
-- ORDER BY t.name_source NULLS FIRST, t.id;
--
-- Ergebnis vom 2026-07-23 (4 Zeilen, kein echter Name betroffen):
--   id=89  Tischtennisplatte #2  (IS NULL) → Tischtennisplatte – Berliner Straße
--   id=90  Tischtennisplatte #3  (IS NULL) → Tischtennis an der Tageseinrichtung für Kinder
--   id=91  Tischtennisplatte #6  (IS NULL) → Tischtennis am Minipünktchen
--   id=94  Tischtennis am Spielplatz An der alten Kirche (osm_playground) → gleicher Name (No-Op)
--
-- 69 Zeilen mit name_source IS NULL und echten Namen (Schulen, Parks, Straßen)
-- werden von keinem der obigen Muster erfasst — sie bleiben unverändert.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Fix h2+m7: backfill_enriched_names_to_tables — korrigierte Positivliste ──
--
-- Änderungen gegenüber der ursprünglichen Implementierung:
--   1. Kein NOT IN — stattdessen ausdrückliche Positivliste überschreibbarer Quellen.
--   2. IS-NULL-Ast beschränkt auf nachweislich vom System erzeugte Fallback-Namen:
--        'Tischtennisplatte'  oder  'Tischtennisplatte #N'
--      Echte Namen mit name_source IS NULL (69 Zeilen in Prod.) werden nie verändert.
--   3. GRANT TO authenticated entfernt — Funktion bleibt nicht vom Frontend erreichbar.

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
  'Aktualisiert public.tables.name für bereits promovierte Kandidaten. '
  'Positivliste: nur Zeilen mit bekannter automatisch erzeugter Quelle werden angefasst. '
  'NULL-Ast: ausschließlich Systemnamen ''Tischtennisplatte'' / ''Tischtennisplatte #N''. '
  'Geschützt: osm_name, osm_name_de, osm_operator, admin_input sowie alle NULL-Zeilen '
  'mit echten Namen. Nur über Datenbankbesitzer (postgres) aufrufbar.';


-- ── Fix l1: pg_trgm-Index für ILIKE-Suche in list_candidates_for_review ──────
--
-- list_candidates_for_review() sucht via:
--   c.name      ILIKE '%' || p_search || '%'
--   c.external_id ILIKE '%' || p_search || '%'
-- Führendes % verhindert B-Tree-Indexnutzung. GIN-Trigram-Index löst das für
-- Suchstrings ≥ 3 Zeichen (bei 1–2 Zeichen weiterhin Seq-Scan, akzeptabel).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_table_candidates_name_trgm
  ON public.table_candidates USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_table_candidates_ext_id_trgm
  ON public.table_candidates USING gin (external_id gin_trgm_ops);
