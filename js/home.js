// ╔══════════════════════════════════════════════════════════════╗
// ║           HOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝

// Zentraler Helper: liefert Ortsname oder null (Fallback: "in deiner Nähe")
// Priorität: Profil-Stadt → localStorage-Cache (6 h) → null
function getCurrentLocationLabel() {
  if (typeof currentUser !== 'undefined' && currentUser?.city) return currentUser.city;
  try {
    const c = JSON.parse(localStorage.getItem('tt_hero_city') || 'null');
    if (c?.city && Date.now() - c.ts < 6 * 60 * 60 * 1000) return c.city;
  } catch(_) {}
  return null;
}

function updateHeroLocation() {
  const el = document.getElementById('hero-city');
  if (!el) return;
  const label = getCurrentLocationLabel();
  el.textContent = label ? `in ${label}` : 'in deiner Nähe';
  // Profil-Stadt in Cache schreiben, damit sie beim nächsten Laden sofort da ist
  if (label && typeof currentUser !== 'undefined' && currentUser?.city === label) {
    try { localStorage.setItem('tt_hero_city', JSON.stringify({ city: label, ts: Date.now() })); } catch(_) {}
  }
}

// Beim Laden sofort gecachten Ort zeigen (kein Geolocation-Request)
updateHeroLocation();

