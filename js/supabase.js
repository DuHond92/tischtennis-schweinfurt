// ╔══════════════════════════════════════════════════════════════╗
// ║           SUPABASE CONFIG                                    ║
// ╚══════════════════════════════════════════════════════════════╝
const SUPABASE_URL  = 'https://quelfdpqvzgnnvpuwljq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_pe9d7oJngP6p5vc5Y-ARgA_sd-zye12';

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
    if(!refreshToken) return false;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method:'POST', headers: authHeaders(),
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await r.json();
      if(data.access_token) {
        this._saveSession(data);
        console.log('✅ Token automatisch erneuert');
        return true;
      }
    } catch(e) { console.warn('Token refresh fehlgeschlagen', e); }
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

// Führt einen API-Call aus, erneuert bei JWT-Fehler automatisch den Token
async function fetchWithRefresh(url, options) {
  let r = await fetch(url, options);
  let data = await _parseResponse(r);

  // JWT expired → Token erneuern und nochmal versuchen
  if(data.message === 'JWT expired' || data.code === 'PGRST301' ||
     (data.error === 'invalid_jwt') || JSON.stringify(data).includes('JWT expired')) {
    console.log('JWT expired – erneuere Token…');
    const refreshed = await sb.refreshToken();
    if(refreshed) {
      options.headers = { ...options.headers, ...dbHeaders() };
      r = await fetch(url, options);
      data = await _parseResponse(r);
    } else {
      showToast('Sitzung abgelaufen – bitte neu einloggen', '🔑');
      await sb.signOut();
      updateTopBarForUser();
      openSheet('auth-sheet');
      return { ok: false, data: { error: 'Session expired' } };
    }
  }
  return { ok: r.ok, data };
}

async function _parseResponse(r) {
  const text = await r.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch(e) { return {}; }
}
