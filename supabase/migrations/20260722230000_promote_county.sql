-- ════════════════════════════════════════════════════════════════════════════
-- county aus OSM addr:county-Tag bei Promotion befüllen
--
-- Hintergrund:
--   promote_table_candidate v2 (20260722220000) ließ county und region immer NULL.
--   Diese Migration ersetzt die Funktion, um county aus raw_tags->>'addr:county'
--   zu befüllen, sofern der Tag vorhanden ist.
--
-- Warum addr:county?
--   OSM-Standard für Landkreis-Information in Deutschland.
--   Beispiel: "Landkreis Schweinfurt", "Stadt Schweinfurt".
--   Hinweis: Dieser Tag ist bei Tischtennisplatten selten befüllt —
--   bei den meisten importierten Kandidaten bleibt county weiterhin NULL.
--
-- Warum region = NULL bleibt:
--   Für Regierungsbezirke (Unterfranken etc.) gibt es keinen verlässlichen
--   OSM-Standard-Tag. Eine automatische Ableitung aus Koordinaten würde
--   Nominatim oder eine lokale Verwaltungsgrenzen-Tabelle erfordern.
--   Bis dahin bleibt region NULL und wird manuell gepflegt.
--
-- Nachpflege bereits promotierter OSM-Platten (nur NULL-Werte auffüllen):
--   Nach Ausführung dieser Migration können bereits promovierte Platten
--   mit fehlendem county gezielt nachgepflegt werden — ohne manuelle Werte
--   zu überschreiben (WHERE t.county IS NULL ist Pflicht):
--
-- /*
-- UPDATE public.tables t
--    SET county = (tc.raw_tags->>'addr:county')
--   FROM public.table_candidates tc
--  WHERE t.source = 'osm'
--    AND t.county IS NULL
--    AND tc.matched_table_id = t.id
--    AND (tc.raw_tags->>'addr:county') IS NOT NULL;
-- */
--
-- Hinweis: Nur ausführen wenn addr:county in den Kandidatendaten
-- zuverlässig befüllt und verifiziert ist. Nicht ohne ausdrückliche Freigabe.
--
-- Entsprechendes für region existiert nicht — kein verlässlicher OSM-Tag.
-- region-Werte nur manuell oder per gesichertem Gebietsschlüssel befüllen.
--
-- Rollback:
--   Vorige Version wiederherstellen, indem 20260722220000 erneut ausgeführt
--   wird (nur die promote_table_candidate-Funktion darin).
-- ════════════════════════════════════════════════════════════════════════════

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
  v_new_id       integer;
BEGIN
  -- ── Admin-Gate: ERSTE Operation, vor jeglichem DML oder FOR UPDATE ──────────
  -- SECURITY DEFINER → RLS auf public.profiles deaktiviert → keine Rekursion.
  -- auth.uid() liest request.jwt.claim.sub; NULL wenn kein gültiger JWT vorhanden.
  -- NULL IS DISTINCT FROM 'admin' = TRUE → korrektes Abweisen ohne JWT.
  v_caller_uid  := auth.uid();

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

  -- ── Duplikatprüfung: exakte Haversine-Distanz in Metern ────────────────────
  -- Vorfilter ±0.002° (~220 m) nutzt den lat/lng-Index (vermeidet Full Scan).
  -- Haversine (Erdradius 6 371 000 m) → exakte Luftliniendistanz. Schwelle: 100 m.
  -- PostGIS ist auf diesem Projekt nicht aktiviert → kein ST_DWithin verfügbar.
  -- LEAST(1.0, sqrt(h)) klemmt den asin()-Eingang auf maximal 1.0.
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
      'Falls die Kandidatenplatte trotzdem ein anderer Standort ist, '
      'verbinde sie zunächst mit mark_candidate_duplicate(''%'', %) und entscheide dann.',
      v_nearby_name, v_nearby_id, v_nearby_dist,
      p_candidate_id, v_nearby_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── access_type mappen ──────────────────────────────────────────────────────
  v_access_type := CASE v_cand.raw_tags->>'access'
    WHEN 'yes'        THEN 'public'
    WHEN 'public'     THEN 'public'
    WHEN 'permissive' THEN 'public'
    WHEN 'private'    THEN 'private_or_unclear'
    WHEN 'no'         THEN 'private_or_unclear'
    WHEN 'customers'  THEN 'limited'
    ELSE 'public'
  END;

  -- ── tables_count aus OSM capacity-Tag ───────────────────────────────────────
  IF (v_cand.raw_tags->>'capacity') ~ '^\d+$' THEN
    v_tables_count := (v_cand.raw_tags->>'capacity')::integer;
  END IF;

  -- ── In public.tables einfügen ───────────────────────────────────────────────
  -- Explizite Spaltenliste: Pflicht wegen access_type CHECK-Constraint.
  -- county: aus raw_tags->>'addr:county' (NULL wenn Tag fehlt — kein Fallback).
  -- region: NULL — kein verlässlicher OSM-Tag; manuelle Pflege erforderlich.
  INSERT INTO public.tables
    (name, address, lat, lng, type, icon, tables_count, access_type,
     city, county, region, status, source)
  VALUES (
    v_cand.name,
    v_cand.address,
    v_cand.lat,
    v_cand.lng,
    v_cand.type,
    '🏓',
    v_tables_count,
    v_access_type,
    v_cand.raw_tags->>'addr:city',
    v_cand.raw_tags->>'addr:county',  -- NEU: aus OSM-Tag, oft NULL
    NULL,                              -- region: kein verlässlicher OSM-Tag
    'approved',
    'osm'
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

-- Berechtigungen bleiben unverändert (CREATE OR REPLACE erhält bestehende Grants).
-- Zur Sicherheit explizit wiederholen:
REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.promote_table_candidate(uuid) TO authenticated;

COMMENT ON FUNCTION public.promote_table_candidate(uuid) IS
  'v3: county aus raw_tags->>(''addr:county''), region bleibt NULL. '
  'Sonst identisch mit v2 (search_path='''', Haversine 100m, REVOKE PUBLIC).';