function initWelcomeCard() {
  if (localStorage.getItem('tt_welcomed')) return;
  const el = document.getElementById('home-welcome-card');
  if (!el) return;
  el.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-card-title">👋 Willkommen bei PlattenTreff</div>
      <div class="welcome-card-body">Entdecke Tischtennisplatten, finde Mitspieler und verabrede dich spontan zum Spielen.</div>
      <button class="welcome-card-btn" onclick="dismissWelcomeCard()">Verstanden</button>
    </div>`;
  el.style.display = '';
}

function dismissWelcomeCard() {
  localStorage.setItem('tt_welcomed', '1');
  const el = document.getElementById('home-welcome-card');
  if (el) el.style.display = 'none';
}

function getMyActiveEvents() {
  if (!sb.isLoggedIn()) return [];
  const myId     = String(sb.getUserId());
  const todayStr = new Date().toISOString().slice(0, 10);
  return allEvents
    .filter(ev =>
      ev.dateStr >= todayStr &&
      (ev.participants.some(p => String(p.id) === myId) || String(ev.creatorId) === myId)
    )
    .sort((a, b) => (a.dateStr + (a.time || '')).localeCompare(b.dateStr + (b.time || '')));
}

function getMyActiveRequests() {
  if (!sb.isLoggedIn()) return [];
  const myId = String(sb.getUserId());
  return allPlayerSearches.filter(ps => String(ps.userId) === myId);
}

function renderHomeActivities() {
  const container = document.getElementById('home-activities-section');
  if (!container) return;
  if (!sb.isLoggedIn() || !currentUser) { container.innerHTML = ''; return; }

  if (!window._eventsLoaded) {
    container.innerHTML = `<div class="home-act-section">
      <div class="home-act-head"><div class="home-act-headrow"><span class="home-act-headtitle">Deine Aktivitäten</span></div></div>
      <div class="skeleton-card"></div><div class="skeleton-card" style="opacity:0.6"></div>
    </div>`;
    return;
  }

  const myEvents   = getMyActiveEvents();
  const myRequests = getMyActiveRequests();
  const total      = myEvents.length + myRequests.length;
  if (total === 0) { container.innerHTML = ''; return; }

  // Subtitle: "2 Spiele · 1 Gesuch"
  const subtitleParts = [];
  if (myEvents.length)   subtitleParts.push(`${myEvents.length} ${myEvents.length === 1 ? 'Spiel' : 'Spiele'}`);
  if (myRequests.length) subtitleParts.push(`${myRequests.length} ${myRequests.length === 1 ? 'Gesuch' : 'Gesuche'}`);

  // Alle Items zusammenführen: Events zuerst (nach Datum), dann Gesuche
  const MAX = 3;
  const allItems = [
    ...myEvents.map(e  => ({ kind: 'event',   data: e  })),
    ...myRequests.map(ps => ({ kind: 'request', data: ps }))
  ];
  const visible = allItems.slice(0, MAX);
  const hasMore = total > MAX;

  const cardsHtml = visible.map(item => {
    if (item.kind === 'event') {
      const e = item.data;
      return `
        <div class="home-act-card" onclick="showEventDetail(${e.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')showEventDetail(${e.id})">
          <div class="home-act-body">
            <div class="home-act-title">${escHtml(e.name)}</div>
            <div style="margin:2px 0 3px;">${gameTypePill(e.type)}</div>
            <div class="home-act-meta">${ic('calendar',10)} ${formatEventDate(e)} &nbsp;·&nbsp; ${ic('pin',10)} ${escHtml(e.tname)} &nbsp;·&nbsp; ${ic('users',10)} ${e.p}/${e.max}</div>
          </div>
          <span class="home-act-chevron">›</span>
        </div>`;
    } else {
      const ps = item.data;
      const metaParts = [];
      if (ps.wann    && ps.wann    !== 'Egal') metaParts.push(`${ic('clock',10)} ${escHtml(ps.wann)}`);
      if (ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`${ic('pin',10)} ${escHtml(ps.umkreis)} Umkreis`);
      return `
        <div class="home-act-card" onclick="showPlayerSearchDetail(${ps.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')showPlayerSearchDetail(${ps.id})">
          <div class="home-act-body">
            <div class="home-act-label">${ic('users', 10)} Aktives Gesuch</div>
            <div class="home-act-title">Mitspieler gesucht</div>
            <div style="margin:2px 0 3px;">${gameTypePill(ps.spielart)}</div>
            ${metaParts.length ? `<div class="home-act-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>` : ''}
          </div>
          <span class="home-act-chevron">›</span>
        </div>`;
    }
  }).join('');

  const moreHtml = hasMore
    ? `<div class="home-act-more" onclick="showPage('events')">${ic('calendar', 12)} Alle ${total} Aktivitäten ansehen</div>`
    : '';

  container.innerHTML = `
    <div class="home-act-section">
      <div class="home-act-head">
        <div class="home-act-headrow">
          <span class="home-act-headtitle">Deine Aktivitäten</span>
          <span class="act-badge">${total}</span>
        </div>
        <div class="home-act-subtitle">${subtitleParts.join(' · ')}</div>
      </div>
      <div class="home-act-list">${cardsHtml}</div>
      ${moreHtml}
    </div>`;
}

function renderHome() {
  initWelcomeCard();

  // Begrüßung + Ort aktualisieren
  const greetEl = document.querySelector('.hero-greeting');
  if (greetEl) {
    greetEl.textContent = currentUser
      ? `Hallo, ${currentUser.username}! 👋`
      : 'Willkommen! 👋';
  }
  updateHeroLocation();

  // Action-Card Icons einmalig befüllen
  const _sacIcons = [['map-pinned',20],['users',20],['calendar-plus',20]];
  document.querySelectorAll('.sac-icon-wrap').forEach((el, i) => {
    if (!el.hasChildNodes() && _sacIcons[i]) el.innerHTML = ic(_sacIcons[i][0], _sacIcons[i][1]);
  });

  // Aktivitäten des eingeloggten Users
  renderHomeActivities();

  // Platten-Karten
  const scroll = document.getElementById('home-tables-scroll');
  const src = tables.length ? tables : FALLBACK_TABLES;
  scroll.innerHTML = src.slice(0,6).map((t, i)=>{
    const evCount = t.events?.length || 0;
    const _plateFb = t.type === 'indoor' ? 'images/placeholders/plate_indoor.png' : 'images/placeholders/plate_outdoor.png';
    const _load = i < 2 ? 'eager' : 'lazy';
    const thumbInner = (t.photos && t.photos.length)
      ? `<img src="${t.photos[0]}" onerror="this.src='${_plateFb}'" loading="${_load}" decoding="async">`
      : `<img src="${_plateFb}" loading="${_load}" decoding="async" class="thumb-placeholder-img">`;
    return `
    <div class="map-thumb-card" onclick="showTableDetail(${t.id})">
      <div class="map-thumb-img">
        ${thumbInner}
        <span class="map-thumb-badge ${t.type==='indoor'?'badge-in':'badge-out'}">${t.type==='indoor'?'Indoor':'Outdoor'}</span>
        ${evCount?`<span class="map-thumb-badge badge-ev" style="top:auto;bottom:8px;right:8px;">${ic('calendar',12)} ${evCount}</span>`:''}
      </div>
      <div class="map-thumb-body">
        <div class="map-thumb-name">${t.name}</div>
        <div class="map-thumb-dist">${ic('pin')} ${(t.addr||'').split(',')[0]}${t.distance!=null?' · '+formatDistance(t.distance)+' entfernt':''}</div>
      </div>
    </div>`;
  }).join('');

  // Mitspieler-Section
  renderHomePsSection();

  // Events
  const evSrc = allEvents;
  const evList = document.getElementById('home-events-list');
  const evFiltered = evSrc.filter(e => e.type !== 'player_search').slice(0, 3);
  evList.innerHTML = evFiltered.length
    ? evFiltered.map((e, i) => renderEventCard(e, i)).join('')
    : '<div style="text-align:center;padding:32px 16px;color:var(--text-dim);">Noch keine Spiele geplant.</div>';
}

function renderHomePsSection() {
  const container = document.getElementById('home-ps-section');
  if(!container) return;
  if(!allPlayerSearches.length) { container.innerHTML = ''; return; }

  const radius = (typeof _psRadius !== 'undefined') ? _psRadius : 5;
  const { list: filtered, noLocation } = (typeof _psGetFiltered === 'function')
    ? _psGetFiltered(allPlayerSearches)
    : { list: allPlayerSearches, noLocation: true };

  const countBadge = filtered.length > 0
    ? ` <span class="ps-count-chip" style="margin-left:5px;vertical-align:middle;">${filtered.length}</span>`
    : '';

  const headerHtml = `
    <div class="section-header">
      <div class="section-title">Mitspieler gesucht${countBadge}</div>
      <a class="section-link" onclick="activateMitspielerFilter()">Alle ansehen →</a>
    </div>`;

  const chipLabel = (typeof _psChipLabel === 'function') ? _psChipLabel() : `Umkreis: ${radius} km`;
  const radiusChip = `<div class="hps-filter-line">
    <button class="hps-radius-chip-btn" onclick="openPsRadiusSheet()">${ic('pin', 11)} ${chipLabel} ▾</button>
  </div>`;

  if (!filtered.length) {
    container.innerHTML = `${headerHtml}
      <div class="hps-filter-line">
        <button class="hps-radius-chip-btn" onclick="openPsRadiusSheet()">${ic('pin', 11)} ${chipLabel} ▾</button>
        <span class="hps-empty-note">Keine Gesuche gefunden</span>
      </div>`;
    return;
  }

  const first = filtered[0];
  const avHtml = getAvatarHtml({ avatar_emoji: first.avatarEmoji, avatar_url: first.avatarUrl, username: first.username }, { size: 36 });
  const dist = (typeof _psDist === 'function') ? _psDist(first) : null;
  const metaParts = [];
  if (dist != null) metaParts.push(`~${(Math.round(dist / 100) / 10).toFixed(1)} km`);
  if (first.wann && first.wann !== 'Egal') metaParts.push(first.wann);

  const profileClick = `event.stopPropagation();showPlayerProfile('${escAttr(first.userId||'')}','${escAttr(first.username||'')}','${escAttr(first.avatarEmoji||'')}',null,'${escAttr(first.avatarUrl||'')}')`;
  container.innerHTML = `${headerHtml}${radiusChip}
    <div class="home-ps-card" onclick="showPlayerSearchDetail(${first.id})">
      <div class="hpsc-left">
        <div class="hpsc-av pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="hpsc-info">
          <div class="hpsc-name pp-clickable" onclick="${profileClick}">${escHtml(first.username || 'Spieler')}</div>
          <div class="hpsc-type">${gameTypePill(first.spielart)}</div>
          ${metaParts.length ? `<div class="hpsc-meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
          ${first.message ? `<div class="hpsc-msg">${escHtml(first.message.length > 55 ? first.message.slice(0,55)+'…' : first.message)}</div>` : ''}
        </div>
      </div>
      <span class="hpsc-chevron">›</span>
    </div>`;
}

function navStat(type) {
  if (type === 'map') {
    showPage('map');
  } else if (type === 'events') {
    showPage('events');
    resetEventFilters();
  } else if (type === 'searches') {
    activateMitspielerFilter();
  }
}
