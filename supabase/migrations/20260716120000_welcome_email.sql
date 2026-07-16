-- ════════════════════════════════════════════════════════════════════════════
-- Welcome-E-Mail-Infrastruktur (v2)
-- Serverseitig, idempotent, status-basiert, Vault-gesichert
-- ════════════════════════════════════════════════════════════════════════════

-- pg_net für asynchrone HTTP-Calls aus DB-Triggern
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── E-Mail-Versand-Protokoll ─────────────────────────────────────────────────
-- Status-Ablauf: pending → sending → sent | failed
-- UNIQUE(user_id, email_type) verhindert strukturell doppelte Einträge.
-- Referenz auf auth.users (nicht profiles) → kein unbeabsichtigtes Löschen
--   wenn ein Profil gelöscht und neu angelegt wird (Trigger feuert erneut,
--   aber email_deliveries-Eintrag bleibt bestehen → kein zweiter Versand).

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type       text        NOT NULL,
  provider         text,
  provider_message_id  text,
  status               text        NOT NULL DEFAULT 'pending',
  attempt_count        integer     NOT NULL DEFAULT 0,
  last_attempt_at      timestamptz,
  sent_at              timestamptz,
  last_error           text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_email_delivery        UNIQUE (user_id, email_type),
  CONSTRAINT chk_email_delivery_status CHECK (status IN ('pending','sending','sent','failed'))
);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- Eigene Einträge lesen — kein Schreiben über Client (anon / authenticated)
-- Alle Schreibvorgänge laufen über SECURITY DEFINER-Funktionen oder Service Role.
CREATE POLICY "email_deliveries_select_own" ON public.email_deliveries
  FOR SELECT USING (auth.uid() = user_id);

-- ── Shortcut-Spalte auf profiles ─────────────────────────────────────────────
-- Nur nach erfolgreichem Versand gesetzt (nie spekulativ).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

-- ── Atomische Claim-Funktion ─────────────────────────────────────────────────
-- Gibt die Delivery-ID zurück, wenn dieser Aufruf den Versand übernehmen darf.
-- Gibt NULL zurück, wenn:
--   • status = 'sent'              → bereits versendet, kein Retry
--   • status = 'sending' innerhalb des Timeouts → anderer Prozess aktiv
-- Retry erlaubt wenn:
--   • status = 'failed'
--   • status = 'sending' und last_attempt_at älter als p_timeout_mins Minuten

CREATE OR REPLACE FUNCTION public.attempt_email_delivery(
  p_user_id      uuid,
  p_email_type   text,
  p_provider     text,
  p_timeout_mins integer DEFAULT 5
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- Erstversuch: neuen Eintrag anlegen
  INSERT INTO public.email_deliveries
    (user_id, email_type, provider, status, attempt_count, last_attempt_at)
  VALUES
    (p_user_id, p_email_type, p_provider, 'sending', 1, now())
  ON CONFLICT (user_id, email_type) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Folgeversuch: nur wenn Retry erlaubt (failed oder veraltetes sending)
  UPDATE public.email_deliveries
  SET
    status          = 'sending',
    attempt_count   = attempt_count + 1,
    last_attempt_at = now(),
    last_error      = NULL
  WHERE user_id    = p_user_id
    AND email_type = p_email_type
    AND (
      status = 'failed'
      OR (
        status = 'sending'
        AND last_attempt_at < now() - (p_timeout_mins || ' minutes')::interval
      )
    )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Trigger-Funktion ─────────────────────────────────────────────────────────
-- Feuert nach jedem INSERT auf profiles.
-- Startet pg_net-Request zur Edge Function (fire-and-forget, asynchron).
-- Fehler brechen den profiles-INSERT niemals ab.

-- HINWEIS: Das Secret wird direkt im Funktionskörper gespeichert (Free-Plan-Lösung).
-- Nicht in Git commiten — nach dem Ausführen der Migration im SQL Editor manuell
-- durch CREATE OR REPLACE FUNCTION mit dem echten Secret ersetzen.
-- Nur DB-Admins können den Funktionskörper lesen (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public._notify_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url    text := 'https://quelfdpqvzgnnvpuwljq.supabase.co/functions/v1/send-welcome-email';
  _secret text := '';  -- Im SQL Editor durch dein echtes Secret ersetzen
BEGIN
  IF _secret = '' THEN
    RAISE WARNING '_notify_welcome_email: Kein Secret konfiguriert.';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', _secret
    ),
    body    := jsonb_build_object('user_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '_notify_welcome_email: % — %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

-- Trigger nur auf echtem INSERT (nicht auf ON CONFLICT DO UPDATE)
DROP TRIGGER IF EXISTS tr_profile_welcome_email ON public.profiles;
CREATE TRIGGER tr_profile_welcome_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_welcome_email();

-- ════════════════════════════════════════════════════════════════════════════
-- EINMALIGE SETUP-SCHRITTE (nicht Teil dieser Migration)
-- Separat im Supabase SQL Editor ausführen:
--
-- 1. Secret generieren: openssl rand -hex 32
--
-- 2. _notify_welcome_email() mit echtem Secret neu anlegen (siehe oben, _secret ersetzen)
--
-- 3. Function Secrets setzen:
--      npx supabase secrets set WELCOME_HOOK_SECRET=dein-secret RESEND_API_KEY=re_... \
--        --project-ref quelfdpqvzgnnvpuwljq
-- ════════════════════════════════════════════════════════════════════════════
