-- ════════════════════════════════════════════════════════════════════════════
-- batch_promote_candidates — kontrollierter Admin-Batch für OSM-Kandidaten
--
-- Zweck:
--   Mehrere pending_review-Kandidaten in einem Aufruf prüfen und optional
--   promovieren. Unterstützt Dry-Run (Vorschau ohne DML) und echte Ausführung.
--
-- Sicherheitsdesign:
--   • SECURITY DEFINER, SET search_path = '' — identisch mit Einzel-RPCs.
--   • Admin-Gate als ERSTE Operation (auth.uid() + profiles.role = 'admin').
--   • Kein GRANT an PUBLIC oder anon.
--   • Maximale Batchgröße: 25 Kandidaten pro Aufruf (serverseitig erzwungen).
--   • Per-Kandidat-EXCEPTION-Blöcke: Fehler eines Kandidaten rollen nur
--     dessen Subtransaktion zurück — andere Kandidaten sind nicht betroffen.
--
-- Skip-Kriterien (Kandidat wird übersprungen, nicht als Fehler gewertet):
--   • review_status != 'pending_review'
--   • matched_table_id IS NOT NULL (bereits promoviert — Idempotenz)
--   • access-Tag ist 'private' oder 'no'
--   • Duplikat < 100 m in public.tables (dieselbe Haversine-Logik wie Einzel-RPC)
--
-- Dry-Run (p_dry_run = true, Standard):
--   Führt alle Prüfungen durch, aber kein INSERT/UPDATE.
--   Kandidaten die alle Prüfungen bestehen → status = 'would_promote'.
--
-- Echte Ausführung (p_dry_run = false):
--   Wie Dry-Run, aber mit INSERT in public.tables + UPDATE table_candidates.
--   Ergebnisse: status = 'promoted' | 'skipped' | 'error'.
--
-- Rückgabe: jsonb-Array, ein Objekt pro Kandidat:
--   {"id": "uuid", "name": "...", "status": "...", "reason": null|"...",
--    "new_table_id": null|integer}
--
-- Wiederverwendung der Einzel-RPC:
--   Die Logik wird hier inline repliziert (nicht als Funktionsaufruf) weil:
--   - PL/pgSQL-Funktionsaufrufe sind keine Subtransaktionen.
--   - SECURITY DEFINER-Aufruf innerhalb einer anderen SECURITY DEFINER-Funktion
--     kann auth.uid()-Kontext verlieren.
--   - Per-Kandidat-Exception-Handling erfordert BEGIN...EXCEPTION...END,
--     das nur auf PL/pgSQL-Blöcke anwendbar ist, nicht auf Funktionsaufrufe.
--
-- Rollback (Funktion entfernen):
--   DROP FUNCTION IF EXISTS public.batch_promote_candidates(uuid[], boolean);
-- ════════════════════════════════════════════════════════════════════════════

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
  v_nearby_id    integer;
  v_nearby_dist  integer;
  v_access       text;
  v_access_type  text;
  v_tables_count integer;
  v_new_id       integer;
  v_item         jsonb;
