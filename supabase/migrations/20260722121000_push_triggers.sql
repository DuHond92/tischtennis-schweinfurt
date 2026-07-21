-- ════════════════════════════════════════════════════════════════════════════
-- Push-Trigger-Funktionen
-- Feuern bei DB-Ereignissen, rufen send-push Edge Function via pg_net auf.
-- Fehler brechen NIEMALS die auslösende Transaktion ab (EXCEPTION-Guard).
-- Secret: leer lassen — nach Deploy im SQL Editor durch echtes Secret ersetzen.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Hilfsfunktion: pg_net-HTTP-Call ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._push_send(
  p_secret     text,
  p_recipients text[],
  p_exclude    text,
  p_title      text,
  p_body       text,
  p_data       jsonb,
  p_pref_key   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_secret = '' OR p_recipients IS NULL OR array_length(p_recipients, 1) = 0 THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := 'https://quelfdpqvzgnnvpuwljq.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', p_secret
    ),
    body    := jsonb_build_object(
      'recipient_ids',   to_jsonb(p_recipients),
      'exclude_user_id', p_exclude,
      'title',           p_title,
      'body',            p_body,
      'data',            p_data,
      'pref_key',        p_pref_key
    )
  );
END;
$$;

-- ── 1. Chat-Nachricht → alle Teilnehmer außer Absender ───────────────────────
CREATE OR REPLACE FUNCTION public._push_on_event_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret     text := '';  -- Im SQL Editor durch PUSH_HOOK_SECRET ersetzen
  v_sender     text;
  v_ev_title   text;
  v_recipients text[];
