// ╔══════════════════════════════════════════════════════════════╗
// ║           SPIELER-PROFIL (klickbares Overlay-Sheet)         ║
// ╚══════════════════════════════════════════════════════════════╝

function openPlayerSheet() {
  document.getElementById('pp-overlay').classList.add('open');
  document.getElementById('player-profile-sheet').classList.add('open');
}

function closePlayerProfile() {
  document.getElementById('pp-overlay').classList.remove('open');
  document.getElementById('player-profile-sheet').classList.remove('open');
}

async function showPlayerProfile(userId, username, avatarEmoji, contextLabel) {
  // Sofort Basis-Info anzeigen
  const avEl   = document.getElementById('pp-avatar');
  const nameEl = document.getElementById('pp-username');
  const hostEl = document.getElementById('pp-host-badge');
  const cityEl = document.getElementById('pp-city');

  avEl.innerHTML = getAvatarHtml({ avatar_emoji: avatarEmoji, username }, {size: 72});
  nameEl.textContent = username || 'Spieler';

  if(contextLabel) {
    hostEl.textContent = contextLabel;
    hostEl.style.display = '';
  } else {
    hostEl.style.display = 'none';
  }
  cityEl.style.display = 'none';
  cityEl.textContent   = '';

  document.getElementById('pp-stats').innerHTML   = '';
  document.getElementById('pp-details').innerHTML =
    '<div class="pp-loading">Lade Profil…</div>';

  openPlayerSheet();

  if(!userId) {
    document.getElementById('pp-details').innerHTML = '';
    return;
  }

  try {
    const qb = new QueryBuilder('profiles');
    qb._select = 'id,username,avatar_emoji,avatar_url,wins,losses,skill_level,city';
    qb.eq('id', userId);
    const {data} = await qb.execute();
    if(data && data[0]) {
      renderPlayerProfileData(data[0]);
    } else {
      document.getElementById('pp-details').innerHTML = '';
    }
  } catch(e) {
    document.getElementById('pp-details').innerHTML = '';
    console.warn('Player profile load error', e);
  }
}

function renderPlayerProfileData(profile) {
  // Avatar mit vollständigen Daten aktualisieren (inkl. avatar_url)
  const avEl = document.getElementById('pp-avatar');
  if (avEl) avEl.innerHTML = getAvatarHtml(profile, {size: 72});

  // Stadt
  const cityEl = document.getElementById('pp-city');
  if(profile.city) {
    cityEl.innerHTML = `${ic('pin',13)} ${escAttr(profile.city)}`;
    cityEl.style.display = '';
  }

  // Stats
  const wins    = profile.wins   || 0;
  const losses  = profile.losses || 0;
  const total   = wins + losses;
  const evCount = allEvents.filter(e => e.creatorId === profile.id).length;

  document.getElementById('pp-stats').innerHTML = `
    <div class="pp-stat">
      <div class="pp-stat-val green">${wins}</div>
      <div class="pp-stat-label">Siege</div>
    </div>
    <div class="pp-stat">
      <div class="pp-stat-val red">${losses}</div>
      <div class="pp-stat-label">Niederlagen</div>
    </div>
    <div class="pp-stat">
      <div class="pp-stat-val">${total}</div>
      <div class="pp-stat-label">Spiele</div>
    </div>
    ${evCount > 0 ? `<div class="pp-stat"><div class="pp-stat-val">${evCount}</div><div class="pp-stat-label">Runden</div></div>` : ''}
  `;

  // Spielniveau
  const skillMap = {
    anfaenger:     '🐣 Anfänger',
    fortgeschritten:'🏓 Fortgeschritten',
    profi:         '⚡ Profi'
  };
  const skillText = profile.skill_level ? skillMap[profile.skill_level] : null;

  document.getElementById('pp-details').innerHTML = skillText
    ? `<div class="pp-details-section">
         <div class="pp-detail-row">
           <span class="pp-detail-label">Spielniveau</span>
           <span class="pp-detail-val">${skillText}</span>
         </div>
       </div>`
    : '';
}
