-- ════════════════════════════════════════════════════════════════════════
-- SEED: profiles
-- Testnutzer für die Entwicklungsumgebung.
--
-- WICHTIG: profiles.id muss mit auth.users.id übereinstimmen.
-- In einer frischen Entwicklungsumgebung musst du diese Nutzer zuerst
-- über den Supabase Auth-Bereich anlegen (Authentication → Users → Add user)
-- und die generierten UUIDs hier eintragen.
--
-- Die UUIDs hier entsprechen dem aktuellen Entwicklungsstand auf
-- quelfdpqvzgnnvpuwljq.supabase.co (Stand: 2026-06-26).
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO public.profiles (id, username, avatar_emoji, skill_level, wins, losses, role)
VALUES
  ('887befe0-2930-4842-adc9-f8b3d302630a', 'Micha',   '🐧', 'profi',          15,  8, 'admin'),
  ('06279c69-42d5-47db-83a5-3ef6789f055c', 'Sarah',   '🏓', 'fortgeschritten', 10, 12, 'user'),
  ('25ee1df3-35ec-47f5-873d-b951b63e5706', 'Lukas',   '⚡', 'profi',           22,  6, 'moderator'),
  ('fd93c5a1-2f06-4382-ad32-dbb802c37c6d', 'Anna',    '🎯', 'fortgeschritten',  7,  9, 'user'),
  ('8710df1b-b15d-4dd2-82ee-82f8240ebf63', 'Max',     '🏓', 'anfaenger',       13, 11, 'user'),
  ('0ed1d80d-65a8-4de7-8d98-6167a78ab3d4', 'Julia',   '🌟', 'fortgeschritten', 18,  7, 'user'),
  ('0544a0d5-5771-498b-81b8-aa98adc02e77', 'Tom',     '🏓', 'anfaenger',        5, 14, 'user'),
  ('b8d984fb-73de-464a-b10c-798f16a3de35', 'Felix',   '🔥', 'profi',           28,  4, 'user'),
  ('781f9de3-366e-4f25-a96f-3d4b387a0220', 'Michael', '😎', 'fortgeschritten', 13, 11, 'user')
ON CONFLICT (id) DO UPDATE SET
  username    = EXCLUDED.username,
  avatar_emoji = EXCLUDED.avatar_emoji,
  skill_level = EXCLUDED.skill_level,
  wins        = EXCLUDED.wins,
  losses      = EXCLUDED.losses;
-- Rolle bewusst nicht überschrieben (DO UPDATE ohne role),
-- damit ein Moderator nicht versehentlich zurückgestuft wird.