BEGIN
  -- ── Admin-Gate: ERSTE Operation ─────────────────────────────────────────────
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen den Batch ausführen.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Leerprüfung ─────────────────────────────────────────────────────────────
  IF p_candidate_ids IS NULL OR array_length(p_candidate_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- ── Batchgröße ──────────────────────────────────────────────────────────────
  IF array_length(p_candidate_ids, 1) > 25 THEN
    RAISE EXCEPTION 'Batch-Größe überschritten: maximal 25 Kandidaten pro Aufruf erlaubt.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Hauptschleife ───────────────────────────────────────────────────────────
  FOREACH v_cid IN ARRAY p_candidate_ids LOOP
    -- Lokale Variablen für jeden Durchlauf zurücksetzen
    v_cand         := NULL;
    v_nearby_id    := NULL;
    v_nearby_dist  := NULL;
    v_access       := NULL;
    v_access_type  := NULL;
    v_tables_count := NULL;
    v_new_id       := NULL;

    BEGIN  -- Subtransaktion: Fehler werden pro Kandidat isoliert

      -- Kandidat laden (mit FOR UPDATE nur bei echtem Lauf — Dry-Run braucht kein Lock)
      IF p_dry_run THEN
        SELECT * INTO v_cand FROM public.table_candidates WHERE id = v_cid;
      ELSE
        SELECT * INTO v_cand FROM public.table_candidates WHERE id = v_cid FOR UPDATE;
      END IF;

      IF NOT FOUND THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', null,
          'status', 'error', 'reason', 'Kandidat nicht gefunden', 'new_table_id', null
        ));
        CONTINUE;
      END IF;

      -- Nur pending_review verarbeiten
      IF v_cand.review_status != 'pending_review' THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Status ist bereits „%s"', v_cand.review_status),
          'new_table_id', null
        ));
        CONTINUE;
      END IF;

      -- Idempotenz: bereits promoviert
      IF v_cand.matched_table_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Bereits promoviert → public.tables.id %s', v_cand.matched_table_id),
          'new_table_id', v_cand.matched_table_id
        ));
        CONTINUE;
      END IF;

      -- Privater Zugang → überspringen
      v_access := v_cand.raw_tags->>'access';
      IF v_access IN ('private', 'no') THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Zugang: %s — nicht öffentlich zugänglich', v_access),
          'new_table_id', null
        ));
        CONTINUE;
      END IF;

      -- Duplikatprüfung: Haversine gegen public.tables, Schwelle 100 m
      -- Vorfilter ±0.002° (~220 m) nutzt lat/lng-Index; LEAST(1.0,…) für asin-Stabilität.
      SELECT id, dist_m
        INTO v_nearby_id, v_nearby_dist
        FROM (
          SELECT id,
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
        ) _n
       WHERE dist_m < 100
       ORDER BY dist_m
       LIMIT 1;

      IF v_nearby_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Mögliches Duplikat: public.tables.id %s (%s m entfernt)', v_nearby_id, v_nearby_dist),
          'new_table_id', null
        ));
        CONTINUE;
      END IF;

      -- Alle Prüfungen bestanden
      IF p_dry_run THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'would_promote', 'reason', null, 'new_table_id', null
        ));
        CONTINUE;
      END IF;

      -- ── Echter Lauf: INSERT + UPDATE ─────────────────────────────────────────

      v_access_type := CASE v_access
        WHEN 'yes'        THEN 'public'
        WHEN 'public'     THEN 'public'
        WHEN 'permissive' THEN 'public'
        WHEN 'customers'  THEN 'limited'
        WHEN 'private'    THEN 'private_or_unclear'
        WHEN 'no'         THEN 'private_or_unclear'
        ELSE 'public'
      END;

      IF (v_cand.raw_tags->>'capacity') ~ '^\d+$' THEN
        v_tables_count := (v_cand.raw_tags->>'capacity')::integer;
      END IF;

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
        v_cand.raw_tags->>'addr:county',  -- NULL wenn Tag fehlt
        NULL,                              -- region: kein verlässlicher OSM-Tag
        'approved',
        'osm'
      )
      RETURNING id INTO v_new_id;

      UPDATE public.table_candidates
         SET matched_table_id = v_new_id,
             review_status    = 'approved',
             reviewed_by      = v_caller_uid,
             reviewed_at      = now()
       WHERE id = v_cid;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_cid, 'name', v_cand.name,
        'status', 'promoted', 'reason', null, 'new_table_id', v_new_id
      ));

    EXCEPTION WHEN OTHERS THEN
      -- Subtransaktion dieses Kandidaten wird zurückgerollt.
      -- Fehler wird protokolliert; die Schleife läuft weiter.
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_cid,
        'name', COALESCE(v_cand.name, '(unbekannt)'),
        'status', 'error',
        'reason', SQLERRM,
        'new_table_id', null
      ));
    END;  -- Ende Subtransaktion

  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) TO authenticated;
-- service_role bewusst ausgelassen (auth.uid() = NULL → Admin-Gate weist ab).

COMMENT ON FUNCTION public.batch_promote_candidates(uuid[], boolean) IS
  'Admin-Batch-Promotion (max. 25). p_dry_run=true (Standard) für Vorschau ohne DML. '
  'Rückgabe: jsonb-Array mit status=would_promote|promoted|skipped|error pro Kandidat. '
  'Privater Zugang und Haversine-Duplikate < 100 m werden automatisch übersprungen.';
