// ╔══════════════════════════════════════════════════════════════╗
// ║           MAP                                                ║
// ╚══════════════════════════════════════════════════════════════╝

// MAP_STYLE: 'voyager' | 'positron' | 'osm'
const MAP_STYLE = 'voyager';

// Lokales Datum als YYYY-MM-DD (kein UTC-Versatz, heutige Spiele zählen immer)
function _localTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

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

let _previewTableId = null; // currently shown in map preview card
let _bsSnapTo = null;       // exposed by initBottomSheet for external snap calls

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
  leafletMap.on('click', e => {
    if (_previewTableId) hideMapPreview();
    if (typeof _handleSuggestMapClick === 'function') _handleSuggestMapClick(e);
  });
}

function _makeMarkerIcon(t) {
  const color = t.type === 'indoor' ? '#3B7CF4' : '#22C55E';
  const today = _localTodayISO();
  const evCount = (t.events || []).filter(e => (e.dateStr || '') >= today).length;
  return L.divIcon({
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
}

function addMarker(t) {
  const m = L.marker([t.lat, t.lng], { icon: _makeMarkerIcon(t) }).addTo(leafletMap);
  m.on('click', () => showMapPreview(t.id));
  markers.push({ id: t.id, m });
}

function _refreshMarkerIcons() {
  const src = tables.length ? tables : FALLBACK_TABLES;
  markers.forEach(({ id, m }) => {
    const t = src.find(x => x.id === id);
    if (t) m.setIcon(_makeMarkerIcon(t));
  });
}

// ── SEARCH ────────────────────────────────────────────────────────────────────

let _mapDdItems = [], _mapDdTimer = null, _mapDdActiveIdx = -1;

function onMapSearch() {
  const input = document.getElementById('map-search');
  mapSearchQuery = (input?.value || '').toLowerCase().trim();
  const clear = document.getElementById('map-search-clear');
  if(clear) clear.style.display = mapSearchQuery ? '' : 'none';
  _applyMapFilters();
}

// Entry point wired to oninput — runs both list filter and dropdown
function onMapSearchInput() {
  onMapSearch();
  const q = (document.getElementById('map-search')?.value || '').trim();
  clearTimeout(_mapDdTimer);
  _mapDdActiveIdx = -1;
  if (q.length < 2) { _closeMapDd(); return; }
  _showMapDdLoading();
  _mapDdTimer = setTimeout(() => _runMapDdSearch(q), 350);
}

async function _runMapDdSearch(q) {
  const src = tables.length ? tables : FALLBACK_TABLES;
  const local = src.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    (t.addr || '').toLowerCase().includes(q.toLowerCase())
  );
  let geo = [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q + ' Schweinfurt')}&format=json&limit=4` +
      `&addressdetails=1&countrycodes=de&accept-language=de`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
    geo = (await res.json()).slice(0, 4);
  } catch(_) {}
  _renderMapDd(q, local, geo);
}

function _renderMapDd(q, localMatches, geoResults) {
  const dd = document.getElementById('map-search-dropdown');
  if (!dd) return;
  _mapDdItems = [];
  const hl = s => {
    if (!q) return escHtml(s);
    return escHtml(s).replace(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
      '<mark>$1</mark>'
    );
  };
  let html = '';

  if (localMatches.length) {
    html += `<div style="padding:6px 14px 4px;font-size:0.68rem;font-weight:800;
      color:var(--text-xdim);text-transform:uppercase;letter-spacing:0.8px;">
      🏓 Tischtennisplatten</div>`;
    localMatches.slice(0, 3).forEach(t => {
      const idx = _mapDdItems.length;
      _mapDdItems.push({ type: 'table', data: t });
      html += `<div class="search-dropdown-item" tabindex="0"
        onmousedown="_selectMapDdItem(${idx})"
        onkeydown="if(event.key==='Enter')_selectMapDdItem(${idx})"
        id="msdi-${idx}">
        <div class="sdi-icon table">${t.icon || '🏓'}</div>
        <div>
          <div class="sdi-main">${hl(t.name)}</div>
          <div class="sdi-sub">${ic('pin')} ${escHtml(t.addr || '')} · ${t.type === 'indoor' ? 'Indoor' : 'Outdoor'}</div>
        </div>
      </div>`;
    });
  }

  if (geoResults.length) {
    html += `<div style="padding:6px 14px 4px;font-size:0.68rem;font-weight:800;
      color:var(--text-xdim);text-transform:uppercase;letter-spacing:0.8px;">
      ${ic('pin')} Orte &amp; Adressen</div>`;
    geoResults.forEach(r => {
      const idx = _mapDdItems.length;
      const name = r.name || r.display_name.split(',')[0];
      const sub  = r.display_name.split(',').slice(1, 3).join(',').trim();
      _mapDdItems.push({ type: 'geo', data: r });
      html += `<div class="search-dropdown-item" tabindex="0"
        onmousedown="_selectMapDdItem(${idx})"
        onkeydown="if(event.key==='Enter')_selectMapDdItem(${idx})"
        id="msdi-${idx}">
        <div class="sdi-icon place">${ic('pin', 18)}</div>
        <div>
          <div class="sdi-main">${hl(name)}</div>
          <div class="sdi-sub">${escHtml(sub)}</div>
        </div>
      </div>`;
    });
  }

  if (!html) {
    html = `<div class="search-empty">Keine Ergebnisse für „${escHtml(q)}"</div>`;
  }
  dd.innerHTML = html;
  _openMapDd();
}

