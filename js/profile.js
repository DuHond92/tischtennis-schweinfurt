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
  // Avatar & Name oben
  updateProfileAvatarEl(currentUser);
  document.querySelector('.profile-name').textContent   = currentUser.username||'Spieler';
  // Skill level
  const skill = currentUser.skill_level || 'anfaenger';
  document.querySelectorAll('.skill-opt').forEach((el,i)=>{
    const vals=['anfaenger','fortgeschritten','profi'];
    el.classList.toggle('active', vals[i]===skill);
  });
  // Spielpartner
  if (typeof renderSpielpartnerSection === 'function') renderSpielpartnerSection();
  // Match History - temporarily disabled
  // renderMatchHistory();
  // Sign-out button
  document.querySelector('#profile-signout-btn') &&
    (document.querySelector('#profile-signout-btn').onclick = doSignOut);
  // Moderation link — visible for moderators and admins
  const adminItem = document.getElementById('admin-nav-item');
  if (adminItem) {
    const canMod = currentUser.role === 'moderator' || currentUser.role === 'admin';
    adminItem.style.display = canMod ? '' : 'none';
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
      <div class="psc-title">🎉 Schön, dass du da bist!</div>
      <div class="psc-body">Vervollständige kurz dein Profil, damit andere Spieler dich besser einschätzen können.</div>
      <ul class="psc-list">
        <li>Avatar oder Emoji wählen</li>
        <li>Anzeigename prüfen</li>
        <li>Spielniveau auswählen</li>
        <li>Ort optional ergänzen</li>
      </ul>
      <button class="psc-btn" onclick="openSheet('profile-edit-sheet')">Profil bearbeiten</button>
    </div>`;
}

async function renderMatchHistory() {
  const c = document.getElementById('profile-match-history');
  if(!myMatches.length) {
    await loadMyMatches();
    if(!myMatches.length) {
      c.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem;">
        Noch keine Matches gespielt.</div>`;
      return;
    }
    c.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Matches gespielt.</div>`;
    return;
  }
  c.innerHTML = myMatches.map(m=>`
    <div class="match-row">
      <div class="match-res ${m.res}">${m.res==='win'?'W':'L'}</div>
      <div style="flex:1;">
        <div class="match-opp">vs. ${m.opp||'?'}</div>
        <div class="match-sets">Sätze: ${m.sets}</div>
        ${m.table ? `<div class="match-table">${ic('map-pin',12)} ${m.table}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div class="match-date">${m.date}</div>
        <div class="match-elo">${m.elo > 0 ? '+' : ''}${m.elo}</div>
      </div>
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

async function saveProfile() {
  if(!sb.isLoggedIn()) return;
  const name   = document.getElementById('edit-name').value.trim();
  const city   = document.getElementById('edit-city').value.trim();
  const bio    = document.getElementById('edit-bio').value.trim();
  const qb = new QueryBuilder('profiles');
  const {error} = await qb.eq('id', sb.getUserId()).update({
    username: name||currentUser.username,
    city: city||currentUser.city
  });
  if(error) { showToast('Fehler beim Speichern','❌'); return; }
  if(currentUser) { currentUser.username=name||currentUser.username; currentUser.city=city||currentUser.city; }
  closeAllSheets();
  showToast('✅ Profil gespeichert!');
  renderProfile();
}
