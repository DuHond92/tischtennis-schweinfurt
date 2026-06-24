// ╔══════════════════════════════════════════════════════════════╗
// ║           HOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝
function renderHome() {
  // Begrüßung personalisieren
  if(currentUser) {
    document.querySelector('.hero-greeting').textContent =
      `Hallo, ${currentUser.username}! 👋`;
  }

  // Counter
  animateCount(document.getElementById('c-tables'),  tables.length    || 9);
  animateCount(document.getElementById('c-events'),  (allEvents.length || FALLBACK_EVENTS.length));
  animateCount(document.getElementById('c-players'), allPlayers.length|| 0);

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

  // Events
  const evSrc = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const evList = document.getElementById('home-events-list');
  const EV_IMGS = ['images/events/event1.webp','images/events/event2.webp','images/events/event3.webp'];
  const EV_PH = 'images/placeholders/placeholder-plate.webp';
  evList.innerHTML = evSrc.slice(0,5).map((e, idx)=>`
    <div class="event-list-item" onclick="showEventDetail(${e.id})">
      <div class="ev-thumb">
        <img src="${EV_IMGS[idx % EV_IMGS.length]}" onerror="this.src='${EV_PH}'" loading="lazy">
        <div class="ev-date-overlay"><div class="ev-day">${e.day}</div><div class="ev-mon">${e.mon}</div></div>
      </div>
      <div class="ev-info">
        <div class="ev-title">${e.name}</div>
        <div class="ev-meta-loc">${ic('pin')} ${e.tname}</div>
        <div class="ev-meta-time">${ic('clock')} ${e.time} &nbsp;·&nbsp; ${ic('users')} ${e.p}/${e.max}</div>
      </div>
      <div class="ev-type-pill pill-${e.type}">${e.type==='casual'?'Just 4 Fun':e.type==='ranked'?'Wertungsspiel':e.type==='training'?'Training':'Spiel'}</div>
    </div>
  `).join('');
}
