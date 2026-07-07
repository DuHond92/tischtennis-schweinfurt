-- ── PlattenTreff Product Analytics — Admin SQL Queries ───────────────────────
-- Ausführung: Supabase Dashboard → SQL Editor (Service Role)
-- Tabelle: public.analytics_events

-- ── 1. Events pro Tag (letzte 30 Tage) ───────────────────────────────────────
SELECT
  created_at::date          AS day,
  event_name,
  count(*)                  AS total
FROM public.analytics_events
WHERE created_at >= now() - interval '30 days'
GROUP BY day, event_name
ORDER BY day DESC, total DESC;

-- ── 2. App Opens pro Tag ──────────────────────────────────────────────────────
SELECT
  created_at::date          AS day,
  count(*)                  AS app_opens,
  count(DISTINCT session_id) AS sessions,
  count(DISTINCT user_id)   AS unique_users
FROM public.analytics_events
WHERE event_name = 'app_open'
  AND created_at >= now() - interval '30 days'
GROUP BY day
ORDER BY day DESC;

-- ── 3. Registrierungen und Logins pro Tag ─────────────────────────────────────
SELECT
  created_at::date          AS day,
  sum(CASE WHEN event_name = 'signup_completed' THEN 1 ELSE 0 END) AS signups,
  sum(CASE WHEN event_name = 'login_completed'  THEN 1 ELSE 0 END) AS logins
FROM public.analytics_events
WHERE event_name IN ('signup_completed', 'login_completed')
  AND created_at >= now() - interval '30 days'
GROUP BY day
ORDER BY day DESC;

-- ── 4. Plattenvorschläge pro Woche ───────────────────────────────────────────
SELECT
  date_trunc('week', created_at)::date  AS week_start,
  sum(CASE WHEN event_name = 'plate_suggest_started'   THEN 1 ELSE 0 END) AS started,
  sum(CASE WHEN event_name = 'plate_suggest_submitted' THEN 1 ELSE 0 END) AS submitted
FROM public.analytics_events
WHERE event_name IN ('plate_suggest_started', 'plate_suggest_submitted')
  AND created_at >= now() - interval '90 days'
GROUP BY week_start
ORDER BY week_start DESC;

-- ── 5. Conversion: plate_suggest_started → plate_suggest_submitted ─────────
SELECT
  count(DISTINCT CASE WHEN event_name = 'plate_suggest_started'   THEN session_id END) AS sessions_started,
  count(DISTINCT CASE WHEN event_name = 'plate_suggest_submitted' THEN session_id END) AS sessions_submitted,
  round(
    100.0 * count(DISTINCT CASE WHEN event_name = 'plate_suggest_submitted' THEN session_id END)
           / nullif(count(DISTINCT CASE WHEN event_name = 'plate_suggest_started' THEN session_id END), 0),
    1
  ) AS conversion_pct
FROM public.analytics_events
WHERE event_name IN ('plate_suggest_started', 'plate_suggest_submitted')
  AND created_at >= now() - interval '30 days';

-- ── 6. Erstellte Spielrunden pro Woche ───────────────────────────────────────
SELECT
  date_trunc('week', created_at)::date  AS week_start,
  sum(CASE WHEN event_name = 'game_create_started' THEN 1 ELSE 0 END) AS started,
  sum(CASE WHEN event_name = 'game_created'        THEN 1 ELSE 0 END) AS created
FROM public.analytics_events
WHERE event_name IN ('game_create_started', 'game_created')
  AND created_at >= now() - interval '90 days'
GROUP BY week_start
ORDER BY week_start DESC;

-- ── 7. Conversion: game_create_started → game_created ────────────────────────
SELECT
  count(DISTINCT CASE WHEN event_name = 'game_create_started' THEN session_id END) AS sessions_started,
  count(DISTINCT CASE WHEN event_name = 'game_created'        THEN session_id END) AS sessions_created,
  round(
    100.0 * count(DISTINCT CASE WHEN event_name = 'game_created' THEN session_id END)
           / nullif(count(DISTINCT CASE WHEN event_name = 'game_create_started' THEN session_id END), 0),
    1
  ) AS conversion_pct
FROM public.analytics_events
WHERE event_name IN ('game_create_started', 'game_created')
  AND created_at >= now() - interval '30 days';

-- ── 8. Mitspieler-Gesuche pro Woche ─────────────────────────────────────────
SELECT
  date_trunc('week', created_at)::date  AS week_start,
  count(*)                              AS player_searches
FROM public.analytics_events
WHERE event_name = 'player_search_created'
  AND created_at >= now() - interval '90 days'
GROUP BY week_start
ORDER BY week_start DESC;

-- ── 9. Aktive Nutzer (grob) ───────────────────────────────────────────────────
-- DAU: Distinct user_ids pro Tag
SELECT
  created_at::date          AS day,
  count(DISTINCT user_id)   AS dau
FROM public.analytics_events
WHERE user_id IS NOT NULL
  AND created_at >= now() - interval '30 days'
GROUP BY day
ORDER BY day DESC;

-- WAU: Distinct user_ids pro Woche
SELECT
  date_trunc('week', created_at)::date  AS week_start,
  count(DISTINCT user_id)               AS wau
FROM public.analytics_events
WHERE user_id IS NOT NULL
  AND created_at >= now() - interval '90 days'
GROUP BY week_start
ORDER BY week_start DESC;

-- ── 10. Plattform-Aufteilung ─────────────────────────────────────────────────
SELECT
  platform,
  count(*)                              AS events,
  count(DISTINCT session_id)            AS sessions
FROM public.analytics_events
WHERE created_at >= now() - interval '30 days'
GROUP BY platform
ORDER BY events DESC;

-- ── 11. Top Events ────────────────────────────────────────────────────────────
SELECT
  event_name,
  count(*)                  AS total,
  count(DISTINCT user_id)   AS unique_users
FROM public.analytics_events
WHERE created_at >= now() - interval '30 days'
GROUP BY event_name
ORDER BY total DESC;

-- ── 12. Standortberechtigung: Grant/Deny-Rate ─────────────────────────────────
SELECT
  properties->>'source'     AS trigger_source,
  sum(CASE WHEN event_name = 'location_permission_granted' THEN 1 ELSE 0 END) AS granted,
  sum(CASE WHEN event_name = 'location_permission_denied'  THEN 1 ELSE 0 END) AS denied,
  sum(CASE WHEN event_name = 'location_permission_requested' THEN 1 ELSE 0 END) AS requested
FROM public.analytics_events
WHERE event_name IN (
  'location_permission_requested',
  'location_permission_granted',
  'location_permission_denied'
)
  AND created_at >= now() - interval '30 days'
GROUP BY trigger_source;

-- ── 13. Chat & Nachrichten ────────────────────────────────────────────────────
SELECT
  created_at::date          AS day,
  sum(CASE WHEN event_name = 'chat_opened'   THEN 1 ELSE 0 END) AS chats_opened,
  sum(CASE WHEN event_name = 'message_sent'  THEN 1 ELSE 0 END) AS messages_sent
FROM public.analytics_events
WHERE event_name IN ('chat_opened', 'message_sent')
  AND created_at >= now() - interval '30 days'
GROUP BY day
ORDER BY day DESC;

-- ── 14. Daten aufräumen (Retention: älter als 180 Tage) ──────────────────────
-- ACHTUNG: Löscht echte Daten. Vor Ausführung prüfen.
-- DELETE FROM public.analytics_events
-- WHERE created_at < now() - interval '180 days';
