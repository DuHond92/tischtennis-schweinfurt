// ╔══════════════════════════════════════════════════════════════╗
// ║           PROFIL                                             ║
// ╚══════════════════════════════════════════════════════════════╝
function renderProfile() {
  const guestView  = document.getElementById('profile-guest-view');
  const loggedView = document.getElementById('profile-logged-view');
  if (!currentUser) {
    if (guestView)  guestView.style.display  = '';
    if (loggedView) loggedView.style.display = 'none';
    return;
  }
  if (guestView)  guestView.style.display  = 'none';
  if (loggedView) loggedView.style.display = '';
  _renderSetupHint(currentUser);

  // Avatar & Name
  updateProfileAvatarEl(currentUser);
  document.querySelector('.profile-name').textContent = currentUser.username || 'Spieler';

  // Sub-Zeile: Wohnort + Mitglied seit
  const subEl = document.getElementById('profile-sub-line');
  if (subEl) {
    const subParts = [];
    if (currentUser.city) subParts.push(currentUser.city);
    if (currentUser.created_at) {
      const since = new Date(currentUser.created_at).toLocaleDateString('de-DE', {month:'long', year:'numeric'});
      subParts.push('Mitglied seit ' + since);
    }
    subEl.textContent = subParts.join(' · ');
  }

  // Mini-Account-Sheet + Rank-Karte aktualisieren
  const psNameEl = document.getElementById('ps-name-el');
  if (psNameEl) psNameEl.textContent = currentUser.username || 'Spieler';
  const psAvEl = document.getElementById('ps-avatar-el');
  if (psAvEl) psAvEl.textContent = currentUser.avatar_emoji || '😎';
  // Skill level
  const skill = currentUser.skill_level || 'anfaenger';
  document.querySelectorAll('.skill-opt').forEach((el, i) => {
    el.classList.toggle('active', ['anfaenger','fortgeschritten','profi'][i] === skill);
  });

  // Spielpartner
  if (typeof renderSpielpartnerSection === 'function') renderSpielpartnerSection();
  // Meine Spiele
  renderMyEventsSection();

  // Sign-out button
  const signOutBtn = document.querySelector('#profile-signout-btn');
  if (signOutBtn) signOutBtn.onclick = doSignOut;

  // Moderation link
  const adminItem = document.getElementById('admin-nav-item');
  if (adminItem) {
    adminItem.style.display = (currentUser.role === 'moderator' || currentUser.role === 'admin') ? '' : 'none';
  }
}

function _isProfileComplete(u) {
  const hasAvatar = !!(u.avatar_emoji || u.avatar_url);
  const hasSkill  = !!(u.skill_level);
  return hasAvatar && hasSkill;
}

