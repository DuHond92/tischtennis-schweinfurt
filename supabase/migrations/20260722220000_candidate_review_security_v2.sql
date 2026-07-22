-- ════════════════════════════════════════════════════════════════════════════
-- Sicherheits-Korrektur v2: promote/reject/mark_candidate_duplicate
--
-- Problem (20260722210000_candidate_review_functions.sql):
--   • Kein REVOKE nach CREATE FUNCTION → PostgreSQL-Standard vergibt EXECUTE an
--     PUBLIC automatisch → anon und authenticated konnten alle RPCs aufrufen.
--   • SET search_path = public → pg_temp nicht explizit abgeschirmt; mit leerem
--     search_path ist die Isolation strenger und vorhersehbarer.
--
-- Korrekturen dieser Migration:
--   1. SET search_path = '' — alle Objekte explizit schema-qualifiziert.
--      pg_catalog wird von PostgreSQL auch bei leerem search_path immer zuerst
--      durchsucht (Builtins wie now(), sin(), cos(), power(), sqrt(), asin(),
--      radians() sind daher ohne Prefix erreichbar).
--      auth.uid() ist als auth.uid() bereits qualifiziert.
--      %ROWTYPE-Referenzen verwenden das vollständige Schema (public.tablename).
--   2. Duplikatprüfung ersetzt ±0.001°-Box durch exakte Haversine-Formel:
--      Erdradius 6 371 000 m, Schwelle 100 m, Index-Vorfilter ±0.002° (~220 m).
--      PostGIS ist auf diesem Projekt nicht aktiviert — ST_DWithin nicht verfügbar.
--   3. REVOKE EXECUTE FROM PUBLIC und FROM anon.
--      GRANT EXECUTE TO authenticated (Admin-Gate prüft dann intern).
--      KEIN GRANT an service_role: auth.uid() wäre dort NULL → Admin-Gate würde
--      ohnehin abweisen. Bewusstes Design: kein pauschaler Backend-Bypass.
--   4. Admin-Gate steht in jeder Funktion als allererste Operation.
--   5. Keine RLS-Rekursion: SECURITY DEFINER deaktiviert RLS vollständig für
--      alle Tabellenzugriffe innerhalb der Funktion (läuft als Datenbankbesitzer).
--      Der SELECT auf public.profiles wertet keinerlei RLS-Policies aus.
--
-- Bestehende Migration 20260722210000 wird NICHT geändert.
-- Rollback dieser Migration:
--   GRANT EXECUTE ON FUNCTION public.promote_table_candidate(uuid)      TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.reject_table_candidate(uuid, text)  TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.mark_candidate_duplicate(uuid,integer,text) TO PUBLIC;
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. promote_table_candidate ───────────────────────────────────────────────

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
  -- Builtins (sin, cos, asin, sqrt, radians, power, LEAST) liegen in pg_catalog,
  -- das auch bei search_path = '' implizit zuerst durchsucht wird.
  --
  -- Numerische Stabilität: Das Haversine-Argument h liegt theoretisch in [0,1].
  -- Floating-Point-Fehler können h minimal über 1.0 treiben → asin() würde
  -- NaN zurückgeben oder (je nach PostgreSQL-Plattform) einen Fehler werfen.
  -- LEAST(1.0, sqrt(h)) klemmt den asin()-Eingang auf maximal 1.0.
  -- GREATEST(0.0, ...) ist unnötig: sqrt() gibt für h ≥ 0 immer ≥ 0 zurück.
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

REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_table_candidate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.promote_table_candidate(uuid) TO authenticated;
-- service_role bewusst ausgelassen: auth.uid() wäre dort NULL und würde
-- vom Admin-Gate korrekt abgewiesen. Kein pauschaler Backend-Bypass.

COMMENT ON FUNCTION public.promote_table_candidate(uuid) IS
  'v2: search_path='''' + Haversine 100m-Check + REVOKE PUBLIC. '
  'Admin-only (serverseitig). Idempotent. PostGIS nicht verfügbar → reines SQL.';


-- ── 2. reject_table_candidate ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_table_candidate(
  p_candidate_id uuid,
  p_note         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_cand        public.table_candidates%ROWTYPE;
BEGIN
  -- ── Admin-Gate: ERSTE Operation ─────────────────────────────────────────────
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen Kandidaten ablehnen.'
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

  -- ── Bereits promovierte Einträge schützen ───────────────────────────────────
  IF v_cand.matched_table_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Kandidat wurde bereits als Platte ID % in public.tables übernommen. '
      'Ablehnung nicht möglich.',
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

REVOKE EXECUTE ON FUNCTION public.reject_table_candidate(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_table_candidate(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_table_candidate(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reject_table_candidate(uuid, text) IS
  'v2: search_path='''' + REVOKE PUBLIC. Admin-only (serverseitig). '
  'Bereits promovierte Einträge können nicht abgelehnt werden.';


