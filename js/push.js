// ╔══════════════════════════════════════════════════════════════╗
// ║           PUSH NOTIFICATIONS                                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nutzt @capacitor/push-notifications (nur nativer Kontext).
// PWA-Browser: alle Funktionen laufen als No-Ops.
//
// Ablauf:
//  1. initPush()             — nach Login aufrufen
//  2. showPushPermissionPrompt(ctx) — kontextuell (nach Spiel-Erstellen/-Beitreten)
//  3. requestPushPermission() — nach Nutzer-Zustimmung, fragt native Berechtigung
//  4. Token → push_tokens-Tabelle → DB-Trigger → send-push Edge Function → APNs

// ── Interner State ─────────────────────────────────────────────────────────────

let _pushRegistered      = false;
let _pushCurrentToken    = '';
let _pushPrefs           = null;   // Aktueller Ladestand aus notification_preferences
let _pendingPushNav      = null;   // Navigation, die nach App-Start noch ausstehend ist

// ── Plattform-Guard ────────────────────────────────────────────────────────────

function _isNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

function _getPushPlugin() {
  return window.Capacitor?.Plugins?.PushNotifications ?? null;
}

// ── Token bei Supabase registrieren ───────────────────────────────────────────

async function _savePushToken(token) {
  if (!token || !sb.isLoggedIn()) return;
  _pushCurrentToken = token;
  const platform = Capacitor.getPlatform?.() ?? 'ios';
  try {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/rpc/upsert_push_token`, {
      method:  'POST',
      headers: { ...dbHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ p_token: token, p_platform: platform }),
    });
  } catch (e) {
    if (window.PT_DEBUG) console.warn('[push] _savePushToken:', e);
  }
}

async function _deletePushToken(token) {
  const t = token || _pushCurrentToken;
  if (!t || !sb.isLoggedIn()) return;
  try {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/rpc/delete_push_token`, {
      method:  'POST',
      headers: { ...dbHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ p_token: t }),
    });
  } catch (e) {
    if (window.PT_DEBUG) console.warn('[push] _deletePushToken:', e);
  }
}

// ── Listener registrieren ─────────────────────────────────────────────────────

function _registerPushListeners(plugin) {
  plugin.addListener('registration', ({ value }) => {
    _savePushToken(value);
  });

  plugin.addListener('registrationError', (err) => {
    if (window.PT_DEBUG) console.warn('[push] registrationError:', err);
  });

  // Vordergrund-Notification: als In-App-Hinweis anzeigen
  plugin.addListener('pushNotificationReceived', (notification) => {
    const title = notification.title || 'Plattentreff';
    const body  = notification.body  || '';
    if (typeof showSnackbar === 'function') {
      showSnackbar({ title, message: body, type: 'info', duration: 5000 });
    }
  });

  // Notification angetippt (App war geschlossen oder im Hintergrund)
  plugin.addListener('pushNotificationActionPerformed', (action) => {
    const data = action?.notification?.data ?? {};
    if (window._eventsLoaded) {
      navigateFromPushData(data);
    } else {
      _pendingPushNav = data;
    }
  });
}

// ── Berechtigung anfragen + registrieren ──────────────────────────────────────

async function requestPushPermission() {
  const plugin = _getPushPlugin();
  if (!plugin) return;

  let status;
  try {
    status = await plugin.checkPermissions();
  } catch { return; }

  if (status?.receive === 'denied') {
    showSnackbar({
      title:   'Push-Benachrichtigungen gesperrt',
      message: 'Bitte aktiviere sie in den Systemeinstellungen unter Mitteilungen.',
      type:    'info',
      action:  { label: 'Einstellungen', fn: () => {
        if (window.Capacitor?.Plugins?.NativeSettings) {
          window.Capacitor.Plugins.NativeSettings.open({ optionAndroid: 'APPLICATION_DETAILS', optionIOS: 'APP' });
        }
      }},
    });
    _updatePushSettingsUi();
    return;
  }

  if (status?.receive !== 'granted') {
    try {
      status = await plugin.requestPermissions();
    } catch { return; }
  }

  if (status?.receive === 'granted') {
    localStorage.setItem('push_asked', '1');
    await plugin.register();
  } else {
    localStorage.setItem('push_asked', '1');
    _updatePushSettingsUi();
  }
}

// ── Initialisierung (nach Login) ──────────────────────────────────────────────

async function initPush() {
  if (!_isNative()) return;
  const plugin = _getPushPlugin();
  if (!plugin) return;
  if (_pushRegistered) return;
  _pushRegistered = true;

  _registerPushListeners(plugin);

  // Falls Berechtigung bereits vorhanden: sofort registrieren
  try {
    const status = await plugin.checkPermissions();
    if (status?.receive === 'granted') {
      await plugin.register();
    }
  } catch {}

  await loadPushPrefs();
}

// ── Push bei Logout entfernen ─────────────────────────────────────────────────

async function deinitPush() {
  if (!_isNative() || !_pushCurrentToken) return;
  await _deletePushToken(_pushCurrentToken);
  _pushCurrentToken = '';
  _pushRegistered   = false;
  _pushPrefs        = null;
}

// ── Pending-Navigation nach App-Start auflösen ────────────────────────────────
// Wird aus main.js nach vollständigem Datenladen aufgerufen.

function handlePendingPushNav() {
  if (!_pendingPushNav) return;
  const data = _pendingPushNav;
  _pendingPushNav = null;
  navigateFromPushData(data);
}

// ── Deep-Link-Routing ─────────────────────────────────────────────────────────

