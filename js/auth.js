// ╔══════════════════════════════════════════════════════════════╗
// ║           AUTH  (Login / Registrierung)                      ║
// ╚══════════════════════════════════════════════════════════════╝
let authMode = 'login'; // 'login' | 'register' | 'reset' | 'new-password'

// ── Helpers ──────────────────────────────────────────────────────

function _setAuthBtnLoading(loading) {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn--loading', loading);
  if (loading) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
}

function _setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const group = input.closest('.form-group');
  if (!group) return;
  const errId = `${inputId}-error`;
  if (message) {
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errId);
    let errEl = group.querySelector('.field-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'field-error';
      errEl.setAttribute('role', 'alert');
      group.appendChild(errEl);
    }
    errEl.id = errId;
    errEl.textContent = message;
  } else {
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const errEl = group.querySelector('.field-error');
    if (errEl) errEl.remove();
  }
}

function _clearAllFieldErrors() {
  const sheet = document.getElementById('auth-sheet');
  if (!sheet) return;
  sheet.querySelectorAll('.field-error').forEach(el => el.remove());
  sheet.querySelectorAll('.form-input, .auth-consent-check').forEach(el => {
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

function _parseAuthError(error) {
  if (!error) return null;
  const msg = (error.message || error.msg || String(error)).toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password')) {
    return 'E-Mail-Adresse oder Passwort sind nicht korrekt.';
  }
  if (msg.includes('user already registered') || msg.includes('already registered') || msg.includes('email already')) {
    return 'Für diese E-Mail-Adresse besteht bereits ein Konto.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-Mail-Adresse noch nicht bestätigt. Bitte prüf dein Postfach.';
  }
  if (msg.includes('rate limit') || msg.includes('too many request')) {
    return 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.';
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('weak'))) {
    return 'Das Passwort ist zu kurz – mindestens 6 Zeichen erforderlich.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    showToast('Verbindungsfehler. Bitte prüf deine Internetverbindung.');
    return null;
  }
  return error.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.';
}

// ── Blur-Validierung ─────────────────────────────────────────────

function _validateEmailField(input, id) {
  const val = input.value.trim();
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    _setFieldError(id, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  } else {
    _setFieldError(id, null);
  }
}

function _validatePw2() {
  const pw  = document.getElementById('auth-reg-pw')?.value  || '';
  const pw2 = document.getElementById('auth-reg-pw2')?.value || '';
  if (pw2 && pw !== pw2) {
    _setFieldError('auth-reg-pw2', 'Passwörter stimmen nicht überein.');
  } else {
    _setFieldError('auth-reg-pw2', null);
  }
}

// ── Passwort-Sichtbarkeit ────────────────────────────────────────

function togglePwVisibility(btn) {
  const input = btn.previousElementSibling;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = ic(show ? 'eye-off' : 'eye', 18);
}

function _authEnter(e) {
  if (e.key !== 'Enter') return;
  if (authMode === 'reset')             sendPasswordReset();
  else if (authMode === 'new-password') submitNewPassword();
  else                                  submitAuth();
}

function checkCapsLock(e, input) {
  if (e.key === 'Enter') { _authEnter(e); return; }
  if (navigator.maxTouchPoints > 1) return;
  const hintId = input.id === 'auth-pw' ? 'caps-hint-login' : 'caps-hint-reg';
  const hint = document.getElementById(hintId);
  if (!hint) return;
  const caps = e.getModifierState ? e.getModifierState('CapsLock') : false;
  hint.style.display = caps ? '' : 'none';
}

function checkPwStrength(input) {
  const val = input.value;
  const list = document.getElementById('pw-strength-list');
  if (!list) return;
  list.style.display = val.length ? '' : 'none';
  const rules = {
    len:   val.length >= 6,
    upper: /[A-Z]/.test(val),
    num:   /[0-9]/.test(val)
  };
  list.querySelectorAll('.psl-item').forEach(el => {
    el.classList.toggle('met', !!rules[el.dataset.rule]);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.innerHTML = ic('eye', 18);
  });
});

