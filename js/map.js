// ╔══════════════════════════════════════════════════════════════╗
// ║           MAP                                                ║
// ╚══════════════════════════════════════════════════════════════╝

// Lokales Datum als YYYY-MM-DD (kein UTC-Versatz, heutige Spiele zählen immer)
function _localTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

const _MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const _MAP_STYLE_DARK  = 'https://tiles.openfreemap.org/styles/dark';
const _MAP_ATTR = '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const _TABLE_MARKER_GREEN = 'var(--map-marker-green)';

let leafletMap, _maplibreLayer = null, markers = [], _mapMarkerCluster = null;
let mapSearchQuery   = '';
let mapSpielartFilter = 'all'; // 'all' | 'casual' | 'training' | 'punktspiel'
let mapPlaceFilter    = 'all'; // 'all' | 'indoor' | 'outdoor'

let _previewTableId = null; // currently shown in map preview card
let _bsSnapTo = null;       // exposed by initBottomSheet for external snap calls

const TABLE_LIST_BATCH_SIZE = 10;
let _mapListItems = [];
let _mapListVisibleCount = TABLE_LIST_BATCH_SIZE;

function _currentMapStyle() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? _MAP_STYLE_DARK : _MAP_STYLE_LIGHT;
}

function _watchMapTheme() {
  new MutationObserver(() => {
    _maplibreLayer?.getMaplibreMap()?.setStyle(_currentMapStyle());
    if (typeof _refreshEventTablePickerTheme === 'function') _refreshEventTablePickerTheme();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function initMap() {
  leafletMap = L.map('map', { center:[50.0490,10.2310], zoom:14, maxZoom:19, zoomControl:false });
  _maplibreLayer = L.maplibreGL({
    style: _currentMapStyle(),
    attribution: _MAP_ATTR
  }).addTo(leafletMap);
  leafletMap.attributionControl.setPrefix(false);
  _watchMapTheme();

  _mapMarkerCluster = _createTableMarkerClusterGroup().addTo(leafletMap);
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  src.forEach(t => addMarker(t));
  renderMapList(src);
  initBottomSheet();
  leafletMap.on('click', e => {
    if (_previewTableId) hideMapPreview();
    if (typeof _handleSuggestMapClick === 'function') _handleSuggestMapClick(e);
  });
  _initLocChip();
  if (typeof _refreshPendingMarkers === 'function') _refreshPendingMarkers();
}

function _makeMarkerIcon(t, selected = false) {
  const today = _localTodayISO();
  const evCount = (t.events || []).filter(e => (e.dateStr || '') >= today).length;
  return L.divIcon({
    className: '',
    html: `<div style="background:${_TABLE_MARKER_GREEN};width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 12px rgba(0,0,0,0.25);border:2px solid #fff;cursor:pointer;position:relative;
      transform:${selected ? 'scale(1.25)' : 'none'};transition:transform .15s;">
<img src="images/icons/play-map-white.svg" width="24" height="24" style="display:block;width:24px;height:24px;flex-shrink:0;pointer-events:none;object-fit:contain;" alt="">${evCount ? `<span style="position:absolute;top:-5px;right:-5px;background:#EF4444;
        color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;
        display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">${evCount}</span>` : ''}
    </div>`,
    iconSize:[36,36], iconAnchor:[18,18]
  });
}

function _makeTableClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count >= 100 ? 48 : count >= 10 ? 44 : 40;
  return L.divIcon({
    className: '',
    html: `<div class="table-marker-cluster" style="background:${_TABLE_MARKER_GREEN};width:${size}px;height:${size}px;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:${count >= 100 ? 13 : 15}px;font-weight:800;line-height:1;
      box-shadow:0 3px 12px rgba(0,0,0,.25);border:2px solid #fff;cursor:pointer;"
      aria-label="${count} Tischtennisplatten">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function _createTableMarkerClusterGroup() {
  if (typeof L.markerClusterGroup !== 'function') return L.layerGroup();
  return L.markerClusterGroup({
    iconCreateFunction: _makeTableClusterIcon,
    maxClusterRadius: 52,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 1.15,
    removeOutsideVisibleBounds: true,
    animate: true
  });
}

function addMarker(t) {
  if (!leafletMap || !Number.isFinite(Number(t.lat)) || !Number.isFinite(Number(t.lng))) return;
  if (markers.some(markerEntry => String(markerEntry.id) === String(t.id))) return;
  if (!_mapMarkerCluster) _mapMarkerCluster = _createTableMarkerClusterGroup().addTo(leafletMap);
  const m = L.marker([Number(t.lat), Number(t.lng)], {
    icon: _makeMarkerIcon(t),
    keyboard: true,
    title: t.name || 'Tischtennisplatte'
  });
  m.on('click', () => showMapPreview(t.id));
  _mapMarkerCluster.addLayer(m);
  markers.push({ id: t.id, m, visible: true });
}

function _syncMapMarkers(sourceTables) {
  if (!leafletMap || !_mapMarkerCluster) return;
  const sourceIds = new Set(sourceTables.map(table => String(table.id)));
  markers = markers.filter(markerEntry => {
    if (sourceIds.has(String(markerEntry.id))) return true;
    _mapMarkerCluster.removeLayer(markerEntry.m);
    return false;
  });
  const existingIds = new Set(markers.map(markerEntry => String(markerEntry.id)));
  sourceTables.forEach(table => {
    if (!existingIds.has(String(table.id))) addMarker(table);
  });
}

function _refreshMarkerIcons() {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const byId = new Map(src.map(t => [t.id, t]));
  markers.forEach(({ id, m }) => {
    const t = byId.get(id);
    if (t) m.setIcon(_makeMarkerIcon(t, String(id) === String(_previewTableId)));
  });
  _mapMarkerCluster?.refreshClusters?.();
}

// ── SEARCH ────────────────────────────────────────────────────────────────────

let _mapDdItems = [], _mapDdTimer = null, _mapDdActiveIdx = -1, _mapDdAbort = null;

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
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const local = src.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    (t.addr || '').toLowerCase().includes(q.toLowerCase())
  );
  let geo = [];
  if (_mapDdAbort) _mapDdAbort.abort();
  _mapDdAbort = new AbortController();
  try {
    // viewbox biases results to the Schweinfurt region without restricting other areas
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=5` +
      `&addressdetails=1&countrycodes=de&accept-language=de` +
      `&viewbox=9.8,50.25,10.75,49.85&bounded=0` +
      `&email=kontakt%40plattentreff.app`;
    const res = await fetch(url, {
      signal: _mapDdAbort.signal,
      headers: { 'Accept-Language': 'de' }
    });
    geo = (await res.json()).slice(0, 4);
  } catch(e) { if (e?.name === 'AbortError') return; }
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
      ${ic('table-tennis', 13)} Tischtennisplatten</div>`;
    localMatches.slice(0, 3).forEach(t => {
      const idx = _mapDdItems.length;
      _mapDdItems.push({ type: 'table', data: t });
      html += `<div class="search-dropdown-item" tabindex="0"
        onmousedown="_selectMapDdItem(${idx})"
        onkeydown="if(event.key==='Enter')_selectMapDdItem(${idx})"
        id="msdi-${idx}">
        <div class="sdi-icon table">${ic('table-tennis',18)}</div>
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
  document.getElementById('map-search-dropdown')?.classList.add('open');
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
    document.getElementById('map-search-clear').style.display = '';
    mapSearchQuery = '';
    _applyMapFilters();
    if (leafletMap) leafletMap.setView([lat, lng], 15, { animate: true });
  }
}

function onMapSearchKey(e) {
  const input = document.getElementById('map-search');

  if (e.key === 'Escape') {
    _closeMapDd();
    input?.blur();
    return;
  }

  const items = document.querySelectorAll('#map-search-dropdown .search-dropdown-item');

  if (e.key === 'ArrowDown') {
    if (!items.length) return;
    e.preventDefault();
    _mapDdActiveIdx = Math.min(_mapDdActiveIdx + 1, items.length - 1);
    items[_mapDdActiveIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    _mapDdActiveIdx = Math.max(_mapDdActiveIdx - 1, -1);
    if (_mapDdActiveIdx === -1) input?.focus();
    else items[_mapDdActiveIdx]?.focus();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items.length > 0) {
      // aktives Item oder erstes Ergebnis auswählen, Tastatur schließen
      _selectMapDdItem(_mapDdActiveIdx >= 0 ? _mapDdActiveIdx : 0);
      input?.blur();
    } else {
      // Noch kein Ergebnis geladen (Loading-State oder kurze Eingabe) →
      // sofort suchen und erstes Ergebnis auswählen
      const q = (input?.value || '').trim();
      if (q.length >= 2) {
        clearTimeout(_mapDdTimer);
        _runMapDdSearch(q).then(() => {
          const fresh = document.querySelectorAll('#map-search-dropdown .search-dropdown-item');
          if (fresh.length > 0) {
            _selectMapDdItem(0);
          } else {
            showToast('Kein Ergebnis gefunden', { type: 'info' });
            _closeMapDd();
          }
          input?.blur();
        });
      } else {
        _closeMapDd();
        input?.blur();
      }
    }
  }
}

document.addEventListener('click', e => {
  const wrap = document.querySelector('.map-search-wrap');
  if (!wrap?.contains(e.target)) _closeMapDd();
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
  const src      = tablesLoaded ? tables : FALLBACK_TABLES;
  _syncMapMarkers(src);
  const filtered = getFilteredTables(src);
  renderMapList(filtered);
  _updateMarkerVisibility(filtered);
}

function _updateMarkerVisibility(filtered) {
  const ids = new Set(filtered.map(t => String(t.id)));
  markers.forEach(markerEntry => {
    const shouldShow = ids.has(String(markerEntry.id));
    if (shouldShow === markerEntry.visible) return;
    markerEntry.visible = shouldShow;
    if (shouldShow) _mapMarkerCluster?.addLayer(markerEntry.m);
    else _mapMarkerCluster?.removeLayer(markerEntry.m);
  });
}

// ── LOCATION ──────────────────────────────────────────────────────────────────

let userLat = null, userLng = null, userMarker = null;

function centerMap() {
  if(leafletMap) leafletMap.setView([50.0490,10.2310], 14, { animate:true });
}

function locateUser() {
  if (!navigator.geolocation) {
    showSnackbar({ title: 'Standort nicht verfügbar', message: 'Dein Gerät unterstützt keine Standortfunktion.', type: 'warning' });
    return;
  }
  // Call directly — keeps us in the user-gesture context (required by Safari/iOS).
  // The error handler in _doLocate catches PERMISSION_DENIED (code 1) and shows the blocked card.
  _doLocate();
}

function _doLocate() {
  _dismissLocPrompt();
  PTAnalytics.track('location_permission_requested', { source: 'map' });
  const btn = document.getElementById('locate-btn');
  btn?.classList.add('locating');
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn?.classList.remove('locating');
      _hideLocChip();
      PTAnalytics.track('location_permission_granted', { source: 'map' });
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
        }).addTo(leafletMap).bindPopup('Du bist hier');
        leafletMap.setView([userLat, userLng], 15, { animate: true });
      }
      updateDistances();
      showToast('Standort gefunden!');
    },
    err => {
      btn?.classList.remove('locating');
      if (err.code === 1) {                    // PERMISSION_DENIED
        PTAnalytics.track('location_permission_denied', { source: 'map' });
        _dismissLocChip();
        showSnackbar({ title: 'Standort gesperrt', message: 'Du kannst den Standort später über den Button rechts aktivieren.', type: 'info' });
      } else {                                 // POSITION_UNAVAILABLE oder TIMEOUT
        showSnackbar({
          title: 'Standort nicht verfügbar',
          message: 'Prüfe deine Standortfreigabe oder versuche es später erneut.',
          type: 'warning',
          actionLabel: 'Erneut versuchen',
          onAction: locateUser
        });
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
      <div class="lpc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></div>
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
      <div class="lpc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
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

// ── STANDORT-CHIP (dezent, unter Suchleiste) ───────────────────────────────────
function _initLocChip() {
  if (userLat || sessionStorage.getItem('pt_location_chip_dismissed')) return;
  document.getElementById('map-loc-chip')?.classList.remove('hidden');
}
function _hideLocChip() {
  document.getElementById('map-loc-chip')?.classList.add('hidden');
}
function _dismissLocChip() {
  _hideLocChip();
  sessionStorage.setItem('pt_location_chip_dismissed', '1');
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
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  src.forEach(t => { t.distance = calcDistance(userLat, userLng, t.lat, t.lng); });
  src.sort((a,b) => (a.distance||99999) - (b.distance||99999));
  _applyMapFilters();
  renderHome();
}

// ── LIST ──────────────────────────────────────────────────────────────────────

function selectMapItem(id) {
  const list = document.getElementById('map-list-container');
  const itemIndex = _mapListItems.findIndex(table => String(table.id) === String(id));
  if (itemIndex >= _mapListVisibleCount) {
    _mapListVisibleCount = Math.ceil((itemIndex + 1) / TABLE_LIST_BATCH_SIZE) * TABLE_LIST_BATCH_SIZE;
    _renderVisibleMapListItems();
  }
  list?.querySelectorAll('.map-list-item').forEach(el =>
    el.classList.toggle('selected', el.dataset.id == id));
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === id);
  if(t && leafletMap) leafletMap.setView([t.lat, t.lng], 16, { animate:true });
  const selected = list?.querySelector('.map-list-item.selected');
  if(selected) selected.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function _buildStatusLine(filtered) {
  const total     = (tablesLoaded ? tables : FALLBACK_TABLES).length;
  const count     = filtered.length;
  const hasSearch = !!mapSearchQuery;
  const hasSpiela = mapSpielartFilter !== 'all';
  const hasPlace  = mapPlaceFilter    !== 'all';
  const hasFilter = hasSpiela || hasPlace;

  let parts = [];

  if(hasSearch) {
    parts.push(`<b>"${escHtml(mapSearchQuery)}"</b>`);
  }

  if(hasSpiela) {
    const labels = {casual:'Just 4 Fun', training:'Training', punktspiel:'Punktspiel'};
    parts.push(labels[mapSpielartFilter] || mapSpielartFilter);
  }
  if(hasPlace) {
    parts.push(mapPlaceFilter === 'indoor' ? 'Indoor' : 'Outdoor');
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
  const fb = 'images/placeholders/tischtennisplatte-outdoor-512x512.webp';
  if (t.photos && t.photos.length)
    return `<img src="${escAttr(t.photos[0])}" onerror="this.src='${fb}'" loading="${loadAttr || 'lazy'}" decoding="async">`;
  return `<img src="${fb}" alt="Kein Foto verfügbar" loading="${loadAttr || 'lazy'}" decoding="async" class="thumb-placeholder-img">`;
}

// ── SHARED PLATE CARD HELPERS (used by map.js + tables.js) ───────────────────
const _SURFACE_LABEL = { concrete:'Beton', asphalt:'Asphalt', wood:'Holz', rubber:'Gummi', artificial_turf:'Kunstrasen' };

function _tableMetaLine(t, opts = {}) {
  const parts = [];
  if (t.tablesCount) parts.push(`${t.tablesCount} ${t.tablesCount === 1 ? 'Platte' : 'Platten'}`);
  if (t.surface && _SURFACE_LABEL[t.surface]) parts.push(_SURFACE_LABEL[t.surface]);
  parts.push(t.type === 'indoor' ? 'Indoor' : 'Outdoor');
  if (t.openingHours) parts.push(escHtml(t.openingHours));
  if (opts?.includeAccess) {
    const _short = { limited: 'Eingeschränkt', private_or_unclear: 'Zugang unklar', temporarily_closed: 'Geschlossen' };
    if (t.accessType && _short[t.accessType]) parts.push(_short[t.accessType]);
  }
  if (opts?.operator && t.operator) parts.push(`Betreiber: ${escHtml(t.operator)}`);
  return parts.join(' · ');
}

// ── GEMEINSAME BEWERTUNGS-HELFER ──────────────────────────────────────────────

// Generiert Bewertungs-HTML mit eigenem Element-ID-Präfix (verhindert DOM-Kollisionen
// zwischen Home, Kartenliste und Floating-Preview bei gleichzeitiger Anzeige).
function _plateRatingHtml(t, idPrefix) {
  const elId = `plt-rating-${idPrefix}-${t.id}`;
  if (t.ratingAvg > 0) {
    const full  = Math.round(t.ratingAvg);
    const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    const cnt   = t.ratingCount ? ` (${t.ratingCount})` : '';
    return `<div class="plt-rating-row" id="${elId}"><span class="plt-stars">${stars}</span><span>${t.ratingAvg.toFixed(1)}${cnt}</span></div>`;
  }
  if (t.ratingAvg === 0) return `<div class="plt-rating-row" id="${elId}"></div>`;
  return `<div class="plt-rating-row plt-rating-loading" id="${elId}"></div>`;
}

function _fillRatingEl(el, t) {
  if (!el) return;
  el.classList.remove('plt-rating-loading');
  if (t.ratingAvg > 0) {
    const full  = Math.round(t.ratingAvg);
    const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    el.innerHTML = `<span class="plt-stars">${stars}</span><span>${t.ratingAvg.toFixed(1)} (${t.ratingCount})</span>`;
  } else {
    el.innerHTML = '';
  }
}

async function _loadTableRating(tableId, elId) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === tableId);
  if (!t) return;
  if (t.ratingAvg !== undefined) { _fillRatingEl(document.getElementById(elId), t); return; }
  try {
    const qb = new QueryBuilder('table_ratings_avg');
    qb.eq('table_id', tableId);
    const { data } = await qb.execute();
    if (data && data[0] && data[0].rating_count > 0) {
      t.ratingAvg   = parseFloat(data[0].avg_overall);
      t.ratingCount = data[0].rating_count;
    } else {
      t.ratingAvg = 0;
    }
  } catch (_) { t.ratingAvg = 0; }
  _fillRatingEl(document.getElementById(elId), t);
}

function _tableDistBadge(t) {
  if (t.distance == null) return '';
  return `<span class="plt-dist-badge">${formatDistance(t.distance)} entfernt</span>`;
}

function _tableGamesBadge(count) {
  if (!count) return '';
  return `<span class="plt-games-badge">${count === 1 ? '1 Spiel geplant' : `${count} Spiele geplant`}</span>`;
}

function _tableAccessBadge(t) {
  if (t.accessType === 'limited')             return `<span class="plt-access-badge plt-access-limited">Eingeschränkt</span>`;
  if (t.accessType === 'private_or_unclear')  return `<span class="plt-access-badge plt-access-unclear">Zugang unklar</span>`;
  if (t.accessType === 'temporarily_closed')  return `<span class="plt-access-badge plt-access-closed">Aktuell geschlossen</span>`;
  return '';
}

function _tableBadgeRow() {
  const html = Array.from(arguments).filter(Boolean).join('');
  return html ? `<div class="plt-badge-row">${html}</div>` : '';
}

function renderTableListCardHtml(t, { mode = 'map', eager = false, selected = false, metaIdPrefix = 'mli-meta' } = {}) {
  const today = _localTodayISO();
  const evCount = (t.events || []).filter(e => (e.dateStr || '') >= today).length;
  const metaId = `${metaIdPrefix}-${t.id}`;
  const activation = mode === 'select'
    ? 'confirmEventTableSelection(this.dataset.id)'
    : 'focusTableOnMap(Number(this.dataset.id))';
  const selectionState = mode === 'select' ? ` aria-pressed="${selected ? 'true' : 'false'}"` : '';

  return `
    <div class="map-list-item${selected ? ' selected' : ''}" data-id="${escAttr(String(t.id))}"
         role="button" tabindex="0"${selectionState}
         onclick="${activation}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${activation}}">
      <div class="mli-thumb">${_mapThumbHtml(t, eager ? 'eager' : 'lazy')}</div>
      <div class="map-list-info">
        <div class="map-list-title-row">
          <div class="map-list-name">${escHtml(t.name || 'Unbenannte Platte')}</div>
          ${_communityGamesTag(evCount)}
        </div>
        <div class="map-list-sub">${ic('pin', 10)} ${escHtml(t.addr || 'Adresse nicht verfügbar')}</div>
        <div class="mli-compact-meta" id="${escAttr(metaId)}">${_tableCompactMeta(t)}</div>
        ${_communityTags(t, 0)}
      </div>
    </div>`;
}

function _loadVisibleMapListMeta(items) {
  items.forEach(table => {
    if (table.ratingAvg === undefined) _loadListMeta(table.id);
  });
}

function _renderVisibleMapListItems() {
  const container = document.getElementById('map-list-container');
  if (!container || !_mapListItems.length) return;
  const visibleItems = _mapListItems.slice(0, _mapListVisibleCount);
  container.innerHTML = visibleItems.map((table, index) =>
    renderTableListCardHtml(table, { eager: index < 3 })
  ).join('');
  _loadVisibleMapListMeta(visibleItems);
}

function _appendNextMapListBatch() {
  if (_mapListVisibleCount >= _mapListItems.length) return;
  const container = document.getElementById('map-list-container');
  if (!container) return;
  const start = _mapListVisibleCount;
  _mapListVisibleCount = Math.min(start + TABLE_LIST_BATCH_SIZE, _mapListItems.length);
  const nextItems = _mapListItems.slice(start, _mapListVisibleCount);
  container.insertAdjacentHTML('beforeend', nextItems.map((table, index) =>
    renderTableListCardHtml(table, { eager: start + index < 3 })
  ).join(''));
  _loadVisibleMapListMeta(nextItems);
}

function _bindMapListProgressiveRendering(container) {
  if (container.dataset.progressiveRenderingBound === 'true') return;
  container.dataset.progressiveRenderingBound = 'true';
  container.addEventListener('scroll', () => {
    const distanceToEnd = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToEnd < 240) _appendNextMapListBatch();
  }, { passive: true });
}

function renderMapList(list) {
  const c = document.getElementById('map-list-container');
  if (!c) return;

  _mapListItems = Array.from(list);
  _mapListVisibleCount = TABLE_LIST_BATCH_SIZE;
  _bindMapListProgressiveRendering(c);

  const titleEl = document.getElementById('map-sheet-title');
  if (titleEl) titleEl.textContent = `${list.length} Platte${list.length !== 1 ? 'n' : ''}`;

  if(!list.length) {
    c.innerHTML = `<div class="map-list-empty">Keine Platten gefunden.<br><span style="font-size:0.8rem;color:var(--text-xdim);">Filter anpassen oder Suche leeren.</span></div>`;
    return;
  }

  c.scrollTop = 0;
  _renderVisibleMapListItems();
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
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const byId = new Map(src.map(table => [String(table.id), table]));
  markers.forEach(({ id: mId, m }) => {
    const table = byId.get(String(mId));
    if (table) m.setIcon(_makeMarkerIcon(table, String(mId) === String(id)));
  });
  _mapMarkerCluster?.refreshClusters?.();
}

function _resetActiveMarker() {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const byId = new Map(src.map(table => [String(table.id), table]));
  markers.forEach(({ id, m }) => {
    const table = byId.get(String(id));
    if (table) m.setIcon(_makeMarkerIcon(table));
  });
  _mapMarkerCluster?.refreshClusters?.();
}

function _mapPreviewCardHtml(t, { metaId, showClose = true, selected = false, actionLabel = '' } = {}) {
  const today = _localTodayISO();
  const evCount = (t.events || []).filter(e => (e.dateStr || '') >= today).length;
  const thumbHtml = _mapThumbHtml(t, 'eager');
  const shortAddr = (t.addr || 'Adresse nicht verfügbar').split(',')[0];
  return `
    <div class="mfp-card${selected ? ' is-selection-confirmed' : ''}" role="button" tabindex="0"
         aria-label="${escAttr(actionLabel ? `${t.name}: ${actionLabel}` : t.name)}">
      <div class="mfp-inner">
        <div class="mfp-thumb">${thumbHtml}</div>
        <div class="mfp-body">
          <div class="mfp-name-row">
            <div class="mfp-name">${escHtml(t.name)}</div>
            ${showClose ? '<button class="mfp-close" type="button" title="Schließen" aria-label="Schließen">×</button>' : ''}
          </div>
          <div class="mfp-addr">${ic('pin', 11)} ${escHtml(shortAddr)}</div>
          <div class="mfp-compact-meta" id="${escAttr(metaId)}">${_tableCompactMeta(t)}</div>
          <div class="mfp-footer-row">
            ${_communityTags(t, evCount)}
            ${actionLabel ? `<span class="mfp-action-hint">${escHtml(actionLabel)} →</span>` : ''}
          </div>
        </div>
      </div>
      ${selected ? `<span class="mfp-selection-check" aria-hidden="true">${ic('check', 20)}</span>` : ''}
    </div>`;
}

function renderMapPreviewCard({ container, table, onActivate, onClose, metaId, selected = false, actionLabel = '' }) {
  if (!container || !table) return;
  container.innerHTML = _mapPreviewCardHtml(table, { metaId, showClose: !!onClose, selected, actionLabel });
  const card = container.querySelector('.mfp-card');
  if (card) {
    const activate = event => {
      if (event.target.closest('.mfp-close')) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      onActivate?.(table.id);
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', activate);
  }
  const close = container.querySelector('.mfp-close');
  if (close) close.addEventListener('click', event => {
    event.stopPropagation();
    onClose?.();
  });

  if (table.ratingAvg === undefined) {
    _loadTableRating(table.id, metaId).then(() => {
      const meta = document.getElementById(metaId);
      if (meta) meta.innerHTML = _tableCompactMeta(table);
    });
  }
}

// Gemeinsame Community-Tag-Zeile: [📍 628 m] [📅 3 Spiele]
// Identische Darstellung wie Home-Seite — nutzt htt-dist/htt-games/home-tag-row CSS.
function _communityGamesTag(evCount) {
  return evCount
    ? `<span class="htt-games">${ic('calendar', 10)}&thinsp;${evCount}&thinsp;${evCount === 1 ? 'Spiel' : 'Spiele'}</span>`
    : '';
}

function _communityTags(t, evCount) {
  const distTag  = t.distance != null
    ? `<span class="htt-dist">${ic('pin', 10)}&thinsp;${formatDistance(t.distance)}</span>`
    : '';
  const gamesTag = _communityGamesTag(evCount);
  return (distTag || gamesTag) ? `<div class="home-tag-row">${distTag}${gamesTag}</div>` : '';
}

// Gemeinsame kompakte Meta-Zeile: ★ 4,3 · 2 Platten · Outdoor
// Wird von Popup-Card (showMapPreview) und Listen-Card (renderMapList) genutzt.
function _tableCompactMeta(t) {
  const parts = [];
  if (t.ratingAvg > 0) {
    const avg = t.ratingAvg.toFixed(1).replace('.', ',');
    parts.push(`<span class="mfp-meta-star">★</span>&thinsp;${avg}`);
  }
  if (t.tablesCount) parts.push(`${t.tablesCount} ${t.tablesCount === 1 ? 'Platte' : 'Platten'}`);
  parts.push(t.type === 'indoor' ? 'Indoor' : 'Outdoor');
  return parts.join(' · ');
}

async function _loadListMeta(tableId, metaId = `mli-meta-${tableId}`) {
  await _loadTableRating(tableId, `plt-rating-list-${tableId}`);
  const t = (tablesLoaded ? tables : FALLBACK_TABLES).find(x => x.id === tableId);
  const el = document.getElementById(metaId);
  if (el && t) el.innerHTML = _tableCompactMeta(t);
}

async function _loadHomeMeta(tableId) {
  await _loadTableRating(tableId, `plt-rating-home-${tableId}`);
  const t = (tablesLoaded ? tables : FALLBACK_TABLES).find(x => x.id === tableId);
  const el = document.getElementById(`home-meta-${tableId}`);
  if (el && t) el.innerHTML = _tableCompactMeta(t);
}

function _dismissPreviewContent() {
  if (!_previewTableId) return;
  _previewTableId = null;

  document.getElementById('map-floating-preview')?.classList.remove('is-visible');

  const bs = document.getElementById('map-bottom-sheet');
  if (bs) {
    if (_bsSnapTo) _bsSnapTo(1, false);
    bs.style.display = '';
  }

  document.querySelector('.map-page-layout')?.classList.remove('has-fp');
  document.querySelectorAll('.map-list-item').forEach(el => el.classList.remove('selected'));
  _resetActiveMarker();
}

function showMapPreview(tableId) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === tableId);
  if (!t) return;

  const wasAlreadyShowing = !!_previewTableId;
  _previewTableId = tableId;

  const fp = document.getElementById('map-floating-preview');
  if (!fp) return;
  renderMapPreviewCard({
    container: fp,
    table: t,
    metaId: `mfp-meta-${t.id}`,
    onActivate: () => showTableDetail(t.id),
    onClose: () => hideMapPreview(),
    actionLabel: 'Details ansehen'
  });

  if (!wasAlreadyShowing) {
    fp.classList.remove('is-visible');
    void fp.offsetHeight;
    fp.classList.add('is-visible');

    const bs = document.getElementById('map-bottom-sheet');
    if (bs) bs.style.display = 'none';

    document.querySelector('.map-page-layout')?.classList.add('has-fp');
  }

  // Pan so the selected marker sits clearly above the floating card
  if (leafletMap) {
    leafletMap.setView([t.lat, t.lng], 16, { animate: true });
    setTimeout(() => {
      if (_previewTableId === tableId) leafletMap.panBy([0, 72], { animate: true });
    }, 380);
  }

  _setActiveMarker(tableId);
}

function focusTableOnMap(tableId) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t   = src.find(x => x.id === tableId);

  if (!t || !Number.isFinite(+t.lat) || !Number.isFinite(+t.lng)) {
    if (t) showTableDetail(tableId);
    else showToast('Für diese Platte ist kein Kartenstandort verfügbar.', { type: 'info' });
    return;
  }

  showMapPreview(tableId);
}

function hideMapPreview() {
  if (!_previewTableId) return;
  _dismissPreviewContent();
}

function refreshActiveMapPreview() {
  if (_previewTableId) showMapPreview(_previewTableId);
}
