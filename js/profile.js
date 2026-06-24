// ╔══════════════════════════════════════════════════════════════╗
// ║           PROFIL                                             ║
// ╚══════════════════════════════════════════════════════════════╝
function renderProfile() {
  if(!currentUser) return;
  const total = (currentUser.wins||0)+(currentUser.losses||0);
  // Avatar & Name oben
  document.querySelector('.profile-avatar').textContent = currentUser.avatar_emoji||'😎';
  document.querySelector('.profile-name').textContent   = currentUser.username||'Spieler';
  // Stats (W/L/Spiele gesamt, kein ELO/Winrate)
  const pv = document.querySelectorAll('.pstat-val');
  if(pv[0]) pv[0].textContent = currentUser.wins||0;
  if(pv[1]) pv[1].textContent = currentUser.losses||0;
  if(pv[2]) pv[2].textContent = total;
  // Skill level
  const skill = currentUser.skill_level || 'anfaenger';
  document.querySelectorAll('.skill-opt').forEach((el,i)=>{
    const vals=['anfaenger','fortgeschritten','profi'];
    el.classList.toggle('active', vals[i]===skill);
  });
  // Match History
  renderMatchHistory();
  // Sign-out button
  document.querySelector('#profile-signout-btn') &&
    (document.querySelector('#profile-signout-btn').onclick = doSignOut);
}

function renderMatchHistory() {
  const c = document.getElementById('profile-match-history');
  if(!myMatches.length) {
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
      </div>
      <div style="text-align:right;">
        <div class="match-date">${m.date}</div>
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
