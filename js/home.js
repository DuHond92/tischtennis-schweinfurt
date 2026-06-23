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
  scroll.innerHTML = src.slice(0,6).map(t=>`
    <div class="map-thumb-card" onclick="showTableDetail(${t.id})">
      <div class="map-thumb-img">
        ${t.icon}
        <span class="map-thumb-badge ${t.type==='indoor'?'badge-in':'badge-out'}">${t.type==='indoor'?'Indoor':'Outdoor'}</span>
        ${(t.events?.length||FALLBACK_EVENTS.filter(e=>e.tid===t.id).length)?`<span class="map-thumb-badge badge-ev" style="top:auto;bottom:8px;right:8px;">📅 ${t.events?.length||FALLBACK_EVENTS.filter(e=>e.tid===t.id).length}</span>`:''}
      </div>
      <div class="map-thumb-body">
        <div class="map-thumb-name">${t.name}</div>
        <div class="map-thumb-dist">📍 ${(t.addr||'').split(',')[0]}${t.distance!=null?' · '+formatDistance(t.distance)+'  entfernt':''}</div>
        ${t.events?.length?`<div class="map-thumb-ev">📅 ${t.events.length} Event${t.events.length>1?'s':''}</div>`:''}
      </div>
    </div>
  `).join('');

  // Events
  const evSrc = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const evList = document.getElementById('home-events-list');
  evList.innerHTML = evSrc.slice(0,5).map(e=>`
    <div class="event-list-item" onclick="showEventDetail(${e.id})">
      <div class="ev-date-box">
        <div class="ev-day">${e.day}</div>
        <div class="ev-mon">${e.mon}</div>
      </div>
      <div class="ev-info">
        <div class="ev-title">${e.name}</div>
        <div class="ev-meta">📍 ${e.tname} · ⏰ ${e.time} · 👥 ${e.p}/${e.max}</div>
      </div>
      <div class="ev-type-pill pill-${e.type}">${e.type==='casual'?'Casual':e.type==='ranked'?'Ranked':'Turnier'}</div>
    </div>
  `).join('');
}
