-- ════════════════════════════════════════════════════════════════════════
-- SEED: demo_messages
-- Beispiel-Nachrichten für Event-Chats und Direktnachrichten.
-- Voraussetzung: profiles.sql, events.sql, player_connections.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── Event-Chat-Nachrichten ────────────────────────────────────────────

INSERT INTO public.event_messages (event_id, user_id, message, created_at)
VALUES
  -- Casual Runde für alle (event_id=3)
  (3, '887befe0-2930-4842-adc9-f8b3d302630a', 'Bin dabei! Bis dann 🏓',            NOW() - INTERVAL '5 days'),
  (3, '06279c69-42d5-47db-83a5-3ef6789f055c', 'Ich auch, freue mich drauf!',      NOW() - INTERVAL '5 days' + INTERVAL '2 minutes'),
  (3, '25ee1df3-35ec-47f5-873d-b951b63e5706', 'Top, bringe noch Max mit falls ok', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'),
  (3, '887befe0-2930-4842-adc9-f8b3d302630a', 'Klar, je mehr desto besser! ⚡',   NOW() - INTERVAL '5 days' + INTERVAL '7 minutes'),

  -- Spielrunde Fortgeschrittene (event_id=10)
  (10,'0ed1d80d-65a8-4de7-8d98-6167a78ab3d4', 'Wir starten pünktlich um 13 Uhr',  NOW() - INTERVAL '3 days'),
  (10,'b8d984fb-73de-464a-b10c-798f16a3de35', 'Alles klar, bin vorbereitet 🔥',   NOW() - INTERVAL '3 days' + INTERVAL '10 minutes'),
  (10,'06279c69-42d5-47db-83a5-3ef6789f055c', 'Gibt es Parkplätze dort?',         NOW() - INTERVAL '3 days' + INTERVAL '15 minutes'),
  (10,'0ed1d80d-65a8-4de7-8d98-6167a78ab3d4', 'Ja, direkt vor der Halle',        NOW() - INTERVAL '3 days' + INTERVAL '18 minutes'),

  -- Sunset Ping Pong (event_id=8)
  (8, '887befe0-2930-4842-adc9-f8b3d302630a', 'Mainkai bei Sonnenuntergang 🌅 – wer kommt?', NOW() - INTERVAL '7 days'),
  (8, '06279c69-42d5-47db-83a5-3ef6789f055c', 'Ich! Muss ich Schläger mitbringen?',          NOW() - INTERVAL '7 days' + INTERVAL '5 minutes'),
  (8, '887befe0-2930-4842-adc9-f8b3d302630a', 'Ich habe genug für alle',                     NOW() - INTERVAL '7 days' + INTERVAL '8 minutes'),
  (8, '0ed1d80d-65a8-4de7-8d98-6167a78ab3d4', 'Perfekt, bis dann! 🌟',                      NOW() - INTERVAL '7 days' + INTERVAL '12 minutes')

ON CONFLICT DO NOTHING;


-- ── Direktnachrichten ─────────────────────────────────────────────────
-- Nur zwischen Spielpartnern (accepted connections)

INSERT INTO public.direct_messages (sender_id, receiver_id, message, created_at, read_at)
VALUES
  -- Micha ↔ Sarah
  ('887befe0-2930-4842-adc9-f8b3d302630a',
   '06279c69-42d5-47db-83a5-3ef6789f055c',
   'Hey Sarah, wann passt dir das nächste Match?',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '30 minutes'),

  ('06279c69-42d5-47db-83a5-3ef6789f055c',
   '887befe0-2930-4842-adc9-f8b3d302630a',
   'Hallo! Vielleicht Samstag Nachmittag? 🏓',
   NOW() - INTERVAL '3 days' + INTERVAL '35 minutes', NOW() - INTERVAL '3 days' + INTERVAL '1 hour'),

  ('887befe0-2930-4842-adc9-f8b3d302630a',
   '06279c69-42d5-47db-83a5-3ef6789f055c',
   'Passt super, sagen wir 15 Uhr am Stadtpark?',
   NOW() - INTERVAL '3 days' + INTERVAL '1 hour 5 minutes', NOW() - INTERVAL '3 days' + INTERVAL '2 hours'),

  ('06279c69-42d5-47db-83a5-3ef6789f055c',
   '887befe0-2930-4842-adc9-f8b3d302630a',
   'Top, bin dabei! 👍',
   NOW() - INTERVAL '3 days' + INTERVAL '2 hours 10 minutes', NOW() - INTERVAL '2 days'),

  -- Micha ↔ Lukas
  ('25ee1df3-35ec-47f5-873d-b951b63e5706',
   '887befe0-2930-4842-adc9-f8b3d302630a',
   'Micha, hast du Zeit für ein Wertungsspiel diese Woche?',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '20 minutes'),

  ('887befe0-2930-4842-adc9-f8b3d302630a',
   '25ee1df3-35ec-47f5-873d-b951b63e5706',
   'Klar! Mittwoch Abend würde bei mir passen ⚡',
   NOW() - INTERVAL '1 day' + INTERVAL '25 minutes', NULL)  -- noch ungelesen

ON CONFLICT DO NOTHING;
