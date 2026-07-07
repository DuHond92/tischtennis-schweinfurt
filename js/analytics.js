// ╔══════════════════════════════════════════════════════════════╗
// ║           INTERNE NUTZUNGSANALYSE                            ║
// ║  Kein externes Tracking, kein Werbe-SDK, keine Cookies.      ║
// ║  Opt-out: localStorage 'pt_analytics_opt_out' = 'true'       ║
// ╚══════════════════════════════════════════════════════════════╝

const PTAnalytics = (() => {
  // ── Blockierte Property-Keys ─────────────────────────────────
  // Exact-match (^ und $): "comment_count", "photo_count", "has_photo" etc. passieren durch.
  // Geblockt werden nur die exakten Keys (z. B. "comment", "photo", "lat").
  const BLOCKED = /^(email|mail|name|phone|message|text|comment|description|bio|address|street|lat|lng|latitude|longitude|photo|image|avatar|birthday|birthdate|password|token)$/i;

  // ── Session-ID (pro Browser-Session, kein Fingerprinting) ────
  let _memSid = null;
  function _sid() {
    try {
      let id = sessionStorage.getItem('pt_session_id');
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : (Math.random().toString(36).slice(2) + Date.now().toString(36));
        sessionStorage.setItem('pt_session_id', id);
      }
      return id;
    } catch {
      if (!_memSid) _memSid = 'mem_' + Math.random().toString(36).slice(2);
      return _memSid;
    }
  }

  // ── Plattform ────────────────────────────────────────────────
  function _platform() {
    try {
      if (window.Capacitor?.getPlatform) return window.Capacitor.getPlatform();
    } catch {}
    return 'web';
  }

  // ── Opt-out prüfen ──────────────────────────────────────────
  function _enabled() {
    try { return localStorage.getItem('pt_analytics_opt_out') !== 'true'; } catch { return true; }
  }

  // ── Properties bereinigen ───────────────────────────────────
  function sanitize(props) {
    if (!props || typeof props !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      if (BLOCKED.test(k)) continue;
      if (v === null || v === undefined) continue;
      if (typeof v === 'object') continue;
      out[k] = v;
    }
    return out;
  }

  // ── HTTP-Versand (fire & forget) ─────────────────────────────
  async function _send(payload) {
    try {
      const token = (typeof sb !== 'undefined') ? sb.getToken() : null;
      const headers = {
        'apikey':       SUPABASE_ANON,
        'Content-Type': 'application/json',
        'Prefer':       'return=minimal'
      };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const r = await fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
        method: 'POST', headers, body: JSON.stringify(payload)
      });
      if (!r.ok && typeof location !== 'undefined' && location.hostname === 'localhost') {
        console.debug('[PTAnalytics]', payload.event_name, 'HTTP', r.status);
      }
    } catch (e) {
      if (typeof location !== 'undefined' && location.hostname === 'localhost') {
        console.debug('[PTAnalytics] send error:', e?.message);
      }
    }
  }

  // ── Öffentliche API ──────────────────────────────────────────
  function track(eventName, properties) {
    if (!_enabled()) return;
    const payload = {
      event_name:  eventName,
      session_id:  _sid(),
      user_id:     (typeof sb !== 'undefined') ? sb.getUserId() : null,
      platform:    _platform(),
      app_version: null,
      screen:      null,
      properties:  sanitize(properties || {})
    };
    Promise.resolve().then(() => _send(payload));
  }

  function setOptOut(value) {
    try {
      if (value) {
        localStorage.setItem('pt_analytics_opt_out', 'true');
      } else {
        localStorage.removeItem('pt_analytics_opt_out');
      }
    } catch {}
  }

  function isOptedOut() {
    try { return localStorage.getItem('pt_analytics_opt_out') === 'true'; } catch { return false; }
  }

  return { track, setOptOut, isOptedOut, sanitize };
})();
