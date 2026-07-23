-- ══════════════════════════════════════════════════════════════════════════════
-- Empfehlungen aus Schema-Audit 2026-07-23
--   1. osm_id-Spalte in public.tables + Backfill bestehender Promotions
--   2. promote_table_candidate v6: opening_hours + description + osm_id
--   3. backfill_enriched_names_to_tables v3: expliziter source-Guard
--   4. Trailing-\n-Bereinigung in id 65 + 66
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. osm_id ─────────────────────────────────────────────────────────────────
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS osm_id text;

COMMENT ON COLUMN public.tables.osm_id IS
  'OSM-Elementreferenz, z.B. "node/35977781" — nur für über promote_table_candidate '
  'aus table_candidates erzeugte Zeilen (source = ''osm'').';

-- Backfill: bereits promovierte Platten verknüpfen
UPDATE public.tables t
   SET osm_id = tc.external_id
  FROM public.table_candidates tc
 WHERE tc.matched_table_id = t.id
   AND t.osm_id IS NULL;


-- ── 2. Trailing Newlines (id 65, 66) ─────────────────────────────────────────
UPDATE public.tables
   SET name = trim(name)
 WHERE id IN (65, 66)
   AND name != trim(name);


-- ── 3. promote_table_candidate v6 ─────────────────────────────────────────────
-- Ergänzt osm_id, opening_hours und description aus raw_tags.
-- Alle Sicherheitseigenschaften von v5 bleiben unverändert.

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
  -- Admin-Gate
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen Kandidaten freigeben.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Kandidat sperren
  SELECT * INTO v_cand
    FROM public.table_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kandidat % nicht gefunden.', p_candidate_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Statusprüfung
  IF v_cand.review_status NOT IN ('pending_review', 'approved') THEN
    RAISE EXCEPTION
      'Kandidat hat Status "%" — nur pending_review oder approved können promoviert werden.',
      v_cand.review_status USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotenz
  IF v_cand.matched_table_id IS NOT NULL THEN
    RETURN v_cand.matched_table_id;
  END IF;

  -- Duplikatprüfung: Haversine 100 m
  SELECT id, name, dist_m
    INTO v_nearby_id, v_nearby_name, v_nearby_dist
    FROM (
      SELECT id, name,
             ROUND(2 * 6371000.0 * asin(
               LEAST(1.0, sqrt(
                 power(sin(radians((lat - v_cand.lat) / 2.0)), 2)
                 + cos(radians(v_cand.lat)) * cos(radians(lat))
                   * power(sin(radians((lng - v_cand.lng) / 2.0)), 2)
               ))
             ))::integer AS dist_m
        FROM public.tables
       WHERE lat BETWEEN v_cand.lat - 0.002 AND v_cand.lat + 0.002
         AND lng BETWEEN v_cand.lng - 0.002 AND v_cand.lng + 0.002
    ) _nearby
   WHERE dist_m < 100 ORDER BY dist_m LIMIT 1;

  IF v_nearby_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Mögliches Duplikat: "%" (ID %, ca. % m entfernt).',
      v_nearby_name, v_nearby_id, v_nearby_dist USING ERRCODE = 'P0001';
  END IF;

  -- Namen ableiten (enriched_display_name hat Vorrang)
  SELECT * INTO v_derived FROM public._candidate_derive_name(
    v_cand.raw_tags,
    v_cand.enriched_display_name,
    v_cand.enriched_name_source
  );

  -- access_type mappen
  v_access_type := CASE v_cand.raw_tags->>'access'
    WHEN 'yes'        THEN 'public'
    WHEN 'public'     THEN 'public'
    WHEN 'permissive' THEN 'public'
    WHEN 'customers'  THEN 'limited'
    WHEN 'private'    THEN 'private_or_unclear'
    WHEN 'no'         THEN 'private_or_unclear'
    ELSE 'public'
  END;

  -- tables_count aus capacity-Tag
  IF (v_cand.raw_tags->>'capacity') ~ '^\d+$' THEN
    v_tables_count := (v_cand.raw_tags->>'capacity')::integer;
  END IF;

  -- INSERT
  INSERT INTO public.tables
    (name, address, lat, lng, type, icon, tables_count, access_type,
     city, county, region, status, source, name_source,
     osm_id, opening_hours, description)
  VALUES (
    v_derived.derived_name,
    v_cand.address,
    v_cand.lat, v_cand.lng,
    v_cand.type, '🏓',
    v_tables_count, v_access_type,
    v_cand.raw_tags->>'addr:city',
    v_cand.raw_tags->>'addr:county',
    NULL, 'approved', 'osm',
    v_derived.derived_name_source,
    v_cand.external_id,
    v_cand.raw_tags->>'opening_hours',
    v_cand.raw_tags->>'description'
  )
  RETURNING id INTO v_new_id;

  -- Kandidat aktualisieren
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
  'v6: Überträgt osm_id, opening_hours und description aus raw_tags. '
  'Alle Sicherheitseigenschaften von v5 unverändert.';


-- ── 4. backfill_enriched_names_to_tables v3 — expliziter source-Guard ─────────
-- Ergänzt AND t.source NOT IN (''manual'', ''user_suggestion'') als expliziten Schutz,
-- damit manuelle und nutzergepflegte Platten nie durch den Backfill überschrieben
-- werden können — unabhängig von name_source und Namensmuster.

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
       -- Nur echte Anreicherungs-Quellen als Ziel
       AND tc.enriched_name_source IN (
             'osm_park','osm_playground','osm_school','osm_kindergarten',
             'osm_sports','osm_pool','osm_camping','osm_recreation',
             'osm_square','osm_cemetery',
             'osm_street','osm_street_extended','osm_suburb',
             'osm_addr_street','osm_addr_city','enriched'
           )
       -- Expliziter source-Guard: manuelle und nutzergepflegte Platten niemals anfassen
       AND t.source NOT IN ('manual', 'user_suggestion')
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

REVOKE EXECUTE ON FUNCTION public.backfill_enriched_names_to_tables()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.backfill_enriched_names_to_tables() IS
  'v3: Expliziter source-Guard (NOT IN manual/user_suggestion). '
  'Positivliste überschreibbarer Quellen. '
  'NULL-Ast: ausschließlich Tischtennisplatte / Tischtennisplatte #N. '
  'Nur über Datenbankbesitzer (postgres) aufrufbar.';
