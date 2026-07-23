-- ════════════════════════════════════════════════════════════════════════════
-- Räumliche Kontextanreicherung — Schema und aktualisierte Namenslogik
--
-- Hintergrund:
--   _candidate_derive_name() las bisher nur die Tags des TT-Knotens selbst.
--   Parks, Schulen, Spielplätze usw. sind andere OSM-Objekte ohne Referenz
--   auf den TT-Knoten. Dieses Skript fügt Enrichment-Spalten hinzu und
--   passt die Namenslogik so an, dass der gespeicherte Kontext Vorrang hat.
--
-- Zugehöriges Enrichment-Skript: db/osm-enrich.py
--   Schreibt: context_name, context_type, context_osm_id,
--             context_distance_m, context_method, context_confidence,
--             enriched_display_name, enriched_name_source, enriched_at
--
-- Änderungen gegenüber Migration 20260722230000:
--   1. ALTER TABLE table_candidates: 9 neue nullable Spalten
--   2. _candidate_derive_name(): optionaler enriched_name-Parameter
--      → enriched_display_name hat Vorrang vor Tag-Ableitung
--   3. promote_table_candidate v5: übergibt enriched-Werte an Helper
--   4. batch_promote_candidates v3: übergibt enriched-Werte im Dry-Run
--
-- Namens-Priorität (vollständig):
--   1. Echter/manueller Name (review-geschützt, niemals überschrieben)
--   2. enriched_display_name aus db/osm-enrich.py (räumlicher Kontext)
--   3. Tag-Ableitung: name/name:de → operator → addr:street → addr:city
--   4. Fallback "Tischtennisplatte"
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Enrichment-Spalten auf table_candidates ───────────────────────────────

ALTER TABLE public.table_candidates
  ADD COLUMN IF NOT EXISTS context_name          text,
  ADD COLUMN IF NOT EXISTS context_type          text,
  ADD COLUMN IF NOT EXISTS context_osm_id        text,
  ADD COLUMN IF NOT EXISTS context_distance_m    integer,
  ADD COLUMN IF NOT EXISTS context_method        text    CHECK (
    context_method IS NULL OR context_method IN ('contains','nearest','street','administrative')
  ),
  ADD COLUMN IF NOT EXISTS context_confidence    real    CHECK (context_confidence IS NULL OR
    (context_confidence >= 0.0 AND context_confidence <= 1.0)),
  ADD COLUMN IF NOT EXISTS enriched_display_name text,
  ADD COLUMN IF NOT EXISTS enriched_name_source  text,
  ADD COLUMN IF NOT EXISTS enriched_at           timestamptz;

COMMENT ON COLUMN public.table_candidates.context_name IS
  'Name des räumlichen Kontextobjekts (z.B. "Stadtpark", "Grundschule Nord")';
COMMENT ON COLUMN public.table_candidates.context_type IS
  'Typ: park | playground | school | sports | pool | camping | recreation | square | street | suburb';
COMMENT ON COLUMN public.table_candidates.context_osm_id IS
  'OSM-ID des Kontextobjekts, z.B. "way/12345678"';
COMMENT ON COLUMN public.table_candidates.context_distance_m IS
  'Distanz TT-Platte ↔ Kontextobjekt-Mittelpunkt in Metern (0 bei contains)';
COMMENT ON COLUMN public.table_candidates.context_type IS
  'Typ: park | playground | school | kindergarten | sports | pool | camping | recreation | square | cemetery | street | suburb';
COMMENT ON COLUMN public.table_candidates.context_method IS
  'contains = TT-Platte liegt im Polygon; nearest = nächstes Objekt ≤ 100m; street = nächste Straße ≤ 150m; administrative';
COMMENT ON COLUMN public.table_candidates.context_confidence IS
  '0.0–1.0: Konfidenz der Zuordnung';
COMMENT ON COLUMN public.table_candidates.enriched_display_name IS
  'Abgeleiteter Anzeigename aus räumlichem Kontext, z.B. "Tischtennis im Stadtpark"';
COMMENT ON COLUMN public.table_candidates.enriched_name_source IS
  'Quelle: osm_park | osm_playground | osm_school | osm_kindergarten | osm_sports | osm_pool | '
  'osm_camping | osm_recreation | osm_square | osm_cemetery | osm_street | osm_street_extended | osm_suburb';
