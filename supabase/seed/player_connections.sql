-- ════════════════════════════════════════════════════════════════════════
-- SEED: player_connections
-- Beispiel-Spielpartner-Beziehungen zwischen den Testnutzern.
-- Voraussetzung: profiles.sql wurde bereits ausgeführt.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO public.player_connections (id, requester_id, receiver_id, status, created_at)
VALUES
  -- Micha ↔ Sarah (accepted)
  ('aaaaaaaa-0001-0000-0000-000000000001',
   '887befe0-2930-4842-adc9-f8b3d302630a',
   '06279c69-42d5-47db-83a5-3ef6789f055c',
   'accepted', NOW() - INTERVAL '20 days'),

  -- Micha ↔ Lukas (accepted)
  ('aaaaaaaa-0002-0000-0000-000000000001',
   '887befe0-2930-4842-adc9-f8b3d302630a',
   '25ee1df3-35ec-47f5-873d-b951b63e5706',
   'accepted', NOW() - INTERVAL '15 days'),

  -- Sarah ↔ Anna (accepted)
  ('aaaaaaaa-0003-0000-0000-000000000001',
   '06279c69-42d5-47db-83a5-3ef6789f055c',
   'fd93c5a1-2f06-4382-ad32-dbb802c37c6d',
   'accepted', NOW() - INTERVAL '10 days'),

  -- Felix → Max (pending, noch nicht angenommen)
  ('aaaaaaaa-0004-0000-0000-000000000001',
   'b8d984fb-73de-464a-b10c-798f16a3de35',
   '8710df1b-b15d-4dd2-82ee-82f8240ebf63',
   'pending', NOW() - INTERVAL '2 days'),

  -- Julia → Tom (accepted)
  ('aaaaaaaa-0005-0000-0000-000000000001',
   '0ed1d80d-65a8-4de7-8d98-6167a78ab3d4',
   '0544a0d5-5771-498b-81b8-aa98adc02e77',
   'accepted', NOW() - INTERVAL '5 days'),

  -- Lukas ↔ Felix (accepted)
  ('aaaaaaaa-0006-0000-0000-000000000001',
   '25ee1df3-35ec-47f5-873d-b951b63e5706',
   'b8d984fb-73de-464a-b10c-798f16a3de35',
   'accepted', NOW() - INTERVAL '8 days')

ON CONFLICT (id) DO NOTHING;