// ── Tab / Modus wechseln ──────────────────────────────────────────

function setAuthMode(mode) {
  if (mode === 'register' && authMode !== 'register') PTAnalytics.track('signup_started');
  authMode = mode;
  clearInlineError('auth-error');
  _clearAllFieldErrors();
  const consent = document.getElementById('auth-consent');
  if (consent) consent.checked = false;
  const isStandard = mode === 'login' || mode === 'register';

  document.getElementById('auth-login-fields').style.display  = mode === 'login'         ? 'block' : 'none';
  document.getElementById('auth-reg-fields').style.display    = mode === 'register'       ? 'block' : 'none';
  document.getElementById('auth-reset-fields').style.display  = mode === 'reset'          ? 'block' : 'none';
  document.getElementById('auth-newpw-fields').style.display  = mode === 'new-password'   ? 'block' : 'none';
  document.getElementById('auth-submit-btn').style.display    = isStandard                ? 'flex'  : 'none';
  document.getElementById('auth-social').style.display        = isStandard                ? 'block' : 'none';
  document.getElementById('auth-tabs').style.display          = isStandard                ? 'flex'  : 'none';

  const titles = {
    login:          'Anmelden',
    register:       'Registrieren',
    reset:          'Passwort zurücksetzen',
    'new-password': 'Neues Passwort',
  };
  document.getElementById('auth-sheet-title').textContent = titles[mode] || titles.login;

  const label = document.querySelector('#auth-submit-btn .btn-label');
  if (label) label.textContent = mode === 'login' ? 'Anmelden' : 'Konto erstellen';

  document.getElementById('auth-tab-login').classList.toggle('auth-tab-active', mode === 'login');
  document.getElementById('auth-tab-reg').classList.toggle('auth-tab-active',   mode === 'register');
}

// ── Passwort zurücksetzen ─────────────────────────────────────────

async function sendPasswordReset() {
  const email = document.getElementById('auth-reset-email').value.trim();
  if (!email) {
    showInlineError('auth-error', { title: 'E-Mail fehlt', desc: 'Bitte E-Mail-Adresse eingeben.' });
    document.getElementById('auth-reset-email').focus();
    return;
  }
  clearInlineError('auth-error');

  const btn = document.getElementById('auth-reset-btn');
  btn.disabled = true; btn.textContent = '…';

  const ok = await sb.resetPassword(email);
  btn.disabled = false; btn.textContent = 'Reset-Link senden';

  if (ok) {
    document.getElementById('auth-reset-fields').innerHTML = `
      <div style="text-align:center;padding:20px 0 8px;">
        <div style="margin-bottom:12px;color:var(--primary);">${ic('mail', 40)}</div>
        <div style="font-weight:700;font-size:1rem;margin-bottom:8px;">E-Mail gesendet!</div>
        <div style="font-size:0.85rem;color:var(--text-dim);line-height:1.5;">
          Prüfe dein Postfach und klicke auf den Link, um ein neues Passwort festzulegen.
        </div>
        <button class="btn btn-secondary btn-full" style="margin-top:20px;" onclick="setAuthMode('login')">← Zurück zum Login</button>
      </div>`;
  } else {
    showInlineError('auth-error', { title: 'Senden fehlgeschlagen', desc: 'E-Mail-Adresse prüfen und erneut versuchen.' });
  }
}

// ── Neues Passwort setzen ─────────────────────────────────────────