function _renderSetupHint(u) {
  const el = document.getElementById('profile-setup-hint');
  if (!el) return;
  if (_isProfileComplete(u)) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="profile-setup-card">
      <div class="psc-title">Schön, dass du da bist!</div>
      <div class="psc-body">Vervollständige kurz dein Profil, damit andere Spieler dich besser einschätzen können.</div>
      <ul class="psc-list">
        <li>Avatar oder Emoji wählen</li>
        <li>Anzeigename prüfen</li>
        <li>Spielniveau auswählen</li>
        <li>Ort optional ergänzen</li>
      </ul>
      <button class="psc-btn" onclick="openProfileEditSheet()">Profil bearbeiten</button>
    </div>`;
}

function renderMyEventsSection() {
  const el = document.getElementById('profile-my-events');
  if (!el || !currentUser) return;
  const uid = sb.getUserId();
  const src = allEvents.length ? allEvents : [];
  const myEvents = src.filter(e =>
    e.creatorId === uid || (e.participants || []).some(p => p.id === uid)
  );
  if (!myEvents.length) {
    el.innerHTML = `
      <div class="empty-state-card">
        <div class="esc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="esc-title">Noch kein Spiel geplant?</div>
        <div class="esc-body">Entdecke Spiele in deiner Nähe oder erstelle dein erstes eigenes Spiel.</div>
        <button class="esc-btn" onclick="showPage('events')">Spiele entdecken</button>
      </div>`;
    return;
  }
  el.innerHTML = myEvents.slice(0, 3).map(e => `
    <div class="profile-event-row" onclick="showEventDetail(${e.id})">
      <span class="ev-type-pill pill-${e.type}" style="font-size:0.68rem;">${typeLabel(e.type)}</span>
      <span class="per-name">${escHtml(e.name)}</span>
      <span class="per-date">${e.day}. ${e.mon}</span>
    </div>`).join('');
}

async function selectSkill(el) {
  const vals=['anfaenger','fortgeschritten','profi'];
  document.querySelectorAll('.skill-opt').forEach((o,i)=>{
    o.classList.toggle('active', o===el);
  });
  const skill = vals[Array.from(document.querySelectorAll('.skill-opt')).indexOf(el)];
  if(sb.isLoggedIn() && skill) {
    const qb = new QueryBuilder('profiles');
    await qb.eq('id', sb.getUserId()).update({ skill_level: skill });
    if(currentUser) currentUser.skill_level = skill;
  }
  showToast('✅ Spielniveau gespeichert!');
}

function openProfileEditSheet() {
  if (!sb.isLoggedIn() || !currentUser) { openSheet('auth-sheet'); return; }
  document.getElementById('edit-name').value      = currentUser.username  || '';
  document.getElementById('edit-email').value     = localStorage.getItem('sb_email') || '';
  document.getElementById('edit-city').value      = currentUser.city      || '';
  document.getElementById('edit-gender').value    = currentUser.gender    || 'not_specified';
  document.getElementById('edit-birthdate').value = currentUser.birthdate || '';
  document.getElementById('edit-club').value      = currentUser.club_name || '';
  document.getElementById('edit-bio').value       = currentUser.bio       || '';
  _updateBioCounter();
  openSheet('profile-edit-sheet');
}

function _updateBioCounter() {
  const bio     = document.getElementById('edit-bio');
  const counter = document.getElementById('edit-bio-counter');
  if (bio && counter) counter.textContent = bio.value.length;
}

async function saveProfile() {
  if (!sb.isLoggedIn()) return;
  const name      = document.getElementById('edit-name').value.trim();
  const city      = document.getElementById('edit-city').value.trim();
  const gender    = document.getElementById('edit-gender')?.value || 'not_specified';
  const birthdate = document.getElementById('edit-birthdate')?.value || null;
  const club      = document.getElementById('edit-club')?.value.trim() || '';
  const bio       = (document.getElementById('edit-bio')?.value || '').trim().slice(0, 160);

  if (!name) { showToast('Spielername darf nicht leer sein', '⚠️'); return; }

  const btn = document.getElementById('profile-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern…'; }

  const qb = new QueryBuilder('profiles');
  const { error } = await qb.eq('id', sb.getUserId()).update({
    username:   name,
    city:       city   || null,
    gender:     gender,
    birthdate:  birthdate || null,
    club_name:  club   || null,
    bio:        bio    || null
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
  if (error) { showToast('Profil konnte nicht gespeichert werden', '❌'); return; }

  if (currentUser) {
    currentUser.username  = name;
    currentUser.city      = city;
    currentUser.gender    = gender;
    currentUser.birthdate = birthdate;
    currentUser.club_name = club;
    currentUser.bio       = bio;
  }
  closeAllSheets();
  showToast('Profil gespeichert');
  renderProfile();
}

async function changePassword() {
  const pw1 = document.getElementById('edit-pw-new')?.value  || '';
  const pw2 = document.getElementById('edit-pw-confirm')?.value || '';
  if (!pw1) { showToast('Bitte neues Passwort eingeben', '⚠️'); return; }
  if (pw1.length < 6) { showToast('Passwort mindestens 6 Zeichen', '⚠️'); return; }
  if (pw1 !== pw2)   { showToast('Passwörter stimmen nicht überein', '⚠️'); return; }

  const btn = document.getElementById('edit-pw-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Wird gespeichert…'; }

  try {
    const res  = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sb.getToken()}`, 'apikey': SUPABASE_ANON },
      body:    JSON.stringify({ password: pw1 })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = 'Passwort ändern'; }
    if (!res.ok || data.error) { showToast(data.error?.message || 'Fehler beim Ändern', '❌'); return; }
    document.getElementById('edit-pw-new').value     = '';
    document.getElementById('edit-pw-confirm').value = '';
    showToast('Passwort geändert');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Passwort ändern'; }
    showToast('Fehler beim Passwort ändern', '❌');
  }
}