function _showMapDdLoading() {
  const dd = document.getElementById('map-search-dropdown');
  if (!dd) return;
  dd.innerHTML = `<div class="search-loading"><div class="search-spinner"></div> Suche läuft…</div>`;
  _openMapDd();
}

function _openMapDd() {
  const input = document.getElementById('map-search');
  const dd    = document.getElementById('map-search-dropdown');
  if (!dd || !input) return;
  const rect = input.getBoundingClientRect();
  dd.style.top   = (rect.bottom + 6) + 'px';
  dd.style.left  = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.classList.add('open');
}

function _closeMapDd() {
  document.getElementById('map-search-dropdown')?.classList.remove('open');
  _mapDdActiveIdx = -1;
}

function _selectMapDdItem(idx) {
  const item = _mapDdItems[idx];
  if (!item) return;
  _closeMapDd();
  if (item.type === 'table') {
    const t = item.data;
    document.getElementById('map-search').value = t.name;
    mapSearchQuery = '';
    document.getElementById('map-search-clear').style.display = 'none';
    _applyMapFilters();
    if (leafletMap) leafletMap.setView([t.lat, t.lng], 16, { animate: true });
    setTimeout(() => showMapPreview(t.id), 150);
  } else {
    const lat  = parseFloat(item.data.lat);
    const lng  = parseFloat(item.data.lon);
    const name = item.data.name || item.data.display_name.split(',')[0];
    document.getElementById('map-search').value = name;
    if (leafletMap) leafletMap.setView([lat, lng], 15, { animate: true });
  }
}

