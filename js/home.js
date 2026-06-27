// ╔══════════════════════════════════════════════════════════════╗
// ║           HOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝

// Show cached city in hero — no automatic geolocation request
(function detectCity() {
  try {
    const cached = JSON.parse(localStorage.getItem('tt_hero_city') || 'null');
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
      const el = document.getElementById('hero-city');
      if (el) el.textContent = 'in ' + cached.city;
    }
  } catch(_) {}
})();

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

function renderHome() {
  initWelcomeCard();

  // Begrüßung personalisieren
  if(currentUser) {
    document.querySelector('.hero-greeting').textContent =
      `Hallo, ${currentUser.username}! 👋`;
  }

  // Action-Card Icons einmalig befüllen
  const _sacIcons = [['map-pinned',20],['users',20],['calendar-plus',20]];
  document.querySelectorAll('.sac-icon-wrap').forEach((el, i) => {
    if (!el.hasChildNodes() && _sacIcons[i]) el.innerHTML = ic(_sacIcons[i][0], _sacIcons[i][1]);
  });

  // Platten-Karten
  const scroll = document.getElementById('home-tables-scroll');
  const src = tables.length ? tables : FALLBACK_TABLES;
  scroll.innerHTML = src.slice(0,6).map((t, i)=>{
    const evCount = t.events?.length || FALLBACK_EVENTS.filter(e=>e.tid===t.id).length;
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
  const evSrc = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const evList = document.getElementById('home-events-list');
  const evFiltered = evSrc.filter(e => e.type !== 'player_search').slice(0, 3);
  evList.innerHTML = evFiltered.length
    ? evFiltered.map((e, i) => renderEventCard(e, i)).join('')
    : '<div style="text-align:center;padding:32px 16px;color:var(--text-dim);">Noch keine Spiele geplant.</div>';
}

function renderHomePsSection() {
  const container = document.getElementById('home-ps-section');
  if(!container) return;
  if(!allPlayerSearches.length) {
    container.innerHTML = '';
    return;
  }
  const first = allPlayerSearches[0];
  const spielartLabels = {casual: 'Just 4 Fun', training: 'Training', ranked: 'Punktspiel', punktspiel: 'Punktspiel'};
  const avHtml = getAvatarHtml({ avatar_emoji: first.avatarEmoji, avatar_url: first.avatarUrl, username: first.username }, { size: 36 });
  const metaParts = [];
  if(first.umkreis && first.umkreis !== 'Egal') metaParts.push(first.umkreis + ' Umkreis');
  if(first.wann && first.wann !== 'Egal') metaParts.push(first.wann);
  const extraCount = allPlayerSearches.length - 1;
  const profileClick = `event.stopPropagation();showPlayerProfile('${escAttr(first.userId||'')}','${escAttr(first.username||'')}','${escAttr(first.avatarEmoji||'')}')`;
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">Mitspieler gesucht</div>
      <a class="section-link" onclick="activateMitspielerFilter()">Alle ansehen →</a>
    </div>
    <div class="home-ps-card" onclick="showPlayerSearchDetail(${first.id})">
      <div class="hpsc-left">
        <div class="hpsc-av pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="hpsc-info">
          <div class="hpsc-name pp-clickable" onclick="${profileClick}">${escHtml(first.username || 'Spieler')}</div>
          <div class="hpsc-type">sucht <b>${spielartLabels[first.spielart] || 'Mitspieler'}</b></div>
          ${metaParts.length ? `<div class="hpsc-meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
        </div>
      </div>
      ${extraCount > 0
        ? `<span class="hpsc-more">+${extraCount} weitere</span>`
        : `<span class="hpsc-chevron">›</span>`}
    </div>`;
}

function navStat(type) {
  if (type === 'map') {
    showPage('map');
  } else if (type === 'events') {
    showPage('events');
    const allPill = document.querySelector('#event-filter-pills .filter-pill');
    if (allPill) filterEvents('all', allPill);
  } else if (type === 'searches') {
    activateMitspielerFilter();
  }
}
