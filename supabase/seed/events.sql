-- ════════════════════════════════════════════════════════════════════════
-- SEED: events + event_participants + Mitspieler-Gesuche
-- Voraussetzung: profiles.sql und tables.sql wurden bereits ausgeführt.
-- Daten auf Zieldatum anpassen: Datumsangaben sind relativ zu NOW() gesetzt.
-- ════════════════════════════════════════════════════════════════════════

-- Events
INSERT INTO public.events (id, title, mode, event_date, event_time, max_participants, creator_id, table_id)
VALUES
  (3,  'Casual Runde für alle',         'casual',  NOW() + INTERVAL '7 days',  '15:00', 6,  NULL,                                     1),
  (5,  'Mini-Turnier Bronze Liga',       'turnier', NOW() + INTERVAL '15 days', '13:00', 16, NULL,                                     3),
  (6,  'Anfänger Willkommen',            'casual',  NOW() + INTERVAL '14 days', '14:00', 8,  NULL,                                     1),
  (8,  'Sunset Ping Pong',               'casual',  NOW() + INTERVAL '20 days', '18:30', 12, NULL,                                     9),
  (9,  'Wertungsspiel 1v1',              'ranked',  NOW() + INTERVAL '8 days',  '16:00', 2,  '06279c69-42d5-47db-83a5-3ef6789f055c',  2),
  (10, 'Spielrunde Fortgeschrittene',    'training',NOW() + INTERVAL '11 days', '13:00', 10, '0ed1d80d-65a8-4de7-8d98-6167a78ab3d4',  3),
  (11, 'Wertungsspiel Abend',            'ranked',  NOW() + INTERVAL '18 days', '19:00', 6,  'b8d984fb-73de-464a-b10c-798f16a3de35',  3),
  (12, 'Just 4 Fun Runde',               'casual',  NOW() + INTERVAL '11 days', '16:00', 10, '06279c69-42d5-47db-83a5-3ef6789f055c',  7)
ON CONFLICT (id) DO NOTHING;

-- Teilnehmer
INSERT INTO public.event_participants (event_id, user_id)
VALUES
  -- Casual Runde (id=3)
  (3, '887befe0-2930-4842-adc9-f8b3d302630a'),  -- Micha
  (3, '06279c69-42d5-47db-83a5-3ef6789f055c'),  -- Sarah
  (3, '25ee1df3-35ec-47f5-873d-b951b63e5706'),  -- Lukas
  -- Wertungsspiel 1v1 (id=9)
  (9, '06279c69-42d5-47db-83a5-3ef6789f055c'),  -- Sarah
  (9, 'fd93c5a1-2f06-4382-ad32-dbb802c37c6d'),  -- Anna
  -- Spielrunde Fortgeschrittene (id=10)
  (10,'0ed1d80d-65a8-4de7-8d98-6167a78ab3d4'), -- Julia
  (10,'0544a0d5-5771-498b-81b8-aa98adc02e77'), -- Tom
  (10,'b8d984fb-73de-464a-b10c-798f16a3de35'), -- Felix
  (10,'06279c69-42d5-47db-83a5-3ef6789f055c'), -- Sarah
  (10,'25ee1df3-35ec-47f5-873d-b951b63e5706'), -- Lukas
  -- Sunset Ping Pong (id=8)
  (8, '887befe0-2930-4842-adc9-f8b3d302630a'), -- Micha
  (8, '06279c69-42d5-47db-83a5-3ef6789f055c'), -- Sarah
  (8, '0ed1d80d-65a8-4de7-8d98-6167a78ab3d4'), -- Julia
  (8, '25ee1df3-35ec-47f5-873d-b951b63e5706'), -- Lukas
  -- Just 4 Fun (id=12)
  (12,'06279c69-42d5-47db-83a5-3ef6789f055c'), -- Sarah
  (12,'25ee1df3-35ec-47f5-873d-b951b63e5706'), -- Lukas
  (12,'b8d984fb-73de-464a-b10c-798f16a3de35')  -- Felix
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Mitspieler-Gesuche (mode = 'player_search', table_id = NULL)
INSERT INTO public.events (id, title, mode, event_date, event_time, max_participants, creator_id, table_id, description)
VALUES
  (20, 'Sarah sucht Mitspieler',  'player_search', NOW(), '00:00', 2, '06279c69-42d5-47db-83a5-3ef6789f055c', NULL,
       'Suche jemanden für eine entspannte Runde heute Nachmittag. Alle Level willkommen!'),
  (21, 'Lukas sucht Mitspieler',  'player_search', NOW(), '00:00', 2, '25ee1df3-35ec-47f5-873d-b951b63e5706', NULL,
       'Regelmäßiges Techniktraining gesucht. Schläger und Bälle vorhanden.'),
  (22, 'Max sucht Mitspieler',    'player_search', NOW(), '00:00', 2, '8710df1b-b15d-4dd2-82ee-82f8240ebf63', NULL,
       'Wer hat Lust auf Ping Pong am Wochenende?')
ON CONFLICT (id) DO NOTHING;

-- Sequence nach manuellen IDs zurücksetzen
SELECT setval('public.events_id_seq', (SELECT MAX(id) FROM public.events));