function onMapSearchKey(e) {
  const items = document.querySelectorAll('#map-search-dropdown .search-dropdown-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _mapDdActiveIdx = Math.min(_mapDdActiveIdx + 1, items.length - 1);
    items[_mapDdActiveIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _mapDdActiveIdx = Math.max(_mapDdActiveIdx - 1, -1);
    if (_mapDdActiveIdx === -1) document.getElementById('map-search').focus();
    else items[_mapDdActiveIdx]?.focus();
  } else if (e.key === 'Escape') {
    _closeMapDd();
    document.getElementById('map-search').blur();
  }
}

document.addEventListener('click', e => {
  const wrap = document.querySelector('.map-search-wrap');
  const dd   = document.getElementById('map-search-dropdown');
  if (!wrap?.contains(e.target) && !dd?.contains(e.target)) _closeMapDd();
});

function clearMapSearch() {
  const input = document.getElementById('map-search');
  if(input) input.value = '';
  mapSearchQuery = '';
  document.getElementById('map-search-clear').style.display = 'none';
  _closeMapDd();
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
  if (!navigator.geolocation) { showToast('Standort nicht verfügbar', '⚠️'); return; }
  if (!navigator.permissions) { _showLocPrompt(); return; }
  navigator.permissions.query({ name: 'geolocation' }).then(status => {
    if (status.state === 'granted')      _doLocate();
    else if (status.state === 'denied')  _showLocCard('blocked');
    else                                 _showLocPrompt();
  }).catch(() => _showLocPrompt());
}

function _doLocate() {
  _dismissLocPrompt();
  const btn = document.getElementById('locate-btn');
  btn?.classList.add('locating');
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn?.classList.remove('locating');
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      if (leafletMap) {
        if (userMarker) leafletMap.removeLayer(userMarker);
        userMarker = L.circle([userLat, userLng], {
          radius: pos.coords.accuracy,
          color: '#3B7CF4', fillColor: '#3B7CF4', fillOpacity: 0.1, weight: 2
        }).addTo(leafletMap);
        L.circleMarker([userLat, userLng], {
          radius: 8, color: '#fff', weight: 3,
          fillColor: '#3B7CF4', fillOpacity: 1
        }).addTo(leafletMap).bindPopup('📍 Du bist hier');
        leafletMap.setView([userLat, userLng], 15, { animate: true });
      }
      updateDistances();
      showToast('📍 Standort gefunden!');
    },
    err => {
      btn?.classList.remove('locating');
      if (err.code === 1) {                    // PERMISSION_DENIED
        _showLocCard('blocked');
      } else {                                 // POSITION_UNAVAILABLE oder TIMEOUT
        showToast('Standort gerade nicht verfügbar', '⚠️');
      }
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

function _locPromptEl() {
  let el = document.getElementById('loc-prompt-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loc-prompt-overlay';
    el.className = 'loc-prompt-overlay';
    el.addEventListener('click', e => { if (e.target === el) _dismissLocPrompt(); });
    document.body.appendChild(el);
  }
  return el;
}

function _showLocPrompt() {
  const el = _locPromptEl();
  el.innerHTML = `
    <div class="loc-prompt-card">
      <div class="lpc-icon">📍</div>
      <div class="lpc-title">Standort verwenden?</div>
      <div class="lpc-body">Damit können wir dir Platten und Spiele in deiner Nähe anzeigen.</div>
      <button class="lpc-btn lpc-btn-primary" onclick="_doLocate()">Standort erlauben</button>
      <button class="lpc-btn lpc-btn-secondary" onclick="_dismissLocPrompt()">Später</button>
    </div>`;
  el.style.display = 'flex';
}

function _showLocCard(type) {
  const el = _locPromptEl();
  el.innerHTML = `
    <div class="loc-prompt-card">
      <div class="lpc-icon">🔒</div>
      <div class="lpc-title">Standort blockiert</div>
      <div class="lpc-body">Du kannst die Berechtigung in den Browser-Einstellungen ändern und die Seite neu laden.</div>
      <button class="lpc-btn lpc-btn-secondary" onclick="_dismissLocPrompt()">Schließen</button>
    </div>`;
  el.style.display = 'flex';
}

function _dismissLocPrompt() {
  const el = document.getElementById('loc-prompt-overlay');
  if (el) el.style.display = 'none';
}

function calcDistance(lat1, lng1, lat2, lng2) {
  if (lat2 == null || lng2 == null || isNaN(+lat2) || isNaN(+lng2)) return null;
  const R = 6371000;
  const dLat = (+lat2 - +lat1) * Math.PI / 180;
  const dLng = (+lng2 - +lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(+lat1 * Math.PI/180) * Math.cos(+lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function formatDistance(m) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
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
    const labels = {casual:'🎉 Just 4 Fun', training:'🎯 Training', ranked:'🏓 Punktspiel', punktspiel:'🏓 Punktspiel'};
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

function _mapThumbHtml(t, loadAttr) {
  const fb = t.type === 'indoor' ? 'images/placeholders/plate_indoor.png' : 'images/placeholders/plate_outdoor.png';
  if (t.photos && t.photos.length)
    return `<img src="${escAttr(t.photos[0])}" onerror="this.src='${fb}'" loading="${loadAttr || 'lazy'}" decoding="async">`;
  return `<img src="${fb}" loading="${loadAttr || 'lazy'}" decoding="async" class="thumb-placeholder-img">`;
}

function renderMapList(list) {
  const c = document.getElementById('map-list-container');
  if (!c) return;

  if(!list.length) {
    c.innerHTML = `<div class="map-list-empty">Keine Platten gefunden.<br><span style="font-size:0.8rem;color:var(--text-xdim);">Filter anpassen oder Suche leeren.</span></div>`;
    return;
  }

  const _surfaceLabel = { concrete:'Beton', asphalt:'Asphalt', wood:'Holz', rubber:'Gummi', artificial_turf:'Kunstrasen' };

  const locCta = (!userLat || !userLng) ? `
    <div class="mli-loc-cta">
      <div class="mli-loc-cta-icon">${ic('map-pinned', 22)}</div>
      <div class="mli-loc-cta-body">
        <div class="mli-loc-cta-title">Platten in deiner Nähe anzeigen</div>
        <div class="mli-loc-cta-text">Aktiviere deinen Standort, um Entfernungen zu sehen und schneller eine passende Platte zu finden.</div>
        <button class="mli-loc-cta-btn" data-action="locate">Standort verwenden</button>
      </div>
    </div>` : '';

  const _today = _localTodayISO();
  c.innerHTML = locCta + list.map((t, i) => {
    const evCount = (t.events || []).filter(e => (e.dateStr || '') >= _today).length;
    const badgeParts = [];
    if (t.distance != null) badgeParts.push(`<span class="mli-dist-badge">${ic('pin', 11)} ${formatDistance(t.distance)} entfernt</span>`);
    if (evCount > 0) badgeParts.push(`<span class="mli-games-badge">${ic('calendar', 11)} ${evCount === 1 ? '1 Spiel geplant' : `${evCount} Spiele geplant`}</span>`);
    if (t.accessType === 'limited')            badgeParts.push(`<span class="mli-access-badge mli-access-limited">Eingeschränkt</span>`);
    else if (t.accessType === 'private_or_unclear') badgeParts.push(`<span class="mli-access-badge mli-access-unclear">Zugang unklar</span>`);
    else if (t.accessType === 'temporarily_closed') badgeParts.push(`<span class="mli-access-badge mli-access-closed">Aktuell geschlossen</span>`);
    const badgeRow = badgeParts.length ? `<div class="mli-badge-row">${badgeParts.join('')}</div>` : '';

    const metaParts = [];
    if (t.tablesCount) metaParts.push(`${t.tablesCount} ${t.tablesCount === 1 ? 'Platte' : 'Platten'}`);
    if (t.surface && _surfaceLabel[t.surface]) metaParts.push(_surfaceLabel[t.surface]);
    metaParts.push(t.type === 'indoor' ? 'Indoor' : 'Outdoor');

    const _load = i < 3 ? 'eager' : 'lazy';
    const thumbInner = _mapThumbHtml(t, _load);

    return `
    <div class="map-list-item" data-id="${t.id}" onclick="selectMapItem(${t.id});showTableDetail(${t.id})">
      <div class="mli-thumb">${thumbInner}</div>
      <div class="map-list-info">
        <div class="map-list-name">${t.name}</div>
        <div class="map-list-sub">${ic('pin')} ${t.addr||'Schweinfurt'}</div>
        ${badgeRow}
        <div class="mli-meta">${metaParts.join(' · ')}</div>
      </div>
      <div class="map-list-chevron">›</div>
    </div>`;
  }).join('');

  c.querySelector('[data-action="locate"]')?.addEventListener('click', locateUser);
}

// ── BOTTOM SHEET ─────────────────────────────────────────────────────────────

function initBottomSheet() {
  const bs     = document.getElementById('map-bottom-sheet');
  const handle = document.getElementById('mbs-handle');
  const pills  = document.getElementById('mbs-pills');
  const list   = document.getElementById('map-list-container');
  if (!bs || !handle) return;

  const ANIM = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

  function ph() { return bs.parentElement.offsetHeight || window.innerHeight; }
  function snaps() {
    return [
      Math.max(80, Math.round(ph() * 0.12)),  // 0: collapsed
      200,                                      // 1: standard (default)
      Math.round(ph() * 0.90),                 // 2: expanded
    ];
  }

  let snapIdx = 1;

  function snapTo(idx, animate) {
    if (animate === undefined) animate = true;
    idx = Math.max(0, Math.min(2, idx));
    snapIdx = idx;
    bs.style.transition = animate ? ANIM : 'none';
    if (!animate) void bs.offsetHeight;
    bs.style.height = snaps()[idx] + 'px';
  }

  snapTo(1, false);

  let startX = null, startY = null, startH = null;
  let lastY = null, lastT = null, prevY = null, prevT = null;
  let didDrag = false, dragCancelled = false;
  let listScrollAtStart = 0;

  function onDragStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startH = bs.offsetHeight;
    lastY  = startY; lastT = Date.now();
    prevY  = null;   prevT = null;
    didDrag = false; dragCancelled = false;
    bs.style.transition = 'none';
  }

  function _applyMove(e) {
    if (startY === null || dragCancelled) return;
    const curX = e.touches[0].clientX;
    const curY = e.touches[0].clientY;
    const dxAbs = Math.abs(curX - startX);
    const dyAbs = Math.abs(curY - startY);
    if (!didDrag && dxAbs > dyAbs && dxAbs > 8) {
      dragCancelled = true;
      bs.style.transition = ANIM;
      bs.style.height = snaps()[snapIdx] + 'px';
      return;
    }
    const s = snaps();
    const newH = Math.max(s[0], Math.min(s[2], startH + (startY - curY)));
    bs.style.height = newH + 'px';
    if (dyAbs > 5) didDrag = true;
    prevY = lastY; prevT = lastT;
    lastY = curY;  lastT = Date.now();
  }

  // Handle / pills: always control the sheet
  function onHandleMove(e) { _applyMove(e); }

  // List: only take over when list is at scrollTop=0 AND finger moves down (collapse)
  function onListMove(e) {
    if (startY === null) return;
    const curY  = e.touches[0].clientY;
    const dyAbs = Math.abs(curY - startY);
    const dxAbs = Math.abs(e.touches[0].clientX - startX);

    // Horizontal gesture → cancel, let horizontal scroll happen
    if (!didDrag && dxAbs > dyAbs && dxAbs > 8) {
      dragCancelled = true;
      startX = null; startY = null;
      return;
    }

    // Wait for minimum movement before deciding
    if (dyAbs < 5) return;

    if (!dragCancelled && !didDrag) {
      const swipingDown = curY > startY; // finger moving down = collapse intent

      // List is scrolled, or finger is moving up (list-scroll intent) → hand off
      if (listScrollAtStart > 0 || !swipingDown) {
        dragCancelled = true;
        startX = null; startY = null;
        return;
      }

      // Only case left: list at top + swiping down → collapse sheet
      e.preventDefault();
    }

    if (dragCancelled) return;
    e.preventDefault();
    _applyMove(e);
  }

  function onDragEnd() {
    if (startY === null) return;
    const s = snaps();
    const h = bs.offsetHeight;

    let targetIdx = snapIdx;
    if (didDrag && !dragCancelled) {
      let velocity = 0;
      if (prevT !== null && lastT - prevT > 0 && lastT - prevT < 250) {
        velocity = (prevY - lastY) / (lastT - prevT);
      }
      if (Math.abs(velocity) > 0.3) {
        targetIdx = velocity > 0
          ? Math.min(2, snapIdx + 1)
          : Math.max(0, snapIdx - 1);
      } else {
        const dist = s.map(v => Math.abs(h - v));
        targetIdx = dist.indexOf(Math.min(...dist));
      }
    }

    startX = null; startY = null;

    if (_previewTableId && didDrag && !dragCancelled) {
      _dismissPreviewContent();
    }

    snapTo(targetIdx);
  }

  // Handle + pills: passive touchmove is fine (they don't contain a scroll container)
  [handle, pills].filter(Boolean).forEach(el => {
    el.addEventListener('touchstart', onDragStart,   { passive: true });
    el.addEventListener('touchmove',  onHandleMove,  { passive: true });
    el.addEventListener('touchend',   onDragEnd);
  });

  // List: non-passive touchmove so we can call preventDefault() when taking over
  if (list) {
    list.addEventListener('touchstart', e => {
      listScrollAtStart = list.scrollTop;
      onDragStart(e);
    }, { passive: true });
    list.addEventListener('touchmove',  onListMove, { passive: false });
    list.addEventListener('touchend',   onDragEnd);
  }

  // Click on handle cycles through all 3 positions
  handle.addEventListener('click', () => {
    if (didDrag) return;
    if (_previewTableId) { hideMapPreview(); return; }
    snapTo((snapIdx + 1) % 3);
  });

  _bsSnapTo = snapTo;
}

// ── MARKER PREVIEW ───────────────────────────────────────────────────────────

function _setActiveMarker(id) {
  markers.forEach(({ id: mId, m }) => {
    const inner = m.getElement()?.querySelector('div');
    if (inner) inner.style.transform = mId === id ? 'scale(1.25)' : '';
  });
}

function _resetActiveMarker() {
  markers.forEach(({ m }) => {
    const inner = m.getElement()?.querySelector('div');
    if (inner) inner.style.transform = '';
  });
}

function _dismissPreviewContent() {
  if (!_previewTableId) return;
  _previewTableId = null;
  const prev  = document.getElementById('mbs-preview');
  const pills = document.getElementById('mbs-pills');
  const list  = document.getElementById('map-list-container');
  if (prev)  prev.style.display  = 'none';
  if (pills) pills.style.display = '';
  document.querySelector('.map-bottom-sheet-title')?.style.setProperty('display', '');
  if (list)  list.style.display  = '';
  document.querySelectorAll('.map-list-item').forEach(el => el.classList.remove('selected'));
  _resetActiveMarker();
}

function showMapPreview(tableId) {
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === tableId);
  if (!t) return;

  const wasPreview = !!_previewTableId;
  _previewTableId = tableId;

  const _today = _localTodayISO();
  const evCount = (t.events || []).filter(e => (e.dateStr || '') >= _today).length;
  const distHtml = t.distance != null
    ? `<span class="mbsp-dist">${ic('pin', 11)} ${formatDistance(t.distance)} entfernt</span>` : '';
  const thumbHtml = _mapThumbHtml(t, 'eager');

  const shortAddr = (t.addr || 'Schweinfurt').split(',')[0];

  document.getElementById('mbs-preview').innerHTML = `
    <div class="mbsp-card" onclick="showTableDetail(${t.id})">
      <div class="mbsp-thumb">${thumbHtml}</div>
      <div class="mbsp-info">
        <div class="mbsp-title-row">
          <div class="mbsp-name">${escHtml(t.name)}</div>
          <button class="mbsp-close" onclick="event.stopPropagation();hideMapPreview()" title="Schließen">×</button>
        </div>
        <div class="mbsp-badges">
          <span class="mbsp-badge mbsp-badge-${t.type}">${t.type === 'indoor' ? 'Indoor' : 'Outdoor'}</span>
          ${distHtml}
        </div>
        <div class="mbsp-addr">${ic('pin', 11)} ${escHtml(shortAddr)}</div>
        ${evCount ? `<div class="mbsp-ev">${ic('calendar', 11)} ${evCount} Event${evCount > 1 ? 's' : ''} geplant</div>` : '<div class="mbsp-ev mbsp-ev-empty">Noch keine Events</div>'}
      </div>
    </div>
  `;

  if (!wasPreview) {
    document.getElementById('mbs-pills')?.style.setProperty('display', 'none');
    document.querySelector('.map-bottom-sheet-title')?.style.setProperty('display', 'none');
    document.getElementById('map-list-container').style.display = 'none';
    document.getElementById('mbs-preview').style.display = '';

    const bs = document.getElementById('map-bottom-sheet');
    const ph = bs.parentElement.offsetHeight || window.innerHeight;
    const previewH = Math.max(155, Math.round(ph * 0.22));
    bs.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    bs.style.height = previewH + 'px';
  }

  // Pan map to marker, center slightly below to give sheet room
  if (leafletMap) leafletMap.setView([t.lat, t.lng], 16, { animate: true });
  _setActiveMarker(tableId);
}

function hideMapPreview() {
  if (!_previewTableId) return;
  _dismissPreviewContent();
  if (_bsSnapTo) _bsSnapTo(1); // animate back to standard position
}
