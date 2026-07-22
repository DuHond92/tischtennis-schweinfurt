-- ════════════════════════════════════════════════════════════════════════════
-- OSM-Kandidaten Review: SECURITY DEFINER Funktionen + Admin-RLS
--
-- Drei atomare RPCs für den Admin-Review-Workflow:
--   promote_table_candidate    — Kandidat → public.tables (mit Duplikatprüfung)
--   reject_table_candidate     — Kandidat ablehnen
--   mark_candidate_duplicate   — Kandidat als Duplikat mit vorhandener Platte verknüpfen
--
-- Sicherheitsgarantien:
--   • Alle drei Funktionen prüfen zuerst profiles.role = 'admin'.
--   • Sie laufen als SECURITY DEFINER (Datenbankbenutzer-Rechte), nicht als Anon.
--   • Der aufrufende User-JWT muss trotzdem gültig und admin sein.
--   • public.tables-Einträge werden ausschließlich über promote_table_candidate
--     angelegt — keine direkten Client-Writes.
--   • Idempotenz: mehrfacher Aufruf von promote_* erzeugt keine zweite Platte.
--
-- NICHT AUSFÜHREN ohne ausdrückliche Freigabe.
--
-- Rollback (in Reihenfolge):
--   DROP POLICY IF EXISTS "admins_can_select_candidates" ON public.table_candidates;
--   DROP FUNCTION IF EXISTS public.mark_candidate_duplicate(uuid, integer, text);
--   DROP FUNCTION IF EXISTS public.reject_table_candidate(uuid, text);
--   DROP FUNCTION IF EXISTS public.promote_table_candidate(uuid);
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Admin-SELECT auf table_candidates ─────────────────────────────────────
-- Bisher: kein öffentlicher Zugriff (standard-deny).
-- Neu:    Admins können die Kandidaten lesen, um sie im Review-UI anzuzeigen.
-- Direkte INSERT/UPDATE/DELETE bleiben gesperrt — nur via SECURITY DEFINER.

DROP POLICY IF EXISTS "admins_can_select_candidates" ON public.table_candidates;
CREATE POLICY "admins_can_select_candidates"
  ON public.table_candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ── 2. promote_table_candidate ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.promote_table_candidate(
  p_candidate_id uuid
)
RETURNS integer   -- gibt die neue public.tables.id zurück
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid   uuid;
  v_caller_role  text;
  v_cand         public.table_candidates%ROWTYPE;
  v_nearby_id    integer;
  v_access_type  text;
  v_tables_count integer;
  v_new_id       integer;
BEGIN
  -- ── Admin-Gate ──────────────────────────────────────────────────────────────
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen Kandidaten freigeben.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Kandidat sperren (FOR UPDATE verhindert parallele Promotion) ────────────
  SELECT * INTO v_cand
    FROM public.table_candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kandidat % nicht gefunden.', p_candidate_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Status prüfen ───────────────────────────────────────────────────────────
  IF v_cand.review_status NOT IN ('pending_review', 'approved') THEN
    RAISE EXCEPTION
      'Kandidat hat Status "%" — nur pending_review oder approved können promoviert werden.',
      v_cand.review_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotenz: bereits promoviert → silent return ─────────────────────────
  IF v_cand.matched_table_id IS NOT NULL THEN
    RETURN v_cand.matched_table_id;
  END IF;

  -- ── Duplikatprüfung: vorhandene Platte im 100-m-Radius? ───────────────────
  -- Bounding-Box ±0.001° ≈ 100 m (ohne PostGIS).
  -- Verhindert, dass eine bekannte Platte doppelt angelegt wird.
  SELECT id INTO v_nearby_id
    FROM public.tables
   WHERE lat BETWEEN v_cand.lat - 0.001 AND v_cand.lat + 0.001
     AND lng BETWEEN v_cand.lng - 0.001 AND v_cand.lng + 0.001
   ORDER BY (lat - v_cand.lat)^2 + (lng - v_cand.lng)^2
   LIMIT 1;

  IF v_nearby_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Mögliches Duplikat: public.tables.id=% liegt im 100-m-Radius. '
      'Verwende mark_candidate_duplicate() um den Kandidaten mit dem vorhandenen Eintrag zu verknüpfen.',
      v_nearby_id
      USING ERRCODE = 'unique_violation';
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

  -- ── tables_count aus capacity-Tag ───────────────────────────────────────────
  IF (v_cand.raw_tags->>'capacity') ~ '^\d+$' THEN
    v_tables_count := (v_cand.raw_tags->>'capacity')::integer;
  END IF;

  -- ── In public.tables einfügen ───────────────────────────────────────────────
  -- Explizite Spaltenliste: Pflicht wegen access_type-CHECK-Constraint.
  -- county/region: NULL — OSM hat kein Landkreis-Feld; manuell nachpflegen.
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
    NULL,
    NULL,
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

COMMENT ON FUNCTION public.promote_table_candidate(uuid) IS
  'Überträgt einen OSM-Kandidaten aus table_candidates in public.tables. '
  'Admin-only. Prüft auf 100-m-Duplikate. Idempotent: zweiter Aufruf gibt bestehende ID zurück.';


-- ── 3. reject_table_candidate ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_table_candidate(
  p_candidate_id uuid,
  p_note         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_cand        public.table_candidates%ROWTYPE;
BEGIN
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cand
    FROM public.table_candidates
   WHERE id = p_candidate_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kandidat % nicht gefunden.', p_candidate_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Bereits promovierte Einträge nicht zurücksetzen
  IF v_cand.matched_table_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Kandidat wurde bereits in public.tables übernommen (ID %). Ablehnung nicht möglich.',
      v_cand.matched_table_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.table_candidates
     SET review_status = 'rejected',
         review_note   = p_note,
         reviewed_by   = v_caller_uid,
         reviewed_at   = now()
   WHERE id = p_candidate_id;
END;
$$;

COMMENT ON FUNCTION public.reject_table_candidate(uuid, text) IS
  'Lehnt einen OSM-Kandidaten ab. Admin-only. Bereits promotete Einträge können nicht abgelehnt werden.';


-- ── 4. mark_candidate_duplicate ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_candidate_duplicate(
  p_candidate_id      uuid,
  p_existing_table_id integer,
  p_note              text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_exists      boolean;
BEGIN
  v_caller_uid := auth.uid();
  SELECT role INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Referenzierten Eintrag prüfen
  SELECT EXISTS(
    SELECT 1 FROM public.tables WHERE id = p_existing_table_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'public.tables.id=% nicht gefunden.', p_existing_table_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.table_candidates
     SET review_status    = 'possible_duplicate',
         matched_table_id = p_existing_table_id,
         review_note      = p_note,
         reviewed_by      = v_caller_uid,
         reviewed_at      = now()
   WHERE id = p_candidate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kandidat % nicht gefunden.', p_candidate_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_candidate_duplicate(uuid, integer, text) IS
  'Markiert einen OSM-Kandidaten als Duplikat und verknüpft ihn mit einem vorhandenen public.tables-Eintrag. Admin-only.';
