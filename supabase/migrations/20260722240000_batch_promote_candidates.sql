-- ════════════════════════════════════════════════════════════════════════════
-- Batch-Review RPC v2: ruft promote_table_candidate (v4) direkt auf.
--
-- NOCH NICHT in Supabase ausgeführt.
-- Setzt Migration 20260722230000 voraus (_candidate_derive_name, promote v4).
--
-- Änderungen gegenüber v1-Entwurf:
--   • Echter Lauf: promote_table_candidate(v_cid) statt inline-DML
--     → Namenslogik, county, Duplikatprüfung aus promote v4 automatisch mit
--   • Rückgabe enthält: derived_name, name_source (aus dry-run-Logik bzw. promote)
--   • P0001-Exceptions (Duplikat-Block aus promote) → status='skipped'
--
-- Abdeckung Namens-Tiers (Grundlage: 19.206 Kandidaten, Stand 2026-07-22):
--   osm_name/osm_name_de: ~0,6 %  — Bsp.: "Freibad Tischtennis", "Mehrgenerationenplatz"
--   osm_operator:         ~0,6 %  — Bsp.: "Tischtennis bei Freibad Ettenheim"
--   osm_addr_street:      ~0,3 %  — Bsp.: "Tischtennisplatte an der Siebenkniestraße"
--   osm_addr_city:        ~0,2 %  — Bsp.: "Tischtennisplatte in Murrhardt"
--   fallback:            ~98,3 %  — "Tischtennisplatte" (keine Laufnummer mehr)
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
  v_caller_uid    uuid;
  v_caller_role   text;
  v_results       jsonb := '[]'::jsonb;
  v_cid           uuid;
  v_cand          public.table_candidates%ROWTYPE;
  v_derived       record;
  v_access        text;
  v_nearby_id     integer;
  v_nearby_dist   integer;
  v_new_id        integer;
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

  -- ── Eingabe-Validierung ──────────────────────────────────────────────────────
  IF array_length(p_candidate_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF array_length(p_candidate_ids, 1) > 25 THEN
    RAISE EXCEPTION 'Maximal 25 Kandidaten pro Batch-Aufruf (übergeben: %).',
      array_length(p_candidate_ids, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Hauptschleife ────────────────────────────────────────────────────────────
  FOREACH v_cid IN ARRAY p_candidate_ids LOOP

    BEGIN  -- Subtransaktion: Fehler eines Kandidaten isolieren

      SELECT * INTO v_cand
        FROM public.table_candidates
       WHERE id = v_cid;

      IF NOT FOUND THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', NULL,
          'status', 'skipped', 'reason', 'Kandidat nicht gefunden'
        ));
        CONTINUE;
      END IF;

      -- Skip: Bereits promoviert
      IF v_cand.matched_table_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Bereits promoviert (tables.id = %s)', v_cand.matched_table_id)
        ));
        CONTINUE;
      END IF;

      -- Skip: Status nicht verarbeitbar
      IF v_cand.review_status NOT IN ('pending_review', 'approved') THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('Status "%s": Batch verarbeitet nur pending_review/approved',
                           v_cand.review_status)
        ));
        CONTINUE;
      END IF;

      -- Skip: Access=private oder no
      v_access := v_cand.raw_tags->>'access';
      IF v_access IN ('private', 'no') THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped',
          'reason', format('access=%s — nicht öffentlich zugänglich', v_access)
        ));
        CONTINUE;
      END IF;

      -- Namen ableiten (für Dry-Run-Anzeige und echte Rückgabe)
      SELECT * INTO v_derived FROM public._candidate_derive_name(v_cand.raw_tags);

      -- Duplikat-Vorprüfung: Haversine < 100 m, Vorfilter ±0.002°
      -- Im echten Lauf: promote_table_candidate prüft nochmals autoritativ.
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
        ) _near
       WHERE dist_m < 100
       ORDER BY dist_m
       LIMIT 1;

      IF v_nearby_id IS NOT NULL THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'derived_name', v_derived.derived_name,
          'name_source',  v_derived.derived_name_source,
          'status', 'skipped',
          'reason', format('Duplikat: tables.id=%s ca. %s m entfernt',
                           v_nearby_id, v_nearby_dist)
        ));
        CONTINUE;
      END IF;

      -- ── Dry-Run: alle Prüfungen bestanden, kein DML ─────────────────────────
      IF p_dry_run THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'derived_name', v_derived.derived_name,
          'name_source',  v_derived.derived_name_source,
          'status', 'would_promote', 'reason', NULL, 'new_table_id', NULL
        ));
        CONTINUE;
      END IF;

      -- ── Echter Lauf: promote_table_candidate (v4) aufrufen ──────────────────
      -- promote v4 prüft intern nochmals: Admin-Gate, FOR UPDATE, Idempotenz,
      -- Haversine-Duplikat, bevor INSERT + UPDATE ausgeführt wird.
      -- Diese bewusste Redundanz sichert Korrektheit auch bei Race Conditions.
      v_new_id := public.promote_table_candidate(v_cid);

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_cid, 'name', v_cand.name,
        'derived_name', v_derived.derived_name,
        'name_source',  v_derived.derived_name_source,
        'status', 'promoted', 'reason', NULL, 'new_table_id', v_new_id
      ));

    EXCEPTION
      -- P0001: Duplikat-Exception aus promote_table_candidate
      WHEN SQLSTATE 'P0001' THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid, 'name', v_cand.name,
          'status', 'skipped', 'reason', SQLERRM
        ));

      -- Berechtigungs-Exception: nicht schlucken, nach oben weitergeben
      WHEN insufficient_privilege THEN
        RAISE;

      -- Alle anderen Fehler: im Ergebnis protokollieren, Schleife fortsetzen
      WHEN OTHERS THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_cid,
          'name', COALESCE(v_cand.name, v_cid::text),
          'status', 'error', 'reason', SQLERRM
        ));
    END;

  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.batch_promote_candidates(uuid[], boolean) TO authenticated;

COMMENT ON FUNCTION public.batch_promote_candidates(uuid[], boolean) IS
  'v2: Dry-Run und echter Lauf für bis zu 25 Kandidaten. '
  'Echter Lauf: delegate an promote_table_candidate v4 (Namenslogik, county, Duplikatcheck). '
  'Gibt derived_name + name_source im Ergebnis-Array zurück.';
