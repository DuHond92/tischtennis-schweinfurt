-- ╔══════════════════════════════════════════════════════════════╗
-- ║  TESTDATEN FÜR TEILNEHMER-AVATARE                           ║
-- ║  Ausführen im Supabase SQL Editor (Service Role)            ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- WICHTIG: Die profiles-Tabelle ist mit auth.users verknüpft.
-- Testprofile müssen daher entweder:
--   a) Über den Supabase Auth-Bereich als echte User angelegt werden
--   b) Oder direkt mit FOREIGN KEY deaktiviert eingefügt werden (nur Dev!)
--
-- OPTION B (Dev-only): Profil-Testdaten direkt einfügen
-- Erfordert Service Role Key (NICHT den Anon Key!)
-- Im Supabase Dashboard: SQL Editor → Ausführen

-- Schritt 1: Testprofile anlegen (ersetze UUIDs wenn nötig)
INSERT INTO profiles (id, username, avatar_emoji, elo, wins, losses, created_at)
VALUES
  ('00000001-0000-0000-0000-000000000001', 'Michael', '',     1200, 15, 8,  NOW() - INTERVAL '90 days'),
  ('00000001-0000-0000-0000-000000000002', 'Sarah',   '',     1050, 10, 12, NOW() - INTERVAL '75 days'),
  ('00000001-0000-0000-0000-000000000003', 'Lukas',   '⚡',   1350, 22, 6,  NOW() - INTERVAL '60 days'),
  ('00000001-0000-0000-0000-000000000004', 'Anna',    '🎯',   980,  7,  9,  NOW() - INTERVAL '45 days'),
  ('00000001-0000-0000-0000-000000000005', 'Max',     '',     1100, 13, 11, NOW() - INTERVAL '30 days'),
  ('00000001-0000-0000-0000-000000000006', 'Julia',   '🌟',  1180, 18, 7,  NOW() - INTERVAL '20 days'),
  ('00000001-0000-0000-0000-000000000007', 'Tom',     '',     890,  5,  14, NOW() - INTERVAL '10 days'),
  ('00000001-0000-0000-0000-000000000008', 'Felix',   '🔥',  1420, 28, 4,  NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- Schritt 2: Teilnehmer zu bestehenden Events zuweisen
-- Passe die event_id-Werte an echte IDs aus deiner events-Tabelle an.
-- SELECT id, title FROM events ORDER BY event_date;

-- Beispiel (ersetze EVENT_ID_1, EVENT_ID_2, etc. mit echten UUIDs oder Integer-IDs):
/*
INSERT INTO event_participants (event_id, user_id, joined_at)
SELECT e.id, p.id, NOW()
FROM events e, profiles p
WHERE e.title = 'Casual Runde'
  AND p.username IN ('Michael', 'Sarah', 'Lukas')
ON CONFLICT (event_id, user_id) DO NOTHING;
*/

-- Schritt 3: Verifizierung
SELECT
  e.title,
  COUNT(ep.user_id) AS teilnehmer,
  STRING_AGG(p.username, ', ') AS namen
FROM events e
LEFT JOIN event_participants ep ON ep.event_id = e.id
LEFT JOIN profiles p ON p.id = ep.user_id
GROUP BY e.id, e.title
ORDER BY e.event_date;
