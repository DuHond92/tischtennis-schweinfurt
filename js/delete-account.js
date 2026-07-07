// ╔══════════════════════════════════════════════════════════════╗
// ║           ACCOUNT LÖSCHEN                                    ║
// ╚══════════════════════════════════════════════════════════════╝

function openDeleteAccountSheet() {
  if (!sb.isLoggedIn()) return;
  _daShowStep(1);
  openSheet('delete-account-sheet');
}

function _daShowStep(step) {
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`da-step-${s}`);
    if (el) el.style.display = s === step ? '' : 'none';
  });
}

function _daGoToConfirm() {
  PTAnalytics.track('account_delete_started');
  _daShowStep(2);
}

function _daBack() {
  _daShowStep(1);
}

async function _daExecuteDelete() {
  _daShowStep(3);

  try {
    // 1. Avatar aus Storage löschen (während Session noch gültig)
    const uid   = sb.getUserId();
    const token = await sb.getValidToken();
    if (uid && token) {
      await fetch(
        `${SUPABASE_URL}/storage/v1/object/avatars/${uid}/avatar.jpg`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON } }
      ).catch(() => {});
    }

    // 2. delete_my_account() RPC aufrufen — löscht alle DB-Daten + auth.users
    const token2 = await sb.getValidToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${token2}`,
        'Content-Type':  'application/json'
      },
      body: '{}'
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.hint || `HTTP ${res.status}`);
    }

    // 3. Lokalen State vollständig leeren (Analytics sendet noch davor)
    PTAnalytics.track('account_delete_completed');
    _daClearLocalState();

    // 4. Erfolgs-Screen zeigen, danach zur Home/Login-Seite
    _daShowStep(4);
    setTimeout(() => {
      closeAllSheets();
      currentUser = null;
      if (typeof renderProfile === 'function') renderProfile();
      showPage('home');
    }, 2200);

  } catch (e) {
    console.error('Account deletion error:', e);
    _daShowStep(2); // Zurück zu Schritt 2 bei Fehler
    const msg = e.message?.includes('not_authenticated')
      ? 'Bitte melde dich erneut an und versuche es nochmal.'
      : (e.message || 'Unbekannter Fehler. Bitte erneut versuchen.');
    showToast('Fehler: ' + msg, '❌');
  }
}

function _daClearLocalState() {
  const keepKeys = ['tt_dark']; // Dark-Mode-Einstellung behalten
  Object.keys(localStorage).forEach(k => {
    if (!keepKeys.includes(k)) localStorage.removeItem(k);
  });
  currentUser = null;
}