BEGIN
  SELECT username  INTO v_sender   FROM public.profiles WHERE id = NEW.user_id;
  SELECT title     INTO v_ev_title FROM public.events   WHERE id = NEW.event_id;
  SELECT array_agg(p.user_id::text)
    INTO v_recipients
    FROM public.event_participants p
   WHERE p.event_id = NEW.event_id AND p.user_id != NEW.user_id;

  PERFORM public._push_send(
    v_secret, v_recipients, NEW.user_id::text,
    COALESCE(v_sender, 'Jemand') || COALESCE(' • ' || v_ev_title, ''),
    left(NEW.message, 120),
    jsonb_build_object('type', 'message', 'event_id', NEW.event_id::text),
    'pref_messages'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_event_message: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_event_message ON public.event_messages;
CREATE TRIGGER tr_push_event_message
  AFTER INSERT ON public.event_messages
  FOR EACH ROW EXECUTE FUNCTION public._push_on_event_message();

-- ── 2. Spielrunden-Beitritt → Ersteller ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._push_on_participant_join() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret    text := '';
  v_joiner    text;
  v_creator   uuid;
  v_ev_title  text;
BEGIN
  SELECT creator_id, title INTO v_creator, v_ev_title FROM public.events WHERE id = NEW.event_id;
  IF v_creator IS NULL OR v_creator = NEW.user_id THEN RETURN NEW; END IF;

  SELECT username INTO v_joiner FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public._push_send(
    v_secret, ARRAY[v_creator::text], NEW.user_id::text,
    COALESCE(v_joiner, 'Jemand') || ' ist beigetreten',
    COALESCE(v_ev_title, 'Spielrunde'),
    jsonb_build_object('type', 'game_joined', 'event_id', NEW.event_id::text),
    'pref_game_activity'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_participant_join: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_participant_join ON public.event_participants;
CREATE TRIGGER tr_push_participant_join
  AFTER INSERT ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public._push_on_participant_join();

-- ── 3. Spielrunden-Austritt → Ersteller ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._push_on_participant_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret    text := '';
  v_leaver    text;
  v_creator   uuid;
  v_ev_title  text;
BEGIN
  SELECT creator_id, title INTO v_creator, v_ev_title FROM public.events WHERE id = OLD.event_id;
  IF v_creator IS NULL OR v_creator = OLD.user_id THEN RETURN OLD; END IF;

  SELECT username INTO v_leaver FROM public.profiles WHERE id = OLD.user_id;

  PERFORM public._push_send(
    v_secret, ARRAY[v_creator::text], OLD.user_id::text,
    COALESCE(v_leaver, 'Jemand') || ' hat das Spiel verlassen',
    COALESCE(v_ev_title, 'Spielrunde'),
    jsonb_build_object('type', 'game_left', 'event_id', OLD.event_id::text),
    'pref_game_activity'
  );
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_participant_leave: % %', SQLSTATE, SQLERRM;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS tr_push_participant_leave ON public.event_participants;
CREATE TRIGGER tr_push_participant_leave
  AFTER DELETE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public._push_on_participant_leave();

-- ── 4. Spielpartner-Anfrage → Empfänger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._push_on_connection_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret    text := '';
  v_requester text;
BEGIN
  SELECT username INTO v_requester FROM public.profiles WHERE id = NEW.requester_id;

  PERFORM public._push_send(
    v_secret, ARRAY[NEW.receiver_id::text], NEW.requester_id::text,
    'Neue Spielpartner-Anfrage',
    COALESCE(v_requester, 'Jemand') || ' möchte mit dir spielen',
    jsonb_build_object('type', 'connection_request', 'user_id', NEW.requester_id::text),
    'pref_connections'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_connection_request: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_connection_request ON public.player_connections;
CREATE TRIGGER tr_push_connection_request
  AFTER INSERT ON public.player_connections
  FOR EACH ROW EXECUTE FUNCTION public._push_on_connection_request();

-- ── 5. Spielpartner-Anfrage angenommen → Anfragender ─────────────────────────
CREATE OR REPLACE FUNCTION public._push_on_connection_accepted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret   text := '';
  v_acceptor text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_acceptor FROM public.profiles WHERE id = NEW.receiver_id;

  PERFORM public._push_send(
    v_secret, ARRAY[NEW.requester_id::text], NEW.receiver_id::text,
    'Spielpartner-Anfrage angenommen',
    COALESCE(v_acceptor, 'Jemand') || ' hat deine Anfrage angenommen',
    jsonb_build_object('type', 'connection_accepted', 'user_id', NEW.receiver_id::text),
    'pref_connections'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_connection_accepted: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_connection_accepted ON public.player_connections;
CREATE TRIGGER tr_push_connection_accepted
  AFTER UPDATE ON public.player_connections
  FOR EACH ROW EXECUTE FUNCTION public._push_on_connection_accepted();

-- ── 6. Spiel abgesagt oder geändert → alle Teilnehmer ───────────────────────
CREATE OR REPLACE FUNCTION public._push_on_event_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret     text := '';
  v_recipients text[];
  v_is_cancel  boolean;
  v_title_msg  text;
  v_body_msg   text;
BEGIN
  -- Nur bei Status-Änderung auf 'cancelled' oder Zeit/Ort-Änderung reagieren
  v_is_cancel := (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status);
  IF NOT v_is_cancel
     AND OLD.event_date IS NOT DISTINCT FROM NEW.event_date
     AND OLD.event_time IS NOT DISTINCT FROM NEW.event_time
  THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(p.user_id::text)
    INTO v_recipients
    FROM public.event_participants p
   WHERE p.event_id = NEW.id AND p.user_id != NEW.creator_id;

  IF v_is_cancel THEN
    v_title_msg := 'Spiel wurde abgesagt';
    v_body_msg  := COALESCE(NEW.title, 'Eine Spielrunde') || ' wurde leider abgesagt';
  ELSE
    v_title_msg := 'Spiel wurde geändert';
    v_body_msg  := COALESCE(NEW.title, 'Eine Spielrunde') || ': Neuer Termin oder Uhrzeit';
  END IF;

  PERFORM public._push_send(
    v_secret, v_recipients, NEW.creator_id::text,
    v_title_msg, v_body_msg,
    jsonb_build_object('type', CASE WHEN v_is_cancel THEN 'event_cancelled' ELSE 'event_changed' END,
                       'event_id', NEW.id::text),
    'pref_reminders'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_event_changed: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_event_changed ON public.events;
CREATE TRIGGER tr_push_event_changed
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._push_on_event_changed();

-- ── 7. System-Notification (Plattenmoderation) → Push ────────────────────────
CREATE OR REPLACE FUNCTION public._push_on_system_notif() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret   text := '';
  v_pref_key text;
BEGIN
  v_pref_key := CASE NEW.type
    WHEN 'suggestion_approved'          THEN 'pref_moderation'
    WHEN 'suggestion_rejected'          THEN 'pref_moderation'
    WHEN 'suggestion_requires_changes'  THEN 'pref_moderation'
    WHEN 'report_resolved'              THEN 'pref_community'
    ELSE NULL
  END;

  IF v_pref_key IS NULL THEN RETURN NEW; END IF;

  PERFORM public._push_send(
    v_secret, ARRAY[NEW.user_id::text], NULL,
    COALESCE(NEW.title, 'Plattentreff'),
    COALESCE(NEW.body, ''),
    jsonb_build_object('type', NEW.type, 'notification_id', NEW.id::text),
    v_pref_key
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_push_on_system_notif: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tr_push_system_notif ON public.notifications;
CREATE TRIGGER tr_push_system_notif
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._push_on_system_notif();

-- ════════════════════════════════════════════════════════════════════════════
-- NACH DEPLOY: In jeder Trigger-Funktion und _push_send das Secret setzen.
-- Empfehlung: alle Funktionen per CREATE OR REPLACE mit echtem Secret neu anlegen.
-- Beispiel für _push_send:
--   v_secret text := 'dein-echtes-secret';
-- ════════════════════════════════════════════════════════════════════════════
