// ╔══════════════════════════════════════════════════════════════╗
// ║           AUTH  (Login / Registrierung)                      ║
// ╚══════════════════════════════════════════════════════════════╝
let authMode = 'login'; // 'login' | 'register' | 'reset' | 'new-password'

function togglePwVisibility(btn) {
  const input = btn.previousElementSibling;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = ic(show ? 'eye-off' : 'eye', 18);
}

function _authEnter(e) {
  if (e.key !== 'Enter') return;
  if (authMode === 'reset')        sendPasswordReset();
  else if (authMode === 'new-password') submitNewPassword();
  else                              submitAuth();
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

function setAuthMode(mode) {
  if (mode === 'register' && authMode !== 'register') PTAnalytics.track('signup_started');
  authMode = mode;
  const isStandard = mode === 'login' || mode === 'register';

  // Sektionen
  document.getElementById('auth-login-fields').style.display    = mode === 'login'         ? 'block' : 'none';
  document.getElementById('auth-reg-fields').style.display      = mode === 'register'       ? 'block' : 'none';
  document.getElementById('auth-reset-fields').style.display    = mode === 'reset'          ? 'block' : 'none';
  document.getElementById('auth-newpw-fields').style.display    = mode === 'new-password'   ? 'block' : 'none';
  document.getElementById('auth-submit-btn').style.display      = isStandard                ? 'flex'  : 'none';
  document.getElementById('auth-tabs').style.display            = isStandard                ? 'flex'  : 'none';

  // Titel
  const titles = { login: 'Anmelden', register: 'Registrieren',
                   reset: '🔑 Passwort zurücksetzen', 'new-password': '🔑 Neues Passwort' };
  document.getElementById('auth-sheet-title').innerHTML = titles[mode] || titles.login;

  // Submit-Button Label
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Anmelden' : 'Konto erstellen';

  // Tab-Styling
  document.getElementById('auth-tab-login').classList.toggle('auth-tab-active', mode === 'login');
  document.getElementById('auth-tab-reg').classList.toggle('auth-tab-active',   mode === 'register');
}

async function sendPasswordReset() {
  const email = document.getElementById('auth-reset-email').value.trim();
  if (!email) { showToast('Bitte E-Mail eingeben', '⚠️'); return; }

  const btn = document.getElementById('auth-reset-btn');
  btn.disabled = true; btn.textContent = '…';

  const ok = await sb.resetPassword(email);
  btn.disabled = false; btn.textContent = 'Reset-Link senden';

  if (ok) {
    document.getElementById('auth-reset-fields').innerHTML = `
      <div style="text-align:center;padding:20px 0 8px;">
        <div style="font-size:2.5rem;margin-bottom:12px;">📧</div>
        <div style="font-weight:700;font-size:1rem;margin-bottom:8px;">E-Mail gesendet!</div>
        <div style="font-size:0.85rem;color:var(--text-dim);line-height:1.5;">
          Prüfe dein Postfach und klicke auf den Link, um ein neues Passwort festzulegen.
        </div>
        <button class="btn btn-secondary btn-full" style="margin-top:20px;" onclick="setAuthMode('login')">← Zurück zum Login</button>
      </div>`;
  } else {
    showToast('Fehler beim Senden — E-Mail prüfen', '❌');
  }
}

async function submitNewPassword() {
  const pw  = document.getElementById('auth-newpw').value;
  const pw2 = document.getElementById('auth-newpw2').value;
  if (!pw || pw.length < 6) { showToast('Mindestens 6 Zeichen', '⚠️'); return; }
  if (pw !== pw2)            { showToast('Passwörter stimmen nicht überein', '⚠️'); return; }

  const btn = document.getElementById('auth-newpw-btn');
  btn.disabled = true; btn.textContent = '…';

  const ok = await sb.updatePassword(pw);
  btn.disabled = false; btn.textContent = 'Passwort speichern';

  if (ok) {
    closeAllSheets();
    showToast('✅ Passwort geändert! Bitte neu anmelden.');
    await sb.signOut();
    setTimeout(() => { openSheet('auth-sheet'); setAuthMode('login'); }, 800);
  } else {
    showToast('Fehler beim Speichern', '❌');
  }
}

function checkPasswordRecovery() {
  const hash = window.location.hash;
  if (!hash.includes('type=recovery')) return;
  const params = new URLSearchParams(hash.slice(1));
  const token   = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (!token) return;
  // Token zwischenspeichern damit updatePassword() ihn nutzen kann
  localStorage.setItem('sb_token', token);
  if (refresh) localStorage.setItem('sb_refresh_token', refresh);
  history.replaceState(null, '', window.location.pathname);
  setTimeout(() => { openSheet('auth-sheet'); setAuthMode('new-password'); }, 300);
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    if(authMode === 'login') {
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-pw').value;
      if(!email || !password) { showToast('Bitte E-Mail und Passwort eingeben','⚠️'); return; }

      const res = await sb.signIn(email, password);
      if(res.error || !res.access_token) {
        showToast(res.error?.message || 'Anmeldung fehlgeschlagen','❌');
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
      if(!username || !email || !password) { showToast('Alle Felder ausfüllen','⚠️'); return; }
      if(password.length < 6) { showToast('Passwort mindestens 6 Zeichen','⚠️'); return; }

      const res = await sb.signUp(email, password, username);
      if(res.error) { showToast(res.error.message || 'Fehler bei Registrierung','❌'); return; }
      _myConnections = null;
      await loadCurrentUser();
      await loadMyConnections();
      closeAllSheets();
      PTAnalytics.track('signup_completed');
      showWelcomeSuccess();
      setAuthMode('login');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = authMode==='login' ? 'Anmelden' : 'Konto erstellen';
  }
}

async function loadCurrentUser() {
  const uid = sb.getUserId();
  if(!uid) return;
  const qb = new QueryBuilder('profiles');
  const {data} = await qb.eq('id', uid).execute();
  if(data && data[0]) {
    currentUser = data[0];
    if (typeof updateHeroLocation === 'function') updateHeroLocation();
  }
}

function updateTopBarForUser() {
  // topbar-profile-btn removed; avatar shown on profile page only
}

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
      <div style="font-size:2rem;margin-bottom:10px;">🎉</div>
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
      <div class="apc-title">👋 Kostenlos anmelden</div>
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

async function doSignOut() {
  _myConnections = null;
  PTAnalytics.track('logout_completed');
  await sb.signOut();
  closeAllSheets();
  showToast('👋 Bis bald!');
  showPage('home');
}