async function submitNewPassword() {
  const pw  = document.getElementById('auth-newpw').value;
  const pw2 = document.getElementById('auth-newpw2').value;
  if (!pw || pw.length < 6) {
    showInlineError('auth-error', { title: 'Passwort zu kurz', desc: 'Mindestens 6 Zeichen erforderlich.' });
    document.getElementById('auth-newpw').focus();
    return;
  }
  if (pw !== pw2) {
    showInlineError('auth-error', { title: 'Passwörter stimmen nicht überein', desc: 'Bitte beide Felder gleich ausfüllen.' });
    document.getElementById('auth-newpw2').focus();
    return;
  }
  clearInlineError('auth-error');

  const btn = document.getElementById('auth-newpw-btn');
  btn.disabled = true; btn.textContent = '…';

  const ok = await sb.updatePassword(pw);
  btn.disabled = false; btn.textContent = 'Passwort speichern';

  if (ok) {
    closeAllSheets();
    showToast('Passwort geändert! Bitte neu anmelden.');
    await sb.signOut();
    setTimeout(() => { openSheet('auth-sheet'); setAuthMode('login'); }, 800);
  } else {
    showInlineError('auth-error', { title: 'Speichern fehlgeschlagen', desc: 'Bitte erneut versuchen.' });
  }
}

// ── OAuth-Callback (Google, Apple) ───────────────────────────────

async function checkOAuthCallback() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) return;
  if (hash.includes('type=recovery')) return; // wird von checkPasswordRecovery() behandelt

  // Session aus Hash speichern (JWT-Decoding, kein API-Call)
  const result = sb.handleOAuthSession(hash);

  // Hash erst jetzt entfernen — Tokens nicht länger als nötig in der URL
  history.replaceState(null, '', window.location.pathname);

  if (!result) {
    showToast('Die Anmeldung war erfolgreich, die Sitzung konnte jedoch nicht gespeichert werden. Bitte versuche es erneut.', 'error');
    return;
  }

  _myConnections = null;
  await loadCurrentUser();
  if (typeof loadMyConnections === 'function') await loadMyConnections();
  closeAllSheets();
  updateTopBarForUser();
  if (typeof renderProfile === 'function') renderProfile();
  if (typeof checkNotifications === 'function') checkNotifications();
  if (typeof startNotifPolling === 'function') startNotifPolling();
  if (typeof checkDmNotifications === 'function') checkDmNotifications();
  PTAnalytics.track('login_completed');
  showWelcomeSuccess();
}

function _setOAuthBtnsLoading(loading) {
  document.querySelectorAll('.auth-social-btn').forEach(btn => {
    btn.disabled = loading;
    btn.classList.toggle('btn--loading', loading);
    if (loading) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  });
}

function signInWithGoogle() {
  _setOAuthBtnsLoading(true);
  sb.signInWithOAuth('google');
}

function signInWithApple() {
  _setOAuthBtnsLoading(true);
  sb.signInWithOAuth('apple');
}

// ── Recovery-Link aus URL-Hash ────────────────────────────────────

function checkPasswordRecovery() {
  const hash = window.location.hash;
  if (!hash.includes('type=recovery')) return;
  const params = new URLSearchParams(hash.slice(1));
  const token   = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (!token) return;
  localStorage.setItem('sb_token', token);
  if (refresh) localStorage.setItem('sb_refresh_token', refresh);
  history.replaceState(null, '', window.location.pathname);
  setTimeout(() => { openSheet('auth-sheet'); setAuthMode('new-password'); }, 300);
}

// ── Login / Registrierung abschicken ─────────────────────────────

