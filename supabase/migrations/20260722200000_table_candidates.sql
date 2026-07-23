-- ════════════════════════════════════════════════════════════════════════════
-- OSM-Import-Staging: table_candidates
-- Zweck  : Tischtennisplatten aus OpenStreetMap (DE) als Staging-Tabelle
--          für manuelle Prüfung vor Übernahme in public.tables.
--
-- Garantien
--   • public.tables wird NICHT verändert.
--   • Keine anderen Tabellen referenzieren table_candidates (kein CASCADE nötig).
--   • App-Code liest ausschließlich public.tables — keine Code-Änderung erforderlich.
--   • RLS mit Standard-deny: anon und authenticated sehen NICHTS.
--   • Import/Review ausschließlich via Service Role (Supabase SQL Editor).
--
-- NICHT AUSFÜHREN ohne ausdrückliche Freigabe.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.table_candidates;
--   (Indizes, RLS-Policies und COMMENTS werden automatisch mitentfernt.
--    Kein CASCADE: keine andere Tabelle referenziert diese Tabelle.)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.table_candidates (
  id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quelle + externe ID bilden den natürlichen Schlüssel.
  -- Für OSM: source = 'osm', external_id = 'node/12345678' | 'way/654321' | 'relation/111'
  source           text             NOT NULL DEFAULT 'osm',
  external_id      text             NOT NULL,

  -- Kerndaten (spiegeln das public.tables-Schema)
  name             text,
  address          text,
  lat              double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng              double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  type             text             NOT NULL DEFAULT 'outdoor'
                     CHECK (type IN ('outdoor', 'indoor')),

  -- Rohe OSM-Tags — vollständig, unverändert, als jsonb
  raw_tags         jsonb            NOT NULL DEFAULT '{}',

  -- Laufverfolgung
  import_batch     text             NOT NULL,
  imported_at      timestamptz      NOT NULL DEFAULT now(),
  last_seen_at     timestamptz      NOT NULL DEFAULT now(),

  -- Review-Status — wird beim Upsert NICHT zurückgesetzt
  review_status    text             NOT NULL DEFAULT 'pending_review'
                     CHECK (review_status IN (
                       'pending_review',
                       'approved',
                       'rejected',
                       'possible_duplicate'
                     )),
  review_note      text,
  reviewed_by      uuid             REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,

  -- Nach Promotion: Verweis auf den erzeugten Eintrag in public.tables
  matched_table_id integer          REFERENCES public.tables(id) ON DELETE SET NULL,

  UNIQUE (source, external_id)
);

-- ── Kommentare ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.table_candidates IS
  'OSM-Import-Staging. Nur nach manuellem Review via matched_table_id in public.tables übernehmen. Service Role only.';

COMMENT ON COLUMN public.table_candidates.external_id IS
  'Format: node/<osm_id> | way/<osm_id> | relation/<osm_id>  Beispiel: ''node/12345678''';

COMMENT ON COLUMN public.table_candidates.import_batch IS
  'Bezeichner des Import-Laufs, z.B. ''2026-07-22-germany-v1''. '
  'Gezielter Rollback: DELETE WHERE import_batch = ''...'' AND review_status = ''pending_review''.';

COMMENT ON COLUMN public.table_candidates.last_seen_at IS
  'Wird bei jedem Upsert aktualisiert. '
  'Nicht mehr vorhandene OSM-Objekte: WHERE last_seen_at < <import-start-time>.';

COMMENT ON COLUMN public.table_candidates.review_status IS
  'pending_review: neu/ungeprüft | approved: freigegeben | '
  'rejected: nicht übernehmen | possible_duplicate: manuell als Duplikat markiert';

-- ── RLS: Standard-deny ────────────────────────────────────────────────────────
-- Keine Policies → kein Zugriff für anon oder authenticated.
-- Service Role umgeht RLS automatisch (Supabase-Standard).

ALTER TABLE public.table_candidates ENABLE ROW LEVEL SECURITY;

-- ── Indizes ───────────────────────────────────────────────────────────────────

-- Review-Warteschlange filtern
CREATE INDEX IF NOT EXISTS idx_table_candidates_review_status
  ON public.table_candidates (review_status);

-- Upsert-Lookup und Duplikaterkennung (ergänzt den UNIQUE-Constraint)
CREATE INDEX IF NOT EXISTS idx_table_candidates_source_external_id
  ON public.table_candidates (source, external_id);

-- Geografische Bounding-Box-Queries (ohne PostGIS)
CREATE INDEX IF NOT EXISTS idx_table_candidates_lat_lng
  ON public.table_candidates (lat, lng);

-- Verknüpfte Einträge in public.tables schnell finden
CREATE INDEX IF NOT EXISTS idx_table_candidates_matched_table_id
  ON public.table_candidates (matched_table_id)
  WHERE matched_table_id IS NOT NULL;
