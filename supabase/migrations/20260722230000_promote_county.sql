-- ════════════════════════════════════════════════════════════════════════════
-- v4: name_source-Spalte + kontextbezogene Namenslogik + county aus OSM
--
-- NOCH NICHT in Supabase ausgeführt (ersetzt den ursprünglichen v3-Entwurf).
--
-- Datengrundlage (19.206 Kandidaten, Stand 2026-07-22):
--   name/name:de vorhanden:   118  (0,6 %)
--   operator vorhanden:       108  (0,6 %)
--   addr:street vorhanden:     63  (0,3 %)
--   addr:city vorhanden:       35  (0,2 %)
--   addr:county vorhanden:      0  (0,0 %) — kein Wert in diesem Import
--
-- Namenslogik (5 Prioritätsstufen):
--   1. name / name:de — sofern nicht generisch (z. B. „Tischtennisplatte")
--   2. operator       → „Tischtennis bei [operator]"
--   3. addr:street    → „Tischtennisplatte an der [Straße]"
--   4. addr:city      → „Tischtennisplatte in [Stadt]"
--   5. Fallback       → „Tischtennisplatte"
--
-- Ergebnis: Laufnummern (Tischtennisplatte #N) verschwinden vollständig.
-- Gleiche Namen für mehrere Platten am selben Standort sind zulässig.
-- Technische Eindeutigkeit: tables.id + table_candidates.external_id.
--
-- Was sich gegenüber v2 (220000) nicht ändert:
--   • Admin-Gate (auth.uid() + profiles.role = 'admin' — NULL-sicher)
--   • SECURITY DEFINER + SET search_path = ''
--   • 100-m-Duplikatblock (Haversine + LEAST(1.0,...))
--   • REVOKE PUBLIC/anon + GRANT authenticated (kein service_role)
--   • Idempotenz: matched_table_id IS NOT NULL → existing id zurückgeben
--   • SELECT FOR UPDATE vor DML
--
-- Nachpflege bereits promotierter OSM-Platten (Laufnummern ersetzen):
-- Erst mit SELECT prüfen, dann UPDATE ausführen. Nur source='osm'.
-- Manuell gepflegte Namen (source='manual' oder manuell geändert) NIE ändern.
/*
SELECT t.id, t.name AS name_alt, dn.derived_name, dn.derived_name_source
  FROM public.tables t
  JOIN public.table_candidates tc ON tc.matched_table_id = t.id
  CROSS JOIN LATERAL public._candidate_derive_name(tc.raw_tags) dn
 WHERE t.source = 'osm'
   AND (t.name ~ '^Tischtennisplatte #[0-9]'
        OR t.name ~ '^Tischtennis-Platte [0-9]'
        OR t.name = 'Tischtennisplatte')
   AND dn.derived_name_source != 'fallback'  -- nur wo echter Kontext vorhanden
 ORDER BY t.id
 LIMIT 50;

-- UPDATE erst nach Prüfung:
UPDATE public.tables t
   SET name = dn.derived_name,
       name_source = dn.derived_name_source
  FROM public.table_candidates tc
  CROSS JOIN LATERAL public._candidate_derive_name(tc.raw_tags) dn
 WHERE tc.matched_table_id = t.id
   AND t.source = 'osm'
   AND (t.name ~ '^Tischtennisplatte #[0-9]'
        OR t.name ~ '^Tischtennis-Platte [0-9]'
        OR t.name = 'Tischtennisplatte')
   AND dn.derived_name_source != 'fallback';
*/
--
-- county-Nachpflege (addr:county=0 in aktuellem Import, trotzdem für künftige):
/*
UPDATE public.tables t
   SET county = (tc.raw_tags->>'addr:county')
  FROM public.table_candidates tc
 WHERE t.source = 'osm' AND t.county IS NULL
   AND tc.matched_table_id = t.id
   AND (tc.raw_tags->>'addr:county') IS NOT NULL;
*/
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. name_source-Spalte ────────────────────────────────────────────────────
-- Nullable: bestehende Zeilen (manuelle Einträge) behalten NULL.
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS name_source text;

COMMENT ON COLUMN public.tables.name_source IS
  'Herkunft des Anzeigenamens bei OSM-Importen. '
  'NULL = manuell gepflegt oder unbekannt. '
  'Werte: osm_name | osm_name_de | osm_operator | osm_addr_street | osm_addr_city | fallback';


-- ── 1. Namens-Hilfsfunktion ──────────────────────────────────────────────────
-- Reine, zustandslose Funktion. STABLE: gleiche Eingabe → gleiche Ausgabe.
-- Kein DML, kein Datenbankzugriff — nur jsonb-Transformation.
-- Vollständig schema-qualifiziert (SET search_path = '').

CREATE OR REPLACE FUNCTION public._candidate_derive_name(p_raw_tags jsonb)
RETURNS TABLE(derived_name text, derived_name_source text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH
  t(name, name_de, operator, street, city) AS (
    SELECT
      NULLIF(TRIM(p_raw_tags->>'name'),        ''),
      NULLIF(TRIM(p_raw_tags->>'name:de'),     ''),
      NULLIF(TRIM(p_raw_tags->>'operator'),    ''),
      NULLIF(TRIM(p_raw_tags->>'addr:street'), ''),
      NULLIF(TRIM(p_raw_tags->>'addr:city'),   '')
  ),
  -- Generische Platzhalter, die keinen echten Standortnamen tragen
  g(vals) AS (
    SELECT ARRAY[
      'tischtennisplatte', 'tischtennis', 'tischtennisfeld',
      'tischtennistisch', 'tt-platte', 'tt platte', 'tt-tisch',
      'table tennis', 'ping pong'
    ]
  )
SELECT
  CASE
    WHEN t.name    IS NOT NULL AND lower(t.name)    != ALL(g.vals) THEN t.name
    WHEN t.name_de IS NOT NULL AND lower(t.name_de) != ALL(g.vals) THEN t.name_de
    WHEN t.operator IS NOT NULL THEN 'Tischtennis bei ' || t.operator
    WHEN t.street   IS NOT NULL THEN 'Tischtennisplatte an der ' || t.street
    WHEN t.city     IS NOT NULL THEN 'Tischtennisplatte in ' || t.city
    ELSE 'Tischtennisplatte'
  END,
  CASE
    WHEN t.name    IS NOT NULL AND lower(t.name)    != ALL(g.vals) THEN 'osm_name'
    WHEN t.name_de IS NOT NULL AND lower(t.name_de) != ALL(g.vals) THEN 'osm_name_de'
    WHEN t.operator IS NOT NULL THEN 'osm_operator'
    WHEN t.street   IS NOT NULL THEN 'osm_addr_street'
    WHEN t.city     IS NOT NULL THEN 'osm_addr_city'
    ELSE 'fallback'
  END
FROM t, g;
$$;

COMMENT ON FUNCTION public._candidate_derive_name(jsonb) IS
  'Leitet aus OSM raw_tags einen anzeigbaren Namen + Herkunft ab. '
  'Priorität: name > name:de > operator > addr:street > addr:city > Fallback. '
  'Generische Platzhalter (z.B. "Tischtennisplatte") werden übersprungen.';


-- ── 2. promote_table_candidate v4 ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.promote_table_candidate(
  p_candidate_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid   uuid;
  v_caller_role  text;
  v_cand         public.table_candidates%ROWTYPE;
  v_nearby_id    integer;
  v_nearby_name  text;
  v_nearby_dist  integer;
  v_access_type  text;
  v_tables_count integer;
  v_derived      record;
  v_new_id       integer;
BEGIN
  -- ── Admin-Gate: ERSTE Operation ─────────────────────────────────────────────
  -- auth.uid() = NULL ohne gültigen JWT → IS DISTINCT FROM 'admin' = TRUE → abgewiesen.
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen Kandidaten freigeben.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Kandidat sperren ────────────────────────────────────────────────────────
  SELECT * INTO v_cand
    FROM public.table_candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kandidat % nicht gefunden.', p_candidate_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Statusprüfung ───────────────────────────────────────────────────────────
  IF v_cand.review_status NOT IN ('pending_review', 'approved') THEN
    RAISE EXCEPTION
      'Kandidat hat Status "%" — nur pending_review oder approved können promoviert werden.',
      v_cand.review_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotenz ──────────────────────────────────────────────────────────────
  IF v_cand.matched_table_id IS NOT NULL THEN
    RETURN v_cand.matched_table_id;
  END IF;

  -- ── Duplikatprüfung: Haversine 100 m ────────────────────────────────────────
  -- Vorfilter ±0.002° (~220 m) nutzt lat/lng-Index.
  -- LEAST(1.0, sqrt(h)) verhindert NaN bei Floating-Point h > 1.0.
  SELECT id, name, dist_m
    INTO v_nearby_id, v_nearby_name, v_nearby_dist
    FROM (
      SELECT id, name,
             ROUND(
               2 * 6371000.0 * asin(
                 LEAST(1.0, sqrt(
                   power(sin(radians((lat - v_cand.lat) / 2.0)), 2)
                   + cos(radians(v_cand.lat)) * cos(radians(lat))
                     * power(sin(radians((lng - v_cand.lng) / 2.0)), 2)
                 ))
               )
             )::integer AS dist_m
        FROM public.tables
       WHERE lat BETWEEN v_cand.lat - 0.002 AND v_cand.lat + 0.002
         AND lng BETWEEN v_cand.lng - 0.002 AND v_cand.lng + 0.002
    ) _nearby
   WHERE dist_m < 100
   ORDER BY dist_m
   LIMIT 1;

  IF v_nearby_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Mögliches Duplikat: "%" (ID %, ca. % m entfernt) liegt bereits in public.tables. '
      'Falls dies ein anderer Standort ist, verbinde zunächst mit mark_candidate_duplicate.',
      v_nearby_name, v_nearby_id, v_nearby_dist
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Namen ableiten ──────────────────────────────────────────────────────────
  SELECT * INTO v_derived FROM public._candidate_derive_name(v_cand.raw_tags);

  -- ── access_type mappen ──────────────────────────────────────────────────────
  v_access_type := CASE v_cand.raw_tags->>'access'
    WHEN 'yes'        THEN 'public'
    WHEN 'public'     THEN 'public'
    WHEN 'permissive' THEN 'public'
    WHEN 'customers'  THEN 'limited'
    WHEN 'private'    THEN 'private_or_unclear'
    WHEN 'no'         THEN 'private_or_unclear'
    ELSE 'public'
  END;

  -- ── tables_count aus capacity-Tag ───────────────────────────────────────────
  IF (v_cand.raw_tags->>'capacity') ~ '^\d+$' THEN
    v_tables_count := (v_cand.raw_tags->>'capacity')::integer;
  END IF;

  -- ── INSERT in public.tables ─────────────────────────────────────────────────
  -- Explizite Spaltenliste (Pflicht wegen access_type CHECK-Constraint).
  -- name:        aus _candidate_derive_name (nie laufende Nummer).
  -- name_source: Herkunft des Namens für Nachvollziehbarkeit.
  -- county:      aus addr:county-Tag (in aktuellem Import 0 vorhanden → meist NULL).
  -- region:      NULL — kein verlässlicher OSM-Tag.
  INSERT INTO public.tables
    (name, address, lat, lng, type, icon, tables_count, access_type,
     city, county, region, status, source, name_source)
  VALUES (
    v_derived.derived_name,
    v_cand.address,
    v_cand.lat,
    v_cand.lng,
    v_cand.type,
    '🏓',
    v_tables_count,
    v_access_type,
    v_cand.raw_tags->>'addr:city',
    v_cand.raw_tags->>'addr:county',
    NULL,
    'approved',
    'osm',
    v_derived.derived_name_source
  )
  RETURNING id INTO v_new_id;

  -- ── Kandidat aktualisieren ──────────────────────────────────────────────────
  UPDATE public.table_candidates
     SET matched_table_id = v_new_id,
         review_status    = 'approved',
         reviewed_by      = v_caller_uid,
         reviewed_at      = now()
   WHERE id = p_candidate_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.promote_table_candidate(uuid) TO authenticated;

COMMENT ON FUNCTION public.promote_table_candidate(uuid) IS
  'v4: kontextbezogene Namenslogik (_candidate_derive_name) + name_source + county. '
  'Alle Sicherheitseigenschaften von v2 unverändert.';
