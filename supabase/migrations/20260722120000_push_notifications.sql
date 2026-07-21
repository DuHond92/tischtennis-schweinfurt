-- ════════════════════════════════════════════════════════════════════════════
-- Push-Notification-Infrastruktur
-- push_tokens: ein Token pro Gerät, mehrere Geräte pro Nutzer
-- notification_preferences: granulare Push-Einstellungen, serverseitig
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Push-Token-Speicherung ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  platform   text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_user_token_uq UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Nutzer darf eigene Tokens lesen (Edge Function nutzt Service Role)
CREATE POLICY "push_tokens_own_select" ON public.push_tokens
  FOR SELECT USING (auth.uid() = user_id);
-- Kein direktes INSERT/DELETE über Client — nur via SECURITY DEFINER Funktion
CREATE POLICY "push_tokens_own_delete" ON public.push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ── Benachrichtigungs-Präferenzen ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id            uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  push_enabled       boolean NOT NULL DEFAULT true,
  pref_messages      boolean NOT NULL DEFAULT true,
  pref_connections   boolean NOT NULL DEFAULT true,
  pref_game_activity boolean NOT NULL DEFAULT true,
  pref_comments      boolean NOT NULL DEFAULT true,
  pref_moderation    boolean NOT NULL DEFAULT true,
  pref_reminders     boolean NOT NULL DEFAULT true,
  pref_community     boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs_own" ON public.notification_preferences
  USING (auth.uid() = user_id);
CREATE POLICY "notif_prefs_own_insert" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_prefs_own_update" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- ── SECURITY DEFINER: Token upserten ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_token     text,
  p_platform  text,
  p_device_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_tokens (user_id, token, platform, device_id, updated_at)
  VALUES (auth.uid(), p_token, p_platform, p_device_id, now())
  ON CONFLICT (user_id, token) DO UPDATE SET
    platform   = EXCLUDED.platform,
    device_id  = EXCLUDED.device_id,
    updated_at = now();
END;
$$;

-- ── SECURITY DEFINER: Token löschen (Logout) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_push_token(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_tokens WHERE user_id = auth.uid() AND token = p_token;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- EINMALIGE SETUP-SCHRITTE (nicht Teil der Migration, im SQL Editor ausführen):
--
-- 1. Secret: openssl rand -hex 32
-- 2. Supabase Secret setzen:
--      npx supabase secrets set PUSH_HOOK_SECRET=<secret> \
--        APNS_KEY_P8="$(cat AuthKey_XXXXXXXXXX.p8)" \
--        APNS_KEY_ID=XXXXXXXXXX \
--        APNS_TEAM_ID=XXXXXXXXXX \
--        APNS_BUNDLE_ID=de.plattentreff.app \
--        APNS_ENV=sandbox \
--        --project-ref quelfdpqvzgnnvpuwljq
-- 3. Trigger-Funktionen (Migration 121000) mit echtem Secret neu anlegen
-- ════════════════════════════════════════════════════════════════════════════
