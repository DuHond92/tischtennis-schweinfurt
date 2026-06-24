// ╔══════════════════════════════════════════════════════════════╗
// ║           HOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝

// Detect city via GPS + Nominatim reverse geocoding (cached 6h)
(function detectCity() {
  const CACHE_KEY = 'tt_hero_city';
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  function setHeroCity(name) {
    const el = document.getElementById('hero-city');
    if(el) el.textContent = 'in ' + name;
  }

  // Check cache first
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if(cached && Date.now() - cached.ts < CACHE_TTL) {
      setHeroCity(cached.city);
      return;
    }
  } catch(_) {}

  if(!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=de`)
      .then(r => r.json())
      .then(data => {
        const a    = data.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county || 'deiner Nähe';
        localStorage.setItem(CACHE_KEY, JSON.stringify({ city, ts: Date.now() }));
        setHeroCity(city);
      })
      .catch(() => {});
  }, () => {}, { timeout: 8000, maximumAge: CACHE_TTL });
})();

function renderHome() {
  // Begrüßung personalisieren
  if(currentUser) {
    document.querySelector('.hero-greeting').textContent =
      `Hallo, ${currentUser.username}! 👋`;
  }

  // Counter
  animateCount(document.getElementById('c-tables'),   tables.length || 9);
  animateCount(document.getElementById('c-events'),   allEvents.length || FALLBACK_EVENTS.length);
  animateCount(document.getElementById('c-searches'), allPlayerSearches.length);

  // Platten-Karten
  const scroll = document.getElementById('home-tables-scroll');
  const src = tables.length ? tables : FALLBACK_TABLES;
  const PH = 'images/placeholders/placeholder-plate.webp';
  scroll.innerHTML = src.slice(0,6).map(t=>{
    const thumb = (t.photos && t.photos.length) ? t.photos[0] : PLATE_TEST_IMAGES[0];
    const evCount = t.events?.length || FALLBACK_EVENTS.filter(e=>e.tid===t.id).length;
    return `
    <div class="map-thumb-card" onclick="showTableDetail(${t.id})">
      <div class="map-thumb-img">
        <img src="${thumb}" onerror="this.src='${PH}'" loading="lazy">
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
  const EV_IMGS = ['images/events/event1.webp','images/events/event2.webp','images/events/event3.webp'];
  const EV_PH = 'images/placeholders/placeholder-plate.webp';
  evList.innerHTML = evSrc.slice(0, 5).map((e, idx)=>`
    <div class="event-list-item" onclick="showEventDetail(${e.id})">
      <div class="ev-thumb">
        <img src="${EV_IMGS[idx % EV_IMGS.length]}" onerror="this.src='${EV_PH}'" loading="lazy">
        <div class="ev-date-overlay"><div class="ev-day">${e.day}</div><div class="ev-mon">${e.mon}</div></div>
      </div>
      <div class="ev-info">
        <div class="ev-type-pill pill-${e.type}" style="margin-bottom:5px;">${typeLabel(e.type)}</div>
        <div class="ev-title">${e.name}</div>
        <div class="ev-meta-loc">${ic('pin')} ${e.tname}</div>
        <div class="ev-meta-time">${ic('clock')} ${e.time}</div>
        <div class="ev-participants-row">${participantStack(e.participants,3,26)}<span class="ev-pcount">${e.p}/${e.max}</span></div>
      </div>
    </div>
  `).join('');
}

function renderHomePsSection() {
  const container = document.getElementById('home-ps-section');
  if(!container) return;
  if(!allPlayerSearches.length) {
    container.innerHTML = '';
    return;
  }
  const first = allPlayerSearches[0];
  const spielartLabels = {casual: 'Just 4 Fun', training: 'Training', ranked: 'Spiel um Punkte'};
  const avHtml = first.avatarEmoji
    ? `<span style="font-size:1.6rem;line-height:1;">${first.avatarEmoji}</span>`
    : initAvatar(first.username || '?', 36);
  const metaParts = [];
  if(first.umkreis && first.umkreis !== 'Egal') metaParts.push(first.umkreis + ' Umkreis');
  if(first.wann && first.wann !== 'Egal') metaParts.push(first.wann);
  const extraCount = allPlayerSearches.length - 1;
  container.innerHTML = `
    <div class="section-header">
      <div class="section-title">👥 Mitspieler gesucht</div>
      <a class="section-link" onclick="activateMitspielerFilter()">Alle ansehen →</a>
    </div>
    <div class="home-ps-card" onclick="showPlayerSearchDetail(${first.id})">
      <div class="hpsc-av">${avHtml}</div>
      <div class="hpsc-info">
        <div class="hpsc-name">${escHtml(first.username || 'Spieler')}</div>
        <div class="hpsc-type">sucht <b>${spielartLabels[first.spielart] || 'Mitspieler'}</b></div>
        ${metaParts.length ? `<div class="hpsc-meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
      </div>
      ${extraCount > 0
        ? `<span class="hpsc-more">+${extraCount} weitere</span>`
        : `<span class="hpsc-chevron">›</span>`}
    </div>`;
}