-- ── 3. mark_candidate_duplicate ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_candidate_duplicate(
  p_candidate_id      uuid,
  p_existing_table_id integer,
  p_note              text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid  uuid;
  v_caller_role text;
  v_exists      boolean;
BEGIN
  -- ── Admin-Gate: ERSTE Operation ─────────────────────────────────────────────
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
    FROM public.profiles
   WHERE id = v_caller_uid;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Zugriff verweigert: Nur Admins dürfen Kandidaten als Duplikat markieren.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Referenzierten Eintrag prüfen ───────────────────────────────────────────
  SELECT EXISTS(
    SELECT 1 FROM public.tables WHERE id = p_existing_table_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'public.tables.id = % nicht gefunden.', p_existing_table_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Kandidat aktualisieren ──────────────────────────────────────────────────
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

REVOKE EXECUTE ON FUNCTION public.mark_candidate_duplicate(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_candidate_duplicate(uuid, integer, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mark_candidate_duplicate(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.mark_candidate_duplicate(uuid, integer, text) IS
  'v2: search_path='''' + REVOKE PUBLIC. Admin-only (serverseitig). '
  'Prüft ob die referenzierte tables.id existiert.';


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKATION (nach Migration ausführen)
-- ════════════════════════════════════════════════════════════════════════════

-- ── V1: Grant-Zustand — Erwartung: nur authenticated, kein PUBLIC/anon ────────
/*
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'promote_table_candidate',
    'reject_table_candidate',
    'mark_candidate_duplicate'
  )
ORDER BY routine_name, grantee;

-- Erwartetes Ergebnis:
--   mark_candidate_duplicate  | authenticated | EXECUTE
--   promote_table_candidate   | authenticated | EXECUTE
--   reject_table_candidate    | authenticated | EXECUTE
-- Kein PUBLIC, kein anon.
*/

-- ── V2: search_path prüfen ────────────────────────────────────────────────────
/*
SELECT proname, proconfig
FROM pg_proc
  JOIN pg_namespace ns ON ns.oid = pronamespace
WHERE ns.nspname = 'public'
  AND proname IN (
    'promote_table_candidate',
    'reject_table_candidate',
    'mark_candidate_duplicate'
  );

-- Erwartung: proconfig enthält 'search_path=' (leerer String).
*/


-- ════════════════════════════════════════════════════════════════════════════
-- TESTS
--
-- Zwei Ebenen:
--   A) SQL-DO-Blöcke (SQL Editor als postgres/service-role):
--      Testen die INTERNE LOGIK (Admin-Gate, Idempotenz).
--      Können EXECUTE-Permissions nicht testen — die Service-Role ist davon
--      ausgenommen. Für Permissions → Ebene B.
--
--   B) REST-API-Tests via curl:
--      Testen EXECUTE-Rechte + JWT-Validierung + Admin-Gate im echten Stack.
--      Ersetze <ANON_KEY>, <USER_JWT>, <ADMIN_JWT>, <CANDIDATE_UUID>.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A1: Kein JWT (auth.uid() = NULL) → insufficient_privilege ────────────────
/*
DO $$
DECLARE
  dummy integer;
BEGIN
  -- Simuliert: kein JWT → auth.uid() gibt NULL → kein Profile-Match → role = NULL
  -- NULL IS DISTINCT FROM 'admin' = TRUE → muss insufficient_privilege werfen
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    SELECT public.promote_table_candidate('00000000-0000-0000-0000-000000000001') INTO dummy;
    RAISE EXCEPTION '[FAIL] Admin-Gate hat nicht angeschlagen (kein JWT)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '[PASS A1] Kein JWT korrekt abgewiesen: %', SQLERRM;
    WHEN OTHERS THEN
      RAISE NOTICE '[INFO A1] Anderer Fehler (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
END;
$$;
*/

-- ── A2: Normaler Nutzer (role = 'user') → insufficient_privilege ──────────────
-- Ersetze <NORMALE_NUTZER_UUID>:
--   SELECT id FROM public.profiles WHERE role = 'user' LIMIT 1;
/*
DO $$
DECLARE
  dummy integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<NORMALE_NUTZER_UUID>', true);
  BEGIN
    SELECT public.promote_table_candidate('00000000-0000-0000-0000-000000000001') INTO dummy;
    RAISE EXCEPTION '[FAIL] Admin-Gate hat nicht angeschlagen (normaler Nutzer)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '[PASS A2] Normaler Nutzer korrekt abgewiesen: %', SQLERRM;
    WHEN OTHERS THEN
      RAISE NOTICE '[INFO A2] Anderer Fehler (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
END;
$$;
*/

-- ── A3: Admin-Nutzer → Admin-Gate passiert, dann fachlicher Fehler ────────────
-- Ersetze <ADMIN_UUID>:
--   SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1;
-- Erwartung: KEIN insufficient_privilege — stattdessen no_data_found
-- (die Test-UUID existiert nicht in table_candidates) oder Duplikat-Fehler (P0001).
-- Dass insufficient_privilege NICHT geworfen wird, beweist, dass das Admin-Gate passiert wurde.
/*
DO $$
DECLARE
  dummy integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<ADMIN_UUID>', true);
  BEGIN
    SELECT public.promote_table_candidate('00000000-0000-0000-0000-000000000001') INTO dummy;
    RAISE NOTICE '[PASS A3] Admin durchgelassen, Platte #% erzeugt', dummy;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION '[FAIL A3] Admin wurde fälschlicherweise abgewiesen: %', SQLERRM;
    WHEN no_data_found THEN
      RAISE NOTICE '[PASS A3] Admin-Gate passiert — Kandidat-UUID nicht gefunden (erwartet): %', SQLERRM;
    WHEN OTHERS THEN
      RAISE NOTICE '[PASS A3] Admin-Gate passiert — anderer fachlicher Fehler (SQLSTATE %): %', SQLSTATE, SQLERRM;
  END;
END;
$$;
*/

-- ── A4: Idempotenz — bereits promovierter Kandidat gibt dieselbe tables.id zurück
-- Voraussetzung: mindestens ein Kandidat mit review_status = 'approved' UND
-- matched_table_id IS NOT NULL existiert (nach erster echter Promotion).
-- Ersetze <ADMIN_UUID> und <APPROVED_CANDIDATE_UUID>:
--   SELECT id FROM public.table_candidates
--   WHERE review_status = 'approved' AND matched_table_id IS NOT NULL LIMIT 1;
/*
DO $$
DECLARE
  first_id  integer;
  second_id integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<ADMIN_UUID>', true);
  SELECT public.promote_table_candidate('<APPROVED_CANDIDATE_UUID>') INTO first_id;
  SELECT public.promote_table_candidate('<APPROVED_CANDIDATE_UUID>') INTO second_id;
  IF first_id = second_id THEN
    RAISE NOTICE '[PASS A4] Idempotenz bestätigt: beide Aufrufe → tables.id = %', first_id;
  ELSE
    RAISE EXCEPTION '[FAIL A4] Duplikat erzeugt: erster = %, zweiter = %', first_id, second_id;
  END IF;
END;
$$;
*/


-- ── B: REST-API-Tests (Terminal, echter JWT-Stack) ────────────────────────────
--
-- JWT für deinen Nutzer holen (Browser-Konsole der App):
--   sb.getValidToken().then(t => console.log(t))
--
-- Anon Key: aus SUPABASE_ANON im App-Code.
-- Supabase-URL: aus SUPABASE_URL im App-Code.
--
-- B1: Kein Authorization-Header → HTTP 401 oder 403 (je nach Supabase-Version)
/*
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/promote_table_candidate" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"p_candidate_id":"00000000-0000-0000-0000-000000000001"}'
-- Erwartet: 401 (fehlender Bearer-Token) oder Fehler aus dem Admin-Gate
*/

-- B2: Normaler Nutzer (JWT eines role='user'-Nutzers) → HTTP 403 insufficient_privilege
/*
curl -s \
  -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/promote_table_candidate" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"p_candidate_id":"00000000-0000-0000-0000-000000000001"}'
-- Erwartet: {"code":"insufficient_privilege","message":"Zugriff verweigert..."}
*/

-- B3: Admin-Nutzer → HTTP 200 (oder fachlicher Fehler, aber NICHT insufficient_privilege)
/*
curl -s \
  -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/promote_table_candidate" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"p_candidate_id":"<ECHTE_PENDING_CANDIDATE_UUID>"}'
-- Erwartet: Zahl (neue tables.id) oder Duplikat-Fehlermeldung (P0001) —
--           auf keinen Fall insufficient_privilege
*/

-- B4: Idempotenz — denselben Kandidaten zweimal promoten
/*
# Erster Aufruf gibt neue tables.id zurück (z.B. 68)
curl -s \
  -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/promote_table_candidate" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"p_candidate_id":"<APPROVED_CANDIDATE_UUID>"}'
# → 68

# Zweiter Aufruf muss exakt dieselbe ID zurückgeben, kein neuer INSERT
curl -s \
  -X POST "https://<PROJECT_REF>.supabase.co/rest/v1/rpc/promote_table_candidate" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"p_candidate_id":"<APPROVED_CANDIDATE_UUID>"}'
# → 68 (identisch)
*/