COMMENT ON COLUMN public.table_candidates.enriched_at IS
  'Zeitstempel der letzten Anreicherung durch db/osm-enrich.py';


-- ── 1. _candidate_derive_name v2 ─────────────────────────────────────────────
-- Optionale Parameter: enriched_name + enriched_source haben Vorrang vor Tag-Ableitung.
-- Aufruf ohne optionale Parameter: identisches Verhalten wie v1.
-- Aufruf mit enriched_name: gibt diesen direkt zurück (kein Tag-Lookup nötig).

CREATE OR REPLACE FUNCTION public._candidate_derive_name(
  p_raw_tags       jsonb,
  p_enriched_name  text DEFAULT NULL,
  p_enriched_src   text DEFAULT NULL
)
RETURNS TABLE(derived_name text, derived_name_source text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Enriched hat Vorrang (räumlicher Kontext aus db/osm-enrich.py)
  SELECT CASE
    WHEN p_enriched_name IS NOT NULL
      THEN p_enriched_name
    ELSE (
      WITH
        t(name, name_de, operator, street, city) AS (
          SELECT
            NULLIF(TRIM(p_raw_tags->>'name'),        ''),
            NULLIF(TRIM(p_raw_tags->>'name:de'),     ''),
            NULLIF(TRIM(p_raw_tags->>'operator'),    ''),
            NULLIF(TRIM(p_raw_tags->>'addr:street'), ''),
            NULLIF(TRIM(p_raw_tags->>'addr:city'),   '')
        ),
        g(vals) AS (SELECT ARRAY[
          'tischtennisplatte','tischtennis','tischtennisfeld','tischtennistisch',
          'tt-platte','tt platte','tt-tisch','table tennis','ping pong'
        ])
      SELECT
        CASE
          WHEN t.name    IS NOT NULL AND lower(t.name)    != ALL(g.vals) THEN t.name
          WHEN t.name_de IS NOT NULL AND lower(t.name_de) != ALL(g.vals) THEN t.name_de
          WHEN t.operator IS NOT NULL THEN 'Tischtennis bei ' || t.operator
          WHEN t.street   IS NOT NULL THEN 'Tischtennisplatte an der ' || t.street
          WHEN t.city     IS NOT NULL THEN 'Tischtennisplatte in ' || t.city
          ELSE 'Tischtennisplatte'
        END
      FROM t, g
    )
  END,
  CASE
    WHEN p_enriched_name IS NOT NULL
      THEN COALESCE(p_enriched_src, 'enriched')
    ELSE (
      WITH
        t(name, name_de, operator, street, city) AS (
          SELECT
            NULLIF(TRIM(p_raw_tags->>'name'),        ''),
            NULLIF(TRIM(p_raw_tags->>'name:de'),     ''),
            NULLIF(TRIM(p_raw_tags->>'operator'),    ''),
            NULLIF(TRIM(p_raw_tags->>'addr:street'), ''),
            NULLIF(TRIM(p_raw_tags->>'addr:city'),   '')
        ),
        g(vals) AS (SELECT ARRAY[
          'tischtennisplatte','tischtennis','tischtennisfeld','tischtennistisch',
          'tt-platte','tt platte','tt-tisch','table tennis','ping pong'
        ])
      SELECT
        CASE
          WHEN t.name    IS NOT NULL AND lower(t.name)    != ALL(g.vals) THEN 'osm_name'
          WHEN t.name_de IS NOT NULL AND lower(t.name_de) != ALL(g.vals) THEN 'osm_name_de'
          WHEN t.operator IS NOT NULL THEN 'osm_operator'
          WHEN t.street   IS NOT NULL THEN 'osm_addr_street'
          WHEN t.city     IS NOT NULL THEN 'osm_addr_city'
          ELSE 'fallback'
        END
      FROM t, g
    )
  END;
$$;

COMMENT ON FUNCTION public._candidate_derive_name(jsonb, text, text) IS
  'v2: optionale enriched_name/enriched_src-Parameter haben Vorrang vor Tag-Ableitung. '
  'Aufruf ohne optionale Parameter = identisches Verhalten wie v1.';


-- ── 2. promote_table_candidate v5 ────────────────────────────────────────────
-- Übergibt enriched_display_name + enriched_name_source an _candidate_derive_name.
-- Alle Sicherheitseigenschaften von v4 unverändert.

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
  -- Admin-Gate: ERSTE Operation
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

  -- Namen ableiten (v2: enriched_display_name hat Vorrang)
  SELECT * INTO v_derived FROM public._candidate_derive_name(
    v_cand.raw_tags,
    v_cand.enriched_display_name,  -- NULL wenn noch nicht angereichert
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

  -- INSERT in public.tables
  INSERT INTO public.tables
    (name, address, lat, lng, type, icon, tables_count, access_type,
     city, county, region, status, source, name_source)
  VALUES (
    v_derived.derived_name,
    v_cand.address,
    v_cand.lat, v_cand.lng,
    v_cand.type, '🏓',
    v_tables_count, v_access_type,
    v_cand.raw_tags->>'addr:city',
    v_cand.raw_tags->>'addr:county',
    NULL, 'approved', 'osm',
    v_derived.derived_name_source
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
  'v5: übergibt enriched_display_name an _candidate_derive_name (Vorrang vor Tag-Ableitung). '
  'Alle Sicherheitseigenschaften von v4 unverändert.';


-- ── 3. batch_promote_candidates v3 ───────────────────────────────────────────
-- Dry-Run zeigt enriched_display_name wenn vorhanden.
-- Echter Lauf delegiert an promote_table_candidate v5.

CREATE OR REPLACE FUNCTION public.batch_promote_candidates(
  p_candidate_ids uuid[],
  p_dry_run       boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid   uuid;
  v_caller_role  text;
  v_results      jsonb := '[]'::jsonb;
  v_cid          uuid;
  v_cand         public.table_candidates%ROWTYPE;
  v_derived      record;
  v_access       text;
  v_nearby_id    integer;
  v_nearby_dist  integer;
  v_new_id       integer;
BEGIN
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF array_length(p_candidate_ids, 1) IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF array_length(p_candidate_ids, 1) > 25 THEN
    RAISE EXCEPTION 'Maximal 25 Kandidaten (übergeben: %).',
      array_length(p_candidate_ids, 1) USING ERRCODE = 'check_violation';
  END IF;

  FOREACH v_cid IN ARRAY p_candidate_ids LOOP
    BEGIN
      SELECT * INTO v_cand FROM public.table_candidates WHERE id = v_cid;

      IF NOT FOUND THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', NULL, 'status', 'skipped', 'reason', 'Nicht gefunden'));
        CONTINUE;
      END IF;

      IF v_cand.matched_table_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped', 'reason', format('Bereits promoviert (tables.id=%s)', v_cand.matched_table_id)));
        CONTINUE;
      END IF;

      IF v_cand.review_status NOT IN ('pending_review', 'approved') THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped', 'reason', format('Status "%s"', v_cand.review_status)));
        CONTINUE;
      END IF;

      v_access := v_cand.raw_tags->>'access';
      IF v_access IN ('private', 'no') THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped', 'reason', format('access=%s', v_access)));
        CONTINUE;
      END IF;

      -- Namen ableiten (enriched hat Vorrang)
      SELECT * INTO v_derived FROM public._candidate_derive_name(
        v_cand.raw_tags,
        v_cand.enriched_display_name,
        v_cand.enriched_name_source
      );

      -- Duplikat-Vorprüfung
      SELECT id, dist_m INTO v_nearby_id, v_nearby_dist FROM (
        SELECT id, ROUND(2 * 6371000.0 * asin(LEAST(1.0, sqrt(
          power(sin(radians((lat - v_cand.lat) / 2.0)), 2)
          + cos(radians(v_cand.lat)) * cos(radians(lat))
            * power(sin(radians((lng - v_cand.lng) / 2.0)), 2)
        ))))::integer AS dist_m
        FROM public.tables
        WHERE lat BETWEEN v_cand.lat - 0.002 AND v_cand.lat + 0.002
          AND lng BETWEEN v_cand.lng - 0.002 AND v_cand.lng + 0.002
      ) _n WHERE dist_m < 100 ORDER BY dist_m LIMIT 1;

      IF v_nearby_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'derived_name', v_derived.derived_name, 'name_source', v_derived.derived_name_source,
          'status', 'skipped', 'reason', format('Duplikat: tables.id=%s (%sm)', v_nearby_id, v_nearby_dist)));
        CONTINUE;
      END IF;

      IF p_dry_run THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'derived_name',   v_derived.derived_name,
          'name_source',    v_derived.derived_name_source,
          'context_type',   v_cand.context_type,
          'context_name',   v_cand.context_name,
          'context_method', v_cand.context_method,
          'context_dist',   v_cand.context_distance_m,
          'status', 'would_promote', 'reason', NULL, 'new_table_id', NULL));
        CONTINUE;
      END IF;

      v_new_id := public.promote_table_candidate(v_cid);

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_cid, 'name', v_cand.name,
        'derived_name', v_derived.derived_name, 'name_source', v_derived.derived_name_source,
        'status', 'promoted', 'reason', NULL, 'new_table_id', v_new_id));

    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name, 'status', 'skipped', 'reason', SQLERRM));
      WHEN insufficient_privilege THEN RAISE;
      WHEN OTHERS THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', COALESCE(v_cand.name, v_cid::text),
          'status', 'error', 'reason', SQLERRM));
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) TO authenticated;

