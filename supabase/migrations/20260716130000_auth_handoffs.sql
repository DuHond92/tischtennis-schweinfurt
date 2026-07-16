-- auth_handoffs: kurzlebige OAuth-Sessions für den iOS-PWA ↔ Safari Handoff.
--
-- iOS 16.4+ isoliert localStorage zwischen Safari und installierter PWA (gleiche Origin).
-- Die Callback-Seite läuft in Safari, legt Tokens hier ab (via auth-handoff Edge Function).
-- Die PWA löst den handoff_key nach Rückkehr aus Safari ein.
--
-- Sicherheit:
--   • handoff_key ist ein UUID v4 (122 Bit Entropie, nicht ratbar)
--   • expires_at: 5 Minuten ab Erstellung
--   • redeemed_at: einmaliger Einlösung (zweites Einlösen gibt 410)
--   • Kein Client-Zugriff (nur Edge Function mit Service Role)

CREATE TABLE IF NOT EXISTS public.auth_handoffs (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  handoff_key   text        NOT NULL UNIQUE,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  user_id       uuid        NOT NULL,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  redeemed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Kein direkter Client-Zugriff — ausschließlich über Edge Function (Service Role)
ALTER TABLE public.auth_handoffs ENABLE ROW LEVEL SECURITY;