function navigateFromPushData(data) {
  if (!data?.type) return;
  closeAllSheets();

  switch (data.type) {

    case 'message': {
      const eventId = parseInt(data.event_id);
      if (!eventId) return;
      if (allPlayerSearches?.some(ps => ps.id === eventId)) {
        showPage('events');
        showPlayerSearchDetail(eventId);
      } else {
        showPage('events');
        if (typeof showEventDetail === 'function') showEventDetail(eventId);
      }
      break;
    }

    case 'game_joined':
    case 'game_left':
    case 'event_changed':
    case 'event_cancelled': {
      const eventId = parseInt(data.event_id);
      if (!eventId) return;
      showPage('events');
      if (typeof showEventDetail === 'function') showEventDetail(eventId);
      break;
    }

    case 'connection_request':
    case 'connection_accepted': {
      showPage('profile');
      if (typeof openConnectionsSheet === 'function') openConnectionsSheet();
      break;
    }

    case 'suggestion_approved':
    case 'suggestion_rejected':
    case 'suggestion_requires_changes': {
      showPage('profile');
      if (typeof openMySuggestionsSheet === 'function') openMySuggestionsSheet();
      break;
    }

    case 'report_resolved': {
      showPage('profile');
      if (typeof openNotifSheet === 'function') openNotifSheet();
      break;
    }
  }
}

// ── Kontextueller Berechtigungs-Prompt ───────────────────────────────────────
// Zeigt einen kurzen In-App-Hinweis, bevor die native Systemabfrage erscheint.
// ctx: 'game_created' | 'game_joined' — bestimmt den Wording-Text.

function showPushPermissionPrompt(ctx) {
  if (!_isNative()) return;
  if (localStorage.getItem('push_asked')) return;

  const prompt = document.getElementById('push-permission-prompt');
  if (!prompt) return;

  const msg = ctx === 'game_created'
    ? 'Soll Plattentreff dich informieren, wenn jemand deinem Spiel beitritt oder dir schreibt?'
    : 'Möchtest du informiert werden, wenn jemand im Chat schreibt oder das Spiel geändert wird?';

  const msgEl = prompt.querySelector('#push-prompt-msg');
  if (msgEl) msgEl.textContent = msg;

  prompt.hidden = false;
  requestAnimationFrame(() => prompt.classList.add('is-visible'));
}

function dismissPushPrompt() {
  const prompt = document.getElementById('push-permission-prompt');
  if (!prompt) return;
  localStorage.setItem('push_asked', '1');
  prompt.classList.remove('is-visible');
  setTimeout(() => { prompt.hidden = true; }, 320);
}

function acceptPushPrompt() {
  dismissPushPrompt();
  requestPushPermission();
}

// ── Präferenzen laden/speichern ───────────────────────────────────────────────

async function loadPushPrefs() {
  if (!sb.isLoggedIn()) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${sb.getUserId()}&select=*`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    _pushPrefs = Array.isArray(data) && data.length ? data[0] : _defaultPushPrefs();
  } catch {
    _pushPrefs = _defaultPushPrefs();
  }
  _updatePushSettingsUi();
}

function _defaultPushPrefs() {
  return {
    push_enabled:       true,
    pref_messages:      true,
    pref_connections:   true,
    pref_game_activity: true,
    pref_comments:      true,
    pref_moderation:    true,
    pref_reminders:     true,
    pref_community:     true,
  };
}

async function savePushPrefs(partial) {
  if (!sb.isLoggedIn()) return;
  _pushPrefs = { ...(_pushPrefs || _defaultPushPrefs()), ...partial };
  _updatePushSettingsUi();
  try {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/notification_preferences`, {
      method:  'POST',
      headers: { ...dbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({ user_id: sb.getUserId(), ..._pushPrefs, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    if (window.PT_DEBUG) console.warn('[push] savePushPrefs:', e);
  }
}

// Toggle aus UI: Hauptschalter oder einzelne Präferenz
function onPushPrefChange(key, value) {
  if (key === 'push_enabled' && value && _isNative()) {
    requestPushPermission();
  }
  savePushPrefs({ [key]: value });
}

// ── Push-Settings-UI aktualisieren ────────────────────────────────────────────

function _updatePushSettingsUi() {
  if (!_pushPrefs) return;
  const prefs = _pushPrefs;
  const setToggle = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };
  setToggle('push-toggle-main',    prefs.push_enabled);
  setToggle('push-toggle-msgs',    prefs.pref_messages);
  setToggle('push-toggle-conn',    prefs.pref_connections);
  setToggle('push-toggle-game',    prefs.pref_game_activity);
  setToggle('push-toggle-comment', prefs.pref_comments);
  setToggle('push-toggle-mod',     prefs.pref_moderation);
  setToggle('push-toggle-remind',  prefs.pref_reminders);
  setToggle('push-toggle-comm',    prefs.pref_community);

  // Unter-Schalter sperren wenn Push global deaktiviert
  const subSection = document.getElementById('push-sub-prefs');
  if (subSection) subSection.classList.toggle('is-disabled', !prefs.push_enabled);

  // Systemeinstellungs-Hinweis: nur zeigen wenn Permission verweigert wurde
  _checkPushPermissionHint();
}

async function _checkPushPermissionHint() {
  const hint = document.getElementById('push-permission-hint');
  if (!hint) return;
  if (!_isNative()) { hint.hidden = true; return; }
  const plugin = _getPushPlugin();
  if (!plugin) { hint.hidden = true; return; }
  try {
    const status = await plugin.checkPermissions();
    hint.hidden = status?.receive !== 'denied';
  } catch {
    hint.hidden = true;
  }
}

// ── Push-Settings-Sheet öffnen ────────────────────────────────────────────────

function openPushSettingsSheet() {
  if (!sb.isLoggedIn()) return;
  loadPushPrefs();
  openSheet('push-settings-sheet');
}