COMMENT ON FUNCTION public.batch_promote_candidates(uuid[], boolean) IS
  'v3: Dry-Run zeigt enriched_display_name + context_type/method/dist. '
  'Echter Lauf: promote_table_candidate v5.';


-- ── 4. Admin-RPC: Kandidaten mit Enrichment-Daten lesen ──────────────────────
-- Gibt table_candidates mit allen Enrichment-Spalten zurück.
-- Admin-Gate schützt die Abfrage (RLS blockiert sonst authenticated-User).

CREATE OR REPLACE FUNCTION public.list_candidates_for_review(
  p_status   text    DEFAULT 'pending_review',
  p_type     text    DEFAULT NULL,
  p_search   text    DEFAULT NULL,
  p_limit    integer DEFAULT 20,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE(
  id                   uuid,
  source               text,
  external_id          text,
  name                 text,
  address              text,
  lat                  double precision,
  lng                  double precision,
  type                 text,
  raw_tags             jsonb,
  review_status        text,
  matched_table_id     integer,
  context_name         text,
  context_type         text,
  context_osm_id       text,
  context_distance_m   integer,
  context_method       text,
  context_confidence   real,
  enriched_display_name text,
  enriched_name_source  text,
  enriched_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
BEGIN
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.source, c.external_id, c.name, c.address, c.lat, c.lng,
    c.type, c.raw_tags, c.review_status, c.matched_table_id,
    c.context_name, c.context_type, c.context_osm_id,
    c.context_distance_m, c.context_method, c.context_confidence,
    c.enriched_display_name, c.enriched_name_source, c.enriched_at
  FROM public.table_candidates c
  WHERE (p_status IS NULL OR c.review_status = p_status)
    AND (p_type IS NULL OR c.type = p_type)
    AND (p_search IS NULL
         OR c.name ILIKE '%' || p_search || '%'
         OR c.external_id ILIKE '%' || p_search || '%')
  ORDER BY c.imported_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_candidates_for_review(text,text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_candidates_for_review(text,text,text,integer,integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_candidates_for_review(text,text,text,integer,integer) TO authenticated;

COMMENT ON FUNCTION public.list_candidates_for_review(text,text,text,integer,integer) IS
  'Admin-RPC: Kandidaten mit Enrichment-Feldern — sicherer als direkter REST-Zugriff auf table_candidates.';


-- ── 5. backfill_enriched_names_to_tables ─────────────────────────────────────
-- Aktualisiert public.tables.name für bereits promovierte Kandidaten,
-- wenn der bisherige name_source ein automatisch erzeugter Fallback ist.
-- Echte Namen (osm_name, osm_name_de, osm_operator) werden NIE überschrieben.
-- Wird nach dem Enrichment-Write-Schritt ausgeführt (db/osm-enrich.py).

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
       AND t.name_source NOT IN (
             'osm_name', 'osm_name_de', 'osm_operator', 'admin_input'
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
  'enriched_display_name, sofern name_source kein echter/manueller Name ist. '
  'Sicher: osm_name, osm_name_de, osm_operator, admin_input werden nie überschrieben.';
