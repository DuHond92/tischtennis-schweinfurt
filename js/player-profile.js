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

async function showPlayerProfile(userId, username, avatarEmoji, contextLabel, avatarUrl) {
  _ppCurrentUserId    = userId;
  _ppCurrentUserName  = username    || '';
  _ppCurrentUserEmoji = avatarEmoji || '';
  _ppCurrentUserUrl   = avatarUrl   || null;

  // Sofort Basis-Info anzeigen
  const avEl   = document.getElementById('pp-avatar');
  const nameEl = document.getElementById('pp-username');
  const hostEl = document.getElementById('pp-host-badge');
  const cityEl = document.getElementById('pp-city');

  avEl.innerHTML = getAvatarHtml({ avatar_url: avatarUrl || null, avatar_emoji: avatarEmoji, username }, {size: 72});
  nameEl.textContent = username || 'Spieler';

  if(contextLabel) {
    hostEl.textContent = contextLabel;
    hostEl.style.display = '';
  } else {
    hostEl.style.display = 'none';
  }
  cityEl.style.display = 'none';
  cityEl.textContent   = '';

  // pp-stats entfernt (v1: kein Match-System)
  document.getElementById('pp-details').innerHTML = ptLoader('Lade Profil…', true);

  // Verbindungs-Button rendern
  const connEl = document.getElementById('pp-connection-btn');
  if (connEl) {
    const myId = sb.getUserId();
    if (!userId || userId === myId) {
      connEl.innerHTML = '';
    } else if (typeof _myConnections !== 'undefined' && _myConnections === null) {
      connEl.innerHTML = '<button class="btn btn-secondary btn-full" disabled style="opacity:.5">Lade…</button>';
      loadMyConnections().then(() => {
        if (_ppCurrentUserId === userId) connEl.innerHTML = getConnectionButtonHtml(userId);
      });
    } else {
      connEl.innerHTML = typeof getConnectionButtonHtml === 'function' ? getConnectionButtonHtml(userId) : '';
    }
  }

  openPlayerSheet();

  if(!userId) {
    document.getElementById('pp-details').innerHTML = '';
    return;
  }

  try {
    const qb = new QueryBuilder('profiles');
    qb._select = 'id,username,avatar_emoji,avatar_url,skill_level,city';
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
  // Avatar + globale URL-State mit vollständigen Daten aktualisieren
  _ppCurrentUserUrl   = profile.avatar_url   || null;
  _ppCurrentUserEmoji = profile.avatar_emoji || '';
  const avEl = document.getElementById('pp-avatar');
  if (avEl) avEl.innerHTML = getAvatarHtml(profile, {size: 72});

  // Stadt
  const cityEl = document.getElementById('pp-city');
  if(profile.city) {
    cityEl.innerHTML = `${ic('pin',13)} ${escAttr(profile.city)}`;
    cityEl.style.display = '';
  }

  // Statistiken entfernt (v1: kein Match-System)

  // Spielniveau
  const skillMap = {
    anfaenger:      'Anfänger',
    fortgeschritten: 'Fortgeschritten',
    profi:           'Profi'
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