async function submitAuth() {
  _setAuthBtnLoading(true);
  clearInlineError('auth-error');
  _clearAllFieldErrors();

  try {
    if (authMode === 'login') {
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-pw').value;

      let hasError = false;
      if (!email)    { _setFieldError('auth-email', 'E-Mail-Adresse erforderlich.'); hasError = true; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _setFieldError('auth-email', 'Bitte eine gültige E-Mail-Adresse eingeben.');
        hasError = true;
      }
      if (!password) { _setFieldError('auth-pw', 'Passwort erforderlich.'); hasError = true; }
      if (hasError) {
        document.querySelector('#auth-login-fields .input-error')?.focus();
        return;
      }

      const res = await sb.signIn(email, password);
      if (res.error || !res.access_token) {
        const msg = _parseAuthError(res.error);
        if (msg) showInlineError('auth-error', { title: 'Anmeldung fehlgeschlagen', desc: msg });
        return;
      }
      _myConnections = null;
      await loadCurrentUser();
      await loadMyConnections();
      closeAllSheets();
      updateTopBarForUser();
      checkNotifications();
      startNotifPolling();
      PTAnalytics.track('login_completed');
      showWelcomeSuccess();

    } else {
      const username = document.getElementById('auth-username').value.trim();
      const email    = document.getElementById('auth-reg-email').value.trim();
      const password = document.getElementById('auth-reg-pw').value;
      const pw2      = document.getElementById('auth-reg-pw2')?.value || '';

      let hasError = false;
      if (!username) {
        _setFieldError('auth-username', 'Spielername erforderlich.');
        hasError = true;
      }
      if (!email) {
        _setFieldError('auth-reg-email', 'E-Mail-Adresse erforderlich.');
        hasError = true;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _setFieldError('auth-reg-email', 'Bitte eine gültige E-Mail-Adresse eingeben.');
        hasError = true;
      }
      if (!password) {
        _setFieldError('auth-reg-pw', 'Passwort erforderlich.');
        hasError = true;
      } else if (password.length < 6) {
        _setFieldError('auth-reg-pw', 'Mindestens 6 Zeichen erforderlich.');
        hasError = true;
      }
      if (!pw2) {
        _setFieldError('auth-reg-pw2', 'Bitte Passwort bestätigen.');
        hasError = true;
      } else if (password && password !== pw2) {
        _setFieldError('auth-reg-pw2', 'Passwörter stimmen nicht überein.');
        hasError = true;
      }
      const consent = document.getElementById('auth-consent');
      if (!consent?.checked) {
        _setFieldError('auth-consent', 'Bitte Nutzungsbedingungen und Datenschutzerklärung akzeptieren.');
        hasError = true;
      }

      if (hasError) {
        document.querySelector('#auth-reg-fields .input-error')?.focus();
        return;
      }

      const res = await sb.signUp(email, password, username);
      if (res.error) {
        const msg = _parseAuthError(res.error);
        if (msg) showInlineError('auth-error', { title: 'Registrierung fehlgeschlagen', desc: msg });
        return;
      }
      _myConnections = null;
      await loadCurrentUser();
      await loadMyConnections();
      closeAllSheets();
      PTAnalytics.track('signup_completed');
      showWelcomeSuccess();
      setAuthMode('login');
    }
  } catch (err) {
    const msg = _parseAuthError(err);
    if (msg) showInlineError('auth-error', { title: 'Fehler', desc: msg });
  } finally {
    _setAuthBtnLoading(false);
  }
}

// ── User laden nach Login/Registrierung ───────────────────────────

async function loadCurrentUser() {
  const uid = sb.getUserId();
  if (!uid) return;
  const qb = new QueryBuilder('profiles');
  const {data} = await qb.eq('id', uid).execute();
  if (data && data[0]) {
    currentUser = data[0];
    if (typeof updateHeroLocation === 'function') updateHeroLocation();
    return;
  }

  // Kein profiles-Eintrag — bei neuen OAuth-Nutzern wenn der DB-Trigger
  // noch nicht gelaufen ist. Auth-Metadaten holen und minimales Profil anlegen.
  if (!sb.isLoggedIn()) return;
  try {
    const token = await sb.getValidToken();
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(token) });
    const authUser = r.ok ? await r.json() : null;
    const fallbackUsername =
      authUser?.user_metadata?.name ||
      authUser?.user_metadata?.full_name ||
      (authUser?.email || localStorage.getItem('sb_email') || '').split('@')[0] ||
      'Spieler';

    const ins = new QueryBuilder('profiles');
    await ins.upsert({ id: uid, username: fallbackUsername }, 'id');

    currentUser = { id: uid, username: fallbackUsername };
    if (typeof updateHeroLocation === 'function') updateHeroLocation();
  } catch (e) {
    const email = localStorage.getItem('sb_email') || '';
    currentUser = { id: uid, username: email.split('@')[0] || 'Spieler' };
  }
}

