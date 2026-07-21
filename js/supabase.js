// ╔══════════════════════════════════════════════════════════════╗
// ║           SUPABASE CONFIG                                    ║
// ╚══════════════════════════════════════════════════════════════╝
const SUPABASE_URL  = 'https://quelfdpqvzgnnvpuwljq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_pe9d7oJngP6p5vc5Y-ARgA_sd-zye12';

const APP_BASE_URL    = 'https://plattentreff.app';
const PRIVACY_URL     = APP_BASE_URL + '/datenschutz/';
const IMPRINT_URL     = APP_BASE_URL + '/impressum/';
const TOS_URL         = APP_BASE_URL + '/nutzungsbedingungen/';
const COMMUNITY_URL   = APP_BASE_URL + '/community-richtlinien/';

// JWT-Payload base64url-dekodieren (kein Verify — nur Lesen)
function _decodeJwtPayload(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

// Kleines Supabase-Client ohne npm – direkte fetch()-Wrapper
const sb = {
  // --- AUTH ---
  async signUp(email, password, username) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({ email, password, data:{ username } })
    });
    return r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if(data.access_token) {
      this._saveSession(data);
    }
    return data;
  },

  _saveSession(data) {
    localStorage.setItem('sb_token',         data.access_token);
    localStorage.setItem('sb_refresh_token', data.refresh_token);
    localStorage.setItem('sb_user_id',       data.user.id);
    localStorage.setItem('sb_email',         data.user.email);
    // Token läuft nach expires_in Sekunden ab (meist 3600 = 1h)
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    localStorage.setItem('sb_expires_at', expiresAt.toString());
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem('sb_refresh_token');
    if (typeof ptLog === 'function') ptLog('auth', 'refreshToken START', { hasRefreshToken: !!refreshToken });
    if(!refreshToken) {
      if (typeof ptLog === 'function') ptLog('auth', 'refreshToken SKIP — no refresh token');
      return false;
    }
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method:'POST', headers: authHeaders(),
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await r.json();
      if(data.access_token) {
        this._saveSession(data);
        if (typeof ptLog === 'function') ptLog('auth', 'refreshToken OK');
        if (window.PT_DEBUG || location.hostname === 'localhost') console.log('✅ Token automatisch erneuert');
        return true;
      }
      if (typeof ptLog === 'function') ptLog('auth', 'refreshToken FAILED — no access_token in response', { error: data.error });
    } catch(e) {
      if (typeof ptLogError === 'function') ptLogError('auth', 'refreshToken EXCEPTION', e);
      console.warn('Token refresh fehlgeschlagen', e);
    }
    return false;
  },

  async getValidToken() {
    const expiresAt = parseInt(localStorage.getItem('sb_expires_at') || '0');
    // Token erneuern wenn er in weniger als 5 Minuten abläuft
    if(Date.now() > expiresAt - 5 * 60 * 1000) {
      await this.refreshToken();
    }
    return localStorage.getItem('sb_token');
  },

  async resetPassword(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ email, redirect_to: redirectTo })
    });
    if(!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('Password reset error:', err);
    }
    return r.ok;
  },

  async updatePassword(newPassword) {
    const token = await this.getValidToken();
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT', headers: authHeaders(token),
      body: JSON.stringify({ password: newPassword })
    });
    return r.ok;
  },

  // OAuth-Redirect (Google, Apple, ...)
  // Nativ (iOS Capacitor): SFSafariViewController via @capacitor/browser + Custom-URL-Scheme.
  // PWA / Web: /auth/callback mit handoff_key — iOS 16.4+ isoliert Safari/PWA-localStorage,
  //   daher speichern wir einen pre-generierten handoff_key im PWA-localStorage und übergeben
  //   ihn als ?hk=-Parameter an die Callback-Seite. Diese ruft die auth-handoff Edge Function
  //   auf. Die PWA löst den Key nach der Rückkehr ein (kein localStorage-Sharing nötig).
  async signInWithOAuth(provider) {
    const isNative = !!(window.Capacitor?.isNativePlatform?.());
    const isLocal  = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    let redirectTo;
    if (isNative) {
      redirectTo = encodeURIComponent('de.plattentreff.app://login-callback');
    } else {
      // handoff_key VOR dem Redirect generieren und im PWA-localStorage ablegen.
      // Die Callback-Seite liest ihn aus der URL (?hk=...) und speichert die Tokens
      // serverseitig; die PWA löst den Key ein, sobald sie sichtbar wird.
      const handoffKey = crypto.randomUUID();
      localStorage.setItem('_pt_handoff_key', handoffKey);
      const base = isLocal ? location.origin : APP_BASE_URL;
      redirectTo = encodeURIComponent(`${base}/auth/callback?hk=${handoffKey}`);
    }

    const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${redirectTo}`;

    if (isNative) {
      const { Browser } = window.Capacitor.Plugins;
      await Browser.open({ url: authUrl, presentationStyle: 'popover' });
    } else {
      window.location.href = authUrl;
    }
  },

  // Liest nach dem OAuth-Redirect den access_token aus dem URL-Hash und speichert die Session.
  // Dekodiert den JWT direkt — kein API-Call, kein Single Point of Failure.
  handleOAuthSession(hashString) {
    const params       = new URLSearchParams(hashString.replace(/^#/, ''));
    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';
    if (!accessToken) return false;

    const payload = _decodeJwtPayload(accessToken);
    const userId  = payload?.sub;
    const email   = payload?.email || localStorage.getItem('sb_email') || '';
    if (!userId) return false;

    this._saveSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
      user:          { id: userId, email },
      expires_in:    parseInt(params.get('expires_in') || '3600', 10),
    });
    return { userId, email };
  },

  async signOut() {
    const token = localStorage.getItem('sb_token');
    if(token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method:'POST', headers: authHeaders(token)
    });
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_refresh_token');
    localStorage.removeItem('sb_expires_at');
    localStorage.removeItem('sb_user_id');
    localStorage.removeItem('sb_email');
    localStorage.removeItem('tt_ps_lat');
    localStorage.removeItem('tt_ps_lng');
    localStorage.removeItem('tt_ps_label');
    localStorage.removeItem('tt_ps_type');
    localStorage.removeItem('tt_ps_radius');
    currentUser = null;
  },
  getToken()  { return localStorage.getItem('sb_token'); },
  getUserId() { return localStorage.getItem('sb_user_id'); },
  isLoggedIn(){ return !!localStorage.getItem('sb_token'); },

  // --- DB (REST) ---
  async from(table) {
    return new QueryBuilder(table);
  }
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._filters = [];
    this._order = null;
    this._limit = null;
  }
  select(s)           { this._select = s; return this; }
  eq(col, val)        { this._filters.push(`${col}=eq.${val}`); return this; }
  order(col, desc=false){ this._order = `${col}.${desc?'desc':'asc'}`; return this; }
  limit(n)            { this._limit = n; return this; }

  async execute() {
    let url = `${SUPABASE_URL}/rest/v1/${this.table}?select=${encodeURIComponent(this._select)}`;
    this._filters.forEach(f => url += '&' + f);
    if(this._order) url += `&order=${this._order}`;
    if(this._limit) url += `&limit=${this._limit}`;
    const {ok, data} = await fetchWithRefresh(url, { headers: dbHeaders() });
    return { data: Array.isArray(data) ? data : [], error: ok ? null : data };
  }

  async insert(body) {
    const {ok, data} = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/${this.table}`,
      { method:'POST', headers: { ...dbHeaders(), 'Prefer':'return=representation' },
        body: JSON.stringify(body) }
    );
    return { data, error: ok ? null : data };
  }

  async update(body) {
    const filterStr = this._filters.join('&');
    const url = `${SUPABASE_URL}/rest/v1/${this.table}${filterStr ? '?' + filterStr : ''}`;
    const {ok, data} = await fetchWithRefresh(url, {
      method:'PATCH',
      headers: { ...dbHeaders(), 'Prefer':'return=representation' },
      body: JSON.stringify(body)
    });
    return { data, error: ok ? null : data };
  }

  async upsert(body, onConflict) {
    const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
    const {ok, data} = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/${this.table}${conflictParam}`,
      { method:'POST',
        headers: { ...dbHeaders(), 'Prefer':'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body) }
    );
    return { data, error: ok ? null : data };
  }
}

function authHeaders(token) {
  return {
    'Content-Type':'application/json',
    'apikey': SUPABASE_ANON,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}
function dbHeaders() {
  const token = sb.getToken();
  return {
    'Content-Type':'application/json',
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${token || SUPABASE_ANON}`
  };
}

