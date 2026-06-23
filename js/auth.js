// ╔══════════════════════════════════════════════════════════════╗
// ║           AUTH  (Login / Registrierung)                      ║
// ╚══════════════════════════════════════════════════════════════╝
let authMode = 'login'; // 'login' | 'register'

function setAuthMode(mode) {
  authMode = mode;
  // Felder ein-/ausblenden
  document.getElementById('auth-login-fields').style.display = mode==='login' ? 'block' : 'none';
  document.getElementById('auth-reg-fields').style.display   = mode==='register' ? 'block' : 'none';
  // Titel
  document.getElementById('auth-sheet-title').textContent = mode==='login' ? '👤 Anmelden' : '🏓 Registrieren';
  // Submit-Button Label
  document.getElementById('auth-submit-btn').textContent = mode==='login' ? 'Anmelden' : 'Konto erstellen';
  // Tab-Styling: active = blau, inaktiv = grau
  const tabLogin = document.getElementById('auth-tab-login');
  const tabReg   = document.getElementById('auth-tab-reg');
  tabLogin.classList.toggle('auth-tab-active', mode==='login');
  tabReg.classList.toggle('auth-tab-active',   mode==='register');
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
      await loadCurrentUser();
      closeAllSheets();
      showToast(`Willkommen zurück, ${currentUser?.username || 'Spieler'}! 👋`);
      updateTopBarForUser();

    } else {
      const username = document.getElementById('auth-username').value.trim();
      const email    = document.getElementById('auth-reg-email').value.trim();
      const password = document.getElementById('auth-reg-pw').value;
      if(!username || !email || !password) { showToast('Alle Felder ausfüllen','⚠️'); return; }
      if(password.length < 6) { showToast('Passwort mindestens 6 Zeichen','⚠️'); return; }

      const res = await sb.signUp(email, password, username);
      if(res.error) { showToast(res.error.message || 'Fehler bei Registrierung','❌'); return; }
      closeAllSheets();
      showToast('🎉 Willkommen! Bitte E-Mail bestätigen, dann einloggen.','🎉');
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
  if(data && data[0]) currentUser = data[0];
}

function updateTopBarForUser() {
  const btn = document.getElementById('topbar-profile-btn');
  if(btn && currentUser) btn.textContent = currentUser.avatar_emoji || '😎';
}

async function doSignOut() {
  await sb.signOut();
  closeAllSheets();
  showToast('👋 Bis bald!');
  document.getElementById('topbar-profile-btn').textContent = '👤';
  showPage('home');
}