function updateTopBarForUser() {
  // topbar-profile-btn removed; avatar shown on profile page only
}

// ── Willkommens-Overlay nach Anmeldung ───────────────────────────

function showWelcomeSuccess() {
  let el = document.getElementById('welcome-success-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'welcome-success-overlay';
    el.className = 'auth-prompt-overlay';
    el.addEventListener('click', e => { if (e.target === el) _dismissWelcomeSuccess(); });
    document.body.appendChild(el);
  }
  const name = currentUser?.username || 'Spieler';
  el.innerHTML = `
    <div class="auth-prompt-card">
      <div style="margin-bottom:10px;color:var(--primary);">${ic('check-circle', 40)}</div>
      <div class="apc-title">Willkommen, ${escHtml(name)}!</div>
      <div class="apc-body">Du kannst jetzt Spielen beitreten, Mitspieler kontaktieren und dein Profil einrichten.</div>
      <button class="apc-btn apc-btn-primary" onclick="_dismissWelcomeSuccess();showPage('profile');setTimeout(()=>openSheet('profile-edit-sheet'),150)">Profil vervollständigen</button>
      <button class="apc-btn apc-btn-ghost" onclick="_dismissWelcomeSuccess()">Später</button>
    </div>`;
  el.style.display = 'flex';
}

function _dismissWelcomeSuccess() {
  const el = document.getElementById('welcome-success-overlay');
  if (el) el.style.display = 'none';
}

// ── Auth-Prompt (unangemeldet) ────────────────────────────────────

function showAuthPrompt() {
  let el = document.getElementById('auth-prompt-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-prompt-overlay';
    el.className = 'auth-prompt-overlay';
    el.addEventListener('click', e => { if (e.target === el) dismissAuthPrompt(); });
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="auth-prompt-card">
      <div class="apc-title">Kostenlos anmelden</div>
      <div class="apc-body">Erstelle ein Profil, um mitzuspielen, Nachrichten zu schreiben und Mitspieler zu finden.</div>
      <button class="apc-btn apc-btn-primary" onclick="dismissAuthPrompt();openSheet('auth-sheet');setAuthMode('register')">Kostenlos registrieren</button>
      <button class="apc-btn apc-btn-secondary" onclick="dismissAuthPrompt();openSheet('auth-sheet');setAuthMode('login')">Anmelden</button>
      <button class="apc-btn apc-btn-ghost" onclick="dismissAuthPrompt()">Später</button>
    </div>`;
  el.style.display = 'flex';
}

function dismissAuthPrompt() {
  const el = document.getElementById('auth-prompt-overlay');
  if (el) el.style.display = 'none';
}

// ── Abmelden ─────────────────────────────────────────────────────

function confirmSignOut() {
  showConfirmDialog({
    title:        'Abmelden?',
    body:         'Du wirst sicher von deinem Account auf diesem Gerät abgemeldet.',
    confirmLabel: 'Abmelden',
    cancelLabel:  'Abbrechen',
    danger:       true,
    iconVisible:  false,
    onConfirm:    doSignOut,
  });
}

async function doSignOut() {
  _myConnections = null;
  PTAnalytics.track('logout_completed');
  await sb.signOut();
  currentUser = null;
  closeAllSheets();
  updateTopBarForUser();
  if (typeof renderProfile === 'function') renderProfile();
  setAuthMode('login');
  showToast('Bis bald!');
  showPage('home');
}