// Führt einen API-Call aus.
// Timeout: 10 s pro Versuch — schützt gegen hängende fetch()-Calls auf iOS WKWebView.
// Bei AbortError oder TypeError (Netzwerkfehler) wird genau ein Retry durchgeführt
// (300–800 ms Jitter-Delay); HTTP-Fehler (4xx/5xx) werden nicht blind wiederholt.
const _FETCH_TIMEOUT_MS = 10000;

async function fetchWithRefresh(url, options) {
  const _shortUrl = url.replace(SUPABASE_URL, '').slice(0, 120);
  const _method   = (options && options.method) || 'GET';

  // ── Netzwerk-Retry-Loop (max. 2 Versuche) ────────────────────
  let r;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (typeof ptLog === 'function') ptLog('fetch', `ATTEMPT ${attempt} START`, { url: _shortUrl, method: _method });
    try {
      r = await _fetchWithTimeout(url, options, _FETCH_TIMEOUT_MS);
      if (typeof ptLog === 'function') ptLog('fetch', `ATTEMPT ${attempt} RESPONSE`, { status: r.status, url: _shortUrl });
      break; // Erfolg — Retry-Loop verlassen
    } catch(e) {
      const isNetErr = e.name === 'AbortError' || e instanceof TypeError;
      if (typeof ptLogError === 'function') ptLogError('fetch', `ATTEMPT ${attempt} ${e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR'}`, e);
      if (!isNetErr || attempt >= 2) throw e; // Nicht wiederholbarer Fehler oder letzter Versuch
      const delay = 300 + Math.random() * 500;
      if (typeof ptLog === 'function') ptLog('fetch', 'RETRY scheduled', { delayMs: Math.round(delay), url: _shortUrl });
      await new Promise(res => setTimeout(res, delay));
    }
  }

  let data = await _parseResponse(r);

  // JWT expired → Token erneuern und nochmal versuchen
  if(data.message === 'JWT expired' || data.code === 'PGRST301' ||
     (data.error === 'invalid_jwt') || JSON.stringify(data).includes('JWT expired')) {
    if (window.PT_DEBUG || location.hostname === 'localhost') console.log('JWT expired – erneuere Token…');
    if (typeof ptLog === 'function') ptLog('fetch', 'JWT expired — refreshing', { url: _shortUrl });
    const refreshed = await sb.refreshToken();
    if(refreshed) {
      options.headers = { ...options.headers, ...dbHeaders() };
      if (typeof ptLog === 'function') ptLog('fetch', 'RETRY after JWT refresh', { url: _shortUrl });
      r = await _fetchWithTimeout(url, options, _FETCH_TIMEOUT_MS);
      data = await _parseResponse(r);
      if (typeof ptLog === 'function') ptLog('fetch', 'JWT RETRY RESPONSE', { status: r.status, url: _shortUrl });
    } else {
      showToast('Sitzung abgelaufen – bitte neu einloggen', 'warning');
      await sb.signOut();
      updateTopBarForUser();
      openSheet('auth-sheet');
      return { ok: false, data: { error: 'Session expired' } };
    }
  }
  return { ok: r.ok, data };
}

function _fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const opts  = { ...options, signal: controller.signal };
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

async function _parseResponse(r) {
  const text = await r.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch(e) { return {}; }
}
