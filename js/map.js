// ╔══════════════════════════════════════════════════════════════╗
// ║           MAP                                                ║
// ╚══════════════════════════════════════════════════════════════╝

// MAP_STYLE: 'voyager' | 'positron' | 'osm'
const MAP_STYLE = 'voyager';

const MAP_TILES = {
  voyager:  { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
               attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>' },
  positron: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
               attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>' },
  osm:      { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
               attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
};

let leafletMap, markers = [];
let mapSearchQuery   = '';
let mapSpielartFilter = 'all'; // 'all' | 'casual' | 'training' | 'ranked'
let mapPlaceFilter    = 'all'; // 'all' | 'indoor' | 'outdoor'

function initMap() {
  leafletMap = L.map('map', { center:[50.0490,10.2310], zoom:14, zoomControl:false });
  const tile = MAP_TILES[MAP_STYLE] || MAP_TILES.voyager;
  L.tileLayer(tile.url, {
    attribution: tile.attr,
    maxZoom: 19,
    subdomains: 'abcd',
    detectRetina: true
  }).addTo(leafletMap);

  const src = tables.length ? tables : FALLBACK_TABLES;
  src.forEach(t => addMarker(t));
  renderMapList(src);
  initBottomSheet();
}

function addMarker(t) {
  const color   = t.type === 'indoor' ? '#3B7CF4' : '#22C55E';
  const evCount = t.events?.length || 0;
  const icon = L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:1rem;
      box-shadow:0 3px 12px rgba(0,0,0,0.25);border:2px solid #fff;cursor:pointer;position:relative;">
      🏓${evCount ? `<span style="position:absolute;top:-5px;right:-5px;background:#EF4444;
        color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;
        display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">${evCount}</span>` : ''}
    </div>`,
    iconSize:[36,36], iconAnchor:[18,18]
  });
  const m = L.marker([t.lat, t.lng], { icon }).addTo(leafletMap);
  m.on('click', () => { showTableDetail(t.id); selectMapItem(t.id); });
  markers.push({ id: t.id, m });
}

// ── SEARCH ────────────────────────────────────────────────────────────────────

function onMapSearch() {
  const input = document.getElementById('map-search');
  mapSearchQuery = (input?.value || '').toLowerCase().trim();
  const clear = document.getElementById('map-search-clear');
  if(clear) clear.style.display = mapSearchQuery ? '' : 'none';
  _applyMapFilters();
}

function clearMapSearch() {
  const input = document.getElementById('map-search');
  if(input) input.value = '';
  mapSearchQuery = '';
  document.getElementById('map-search-clear').style.display = 'none';
  _applyMapFilters();
}

// ── SPIELART FILTER ───────────────────────────────────────────────────────────

function setMapSpielart(val, btn) {
  mapSpielartFilter = val;
  // sync pills in bottom sheet
  document.querySelectorAll('[data-spielart]').forEach(p =>
    p.classList.toggle('active', p.dataset.spielart === val));
  // sync filter sheet
  document.querySelectorAll('#fms-spielart-opts .fms-option').forEach(o =>
    o.classList.toggle('active', o.dataset.val === val));
  _updateFilterBtnState();
  _applyMapFilters();
}

function setMapPlace(val, btn) {
  mapPlaceFilter = val;
  // sync pills in bottom sheet
  document.querySelectorAll('[data-place]').forEach(p =>
    p.classList.toggle('active', p.dataset.place === val));
  // sync filter sheet
  document.querySelectorAll('#fms-place-opts .fms-option').forEach(o =>
    o.classList.toggle('active', o.dataset.val === val));
  _updateFilterBtnState();
  _applyMapFilters();
}

// Called from filter sheet
function setFmsSpielart(val, btn) { setMapSpielart(val, btn); }
function setFmsPlace(val, btn)    { setMapPlace(val, btn); }

// Old entry-point kept for compatibility (pills still call this if referenced elsewhere)
function setMapFilter(type) {
  if(type === 'indoor' || type === 'outdoor') setMapPlace(type);
  else setMapSpielart(type);
}

function _updateFilterBtnState() {
  const hasFilter = mapSpielartFilter !== 'all' || mapPlaceFilter !== 'all';
  document.getElementById('map-filter-btn')?.classList.toggle('active', hasFilter);
}

function openMapFilterSheet() {
  openSheet('map-filter-sheet');
}

function cycleMapTypeFilter() {
  openMapFilterSheet();
}

function getFilteredTables(src) {
  let filtered = src;
  if(mapSearchQuery) {
    filtered = filtered.filter(t =>
      (t.name || '').toLowerCase().includes(mapSearchQuery) ||
      (t.addr || '').toLowerCase().includes(mapSearchQuery)
    );
  }
  if(mapPlaceFilter !== 'all') {
    filtered = filtered.filter(t => t.type === mapPlaceFilter);
  }
  if(mapSpielartFilter !== 'all') {
    filtered = filtered.filter(t =>
      (t.events || []).some(e => e.type === mapSpielartFilter)
    );
  }
  return filtered;
}

function _applyMapFilters() {
  const src      = tables.length ? tables : FALLBACK_TABLES;
  const filtered = getFilteredTables(src);
  renderMapList(filtered);
  _updateMarkerVisibility(filtered);
}

function _updateMarkerVisibility(filtered) {
  const ids = new Set(filtered.map(t => t.id));
  markers.forEach(({ id, m }) => {
    const el = m.getElement();
    if(el) el.style.opacity = ids.has(id) ? '1' : '0.22';
  });
}

// ── LOCATION ──────────────────────────────────────────────────────────────────

let userLat = null, userLng = null, userMarker = null;

function centerMap() {
  if(leafletMap) leafletMap.setView([50.0490,10.2310], 14, { animate:true });
}

function locateUser() {
  if(!navigator.geolocation) { showToast('Standort nicht verfügbar','⚠️'); return; }
  const btn = document.getElementById('locate-btn');
  btn?.classList.add('locating');
  navigator.geolocation.getCurrentPosition(pos => {
    btn?.classList.remove('locating');
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    if(leafletMap) {
      if(userMarker) leafletMap.removeLayer(userMarker);
      userMarker = L.circle([userLat, userLng], {
        radius: pos.coords.accuracy,
        color:'#3B7CF4', fillColor:'#3B7CF4', fillOpacity:0.1, weight:2
      }).addTo(leafletMap);
      L.circleMarker([userLat, userLng], {
        radius:8, color:'#fff', weight:3,
        fillColor:'#3B7CF4', fillOpacity:1
      }).addTo(leafletMap).bindPopup('📍 Du bist hier');
      leafletMap.setView([userLat, userLng], 15, { animate:true });
    }
    updateDistances();
    showToast('📍 Standort gefunden!');
  }, () => {
    document.getElementById('locate-btn')?.classList.remove('locating');
    showToast('Standort konnte nicht ermittelt werden','⚠️');
  }, { enableHighAccuracy:true, timeout:10000 });
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function formatDistance(m) {
  return m < 1000 ? `${m}m` : `${(m/1000).toFixed(1)}km`;
}

function updateDistances() {
  if(!userLat || !userLng) return;
  const src = tables.length ? tables : FALLBACK_TABLES;
  src.forEach(t => { t.distance = calcDistance(userLat, userLng, t.lat, t.lng); });
  src.sort((a,b) => (a.distance||99999) - (b.distance||99999));
  _applyMapFilters();
  renderHome();
}

// ── LIST ──────────────────────────────────────────────────────────────────────

function selectMapItem(id) {
  document.querySelectorAll('.map-list-item').forEach(el =>
    el.classList.toggle('selected', el.dataset.id == id));
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === id);
  if(t && leafletMap) leafletMap.setView([t.lat, t.lng], 16, { animate:true });
  const selected = document.querySelector('.map-list-item.selected');
  if(selected) selected.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function _buildStatusLine(filtered) {
  const total     = (tables.length ? tables : FALLBACK_TABLES).length;
  const count     = filtered.length;
  const hasSearch = !!mapSearchQuery;
  const hasSpiela = mapSpielartFilter !== 'all';
  const hasPlace  = mapPlaceFilter    !== 'all';
  const hasFilter = hasSpiela || hasPlace;

  let parts = [];

  if(hasSearch) {
    parts.push(`🔍 <b>"${escHtml(mapSearchQuery)}"</b>`);
  }

  if(hasSpiela) {
    const labels = {casual:'🎉 Just 4 Fun', training:'🎯 Training', ranked:'🏓 Spiel um Punkte'};
    parts.push(labels[mapSpielartFilter] || mapSpielartFilter);
  }
  if(hasPlace) {
    parts.push(mapPlaceFilter === 'indoor' ? '🏠 Indoor' : '☀️ Outdoor');
  }

  const filterHint = parts.length ? `<span class="mbs-status-filter">${parts.join(' · ')}</span>` : '';
  const countWord  = (hasSearch || hasFilter) ? 'passende' : '';
  const countText  = count === 0
    ? 'Keine Platten gefunden'
    : `${count} ${countWord} Platte${count !== 1 ? 'n' : ''}`;

  return filterHint
    ? `<div class="mbs-status">${filterHint}<span class="mbs-status-count">${countText}</span></div>`
    : `<div class="mbs-status"><span class="mbs-status-count">${countText}</span></div>`;
}

function renderMapList(list) {
  const c = document.getElementById('map-list-container');
  const statusHtml = _buildStatusLine(list);

  if(!list.length) {
    c.innerHTML = statusHtml + `<div class="map-list-empty">Keine Platten gefunden.<br><span style="font-size:0.8rem;color:var(--text-xdim);">Filter anpassen oder Suche leeren.</span></div>`;
    return;
  }

  const PH = 'images/placeholders/placeholder-plate.webp';
  c.innerHTML = statusHtml + list.map(t => {
    const thumb    = (t.photos && t.photos.length) ? t.photos[0] : PLATE_TEST_IMAGES[0];
    const evCount  = t.events?.length || 0;
    const distHtml = t.distance != null
      ? ` &nbsp;·&nbsp; <span class="mli-dist">${formatDistance(t.distance)}</span>` : '';
    return `
    <div class="map-list-item" data-id="${t.id}" onclick="selectMapItem(${t.id});showTableDetail(${t.id})">
      <div class="mli-thumb">
        <img src="${thumb}" onerror="this.src='${PH}'" loading="lazy">
      </div>
      <div class="map-list-info">
        <div class="mli-title-row">
          <div class="map-list-name">${t.name}</div>
          <span class="mli-badge ${t.type==='indoor'?'badge-in':'badge-out'}">${t.type==='indoor'?'Indoor':'Outdoor'}</span>
        </div>
        <div class="map-list-sub">${ic('pin')} ${t.addr||'Schweinfurt'}${distHtml}</div>
        ${evCount ? `<div class="map-list-ev">${ic('calendar',13)} ${evCount} Event${evCount>1?'s':''} geplant</div>` : ''}
      </div>
      <div class="map-list-chevron">›</div>
    </div>`;
  }).join('');
}

// ── BOTTOM SHEET ─────────────────────────────────────────────────────────────

function initBottomSheet() {
  const bs     = document.getElementById('map-bottom-sheet');
  const handle = document.getElementById('mbs-handle');
  if(!bs || !handle) return;

  const PEEK_H  = 200;
  const expandH = () => Math.round(bs.parentElement.offsetHeight * 0.68);
  const ANIM    = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

  bs.style.height     = PEEK_H + 'px';
  bs.style.transition = ANIM;

  let startY = null, startH = null;

  handle.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    startH = bs.offsetHeight;
    bs.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', e => {
    if(startY === null) return;
    const dy   = startY - e.touches[0].clientY;
    const newH = Math.max(80, Math.min(expandH(), startH + dy));
    bs.style.height = newH + 'px';
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    if(startY === null) return;
    const h = bs.offsetHeight;
    startY  = null;
    bs.style.transition = ANIM;
    // Force reflow so transition applies to the next height change
    void bs.offsetHeight;
    const mid = (PEEK_H + expandH()) / 2;
    bs.style.height = (h > mid ? expandH() : PEEK_H) + 'px';
  });

  handle.addEventListener('click', () => {
    const h = bs.offsetHeight;
    bs.style.transition = ANIM;
    bs.style.height = (h <= PEEK_H + 20 ? expandH() : PEEK_H) + 'px';
  });
}
