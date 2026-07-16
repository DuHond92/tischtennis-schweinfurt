// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENTS                                             ║
// ╚══════════════════════════════════════════════════════════════╝
let _psCollapsed       = false;
let _gamesCollapsed    = false;
let _eventsRadiusActive = false;
// ── Radius / Suchzentrum – State ──────────────────────────────────
// localStorage kann bei vollem Quota eine Exception werfen — sicher einlesen
function _lsGet(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch(_) { return fallback; }
}
let _psRadius      = Math.max(1, Math.min(25, parseInt(_lsGet('tt_ps_radius', '5')) || 5));
let _psSearchLat   = parseFloat(_lsGet('tt_ps_lat'))  || null;
let _psSearchLng   = parseFloat(_lsGet('tt_ps_lng'))  || null;
let _psSearchLabel = _lsGet('tt_ps_label');
let _psSearchType  = _lsGet('tt_ps_type'); // 'manual_place' | 'current_location' | ''

let _psGeoTimer = null, _psGeoAbort = null;
let _psGeoItems = [];

// ── Standort-State für das Erstell-Formular (getrennt vom Filter) ─
let _msFormLat = null, _msFormLng = null, _msFormLabel = '';
let _msGeoTimer = null, _msGeoAbort = null, _msGeoItems = [];

// ── Shared Radius-Slider Helpers ─────────────────────────────────────
const _RADIUS_MIN = 1, _RADIUS_MAX = 25;

function _radiusClamp(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(_RADIUS_MIN, Math.min(_RADIUS_MAX, Math.round(n))) : 5;
}

function _radiusProgress(val) {
  return ((val - _RADIUS_MIN) / (_RADIUS_MAX - _RADIUS_MIN) * 100).toFixed(2) + '%';
}

// Setzt Slider-Value, CSS-Variable für Track-Füllung und sichtbares Label in einem Schritt.
// Thumb-Position kommt vom nativen Browser (value/min/max); nur --range-progress wird per JS gesetzt.
function _radiusSliderUpdate(sliderId, displayId, val) {
  const v = _radiusClamp(val);
  const slider  = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (slider) {
    slider.value = v;
    slider.setAttribute('aria-valuenow', v);
    slider.setAttribute('aria-valuetext', v + ' Kilometer');
    slider.style.setProperty('--range-progress', _radiusProgress(v));
    slider.parentElement && slider.parentElement.querySelectorAll('.radius-snap-btn[data-snap-km]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.snapKm) === v);
    });
  }
  if (display) display.textContent = v + ' km';
  return v;
}

// ── Geocoding: shared helpers ────────────────────────────────────────

// Normalize for comparison only (not for display or query)
function _geoNorm(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function _geoLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) { dp[i] = [i]; for (let j = 1; j <= n; j++) dp[i][j] = i ? 0 : j; }
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Regional seed list for fuzzy correction fallback (transpositions/substitutions)
const _GEO_KNOWN_PLACES = [
  'Schweinfurt','Dittelbrunn','Würzburg','Bamberg','Erlangen','Nürnberg',
  'München','Frankfurt am Main','Hamburg','Berlin','Köln','Stuttgart',
  'Dortmund','Essen','Leipzig','Dresden','Hannover','Bremen','Düsseldorf',
  'Bad Kissingen','Haßfurt','Hambach','Gochsheim','Sennfeld','Bergrheinfeld',
  'Schonungen','Grafenrheinfeld','Niederwerrn','Oberwerrn','Werneck',
  'Waigolshausen','Kolitzheim','Volkach','Gerolzhofen','Stadtlauringen',
  'Geldersheim','Röthlein','Üchtelhausen','Poppenhausen','Oerlenbach',
  'Burkardroth','Münnerstadt','Karlstadt','Lohr am Main','Gemünden am Main',
  'Marktheidenfeld','Arnstein','Ebern','Hofheim in Unterfranken',
  'Zeil am Main','Eltmann','Baunach','Kitzingen','Ochsenfurt',
  'Bad Brückenau','Aschaffenburg','Miltenberg','Coburg','Lichtenfels',
  'Forchheim','Fürth','Ingolstadt','Augsburg','Regensburg','Bayreuth',
  'Ansbach','Hof','Knetzgau','Euerbach','Theres','Grettstadt','Sulzheim',
  'Donnersdorf','Großbardorf','Heidenfeld','Wipfeld','Obbach','Röthlein'
];

function _geoFuzzyCorrect(q) {
  const qn = _geoNorm(q);
  const maxD = qn.length <= 5 ? 1 : qn.length <= 10 ? 2 : Math.ceil(qn.length * 0.2);
  let best = null, bestDist = Infinity;
  for (const place of _GEO_KNOWN_PLACES) {
    const pn = _geoNorm(place);
    if (Math.abs(pn.length - qn.length) > maxD + 1) continue;
    const d = _geoLevenshtein(qn, pn);
    if (d < bestDist) { bestDist = d; best = place; }
  }
  return (best && bestDist > 0 && bestDist <= maxD) ? best : null;
}

function _geoDedupeItems(items) {
  const seen = new Set();
  return items.filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; });
}

// Append * to last word for Nominatim prefix matching (handles truncated queries)
function _geoWildcard(q) {
  const parts = q.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  if (last.length >= 3 && !last.endsWith('*')) parts[parts.length - 1] = last + '*';
  return parts.join(' ');
}

async function _geoFetch(q, abort) {
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(q)}&format=json&limit=8` +
    `&addressdetails=1&countrycodes=de&accept-language=de` +
    `&viewbox=9.8,50.25,10.75,49.85&bounded=0` +
    `&email=kontakt%40plattentreff.app`;
  const res = await fetch(url, { signal: abort.signal, headers: { 'Accept-Language': 'de' } });
  return (await res.json()).map(r => ({
    lat:   parseFloat(r.lat),
    lng:   parseFloat(r.lon),
    label: r.name || r.display_name.split(',')[0],
    sub:   r.display_name.split(',').slice(1, 3).join(',').trim(),
    key:   r.place_id ? `p${r.place_id}` : `${r.osm_type || ''}${r.osm_id || ''}`
  }));
}

// Liefert das aktive Suchzentrum (manuell oder GPS)
function _psCenter() {
  if (_psSearchLat != null && _psSearchLng != null) return { lat: _psSearchLat, lng: _psSearchLng };
  if (typeof userLat !== 'undefined' && userLat && userLng) return { lat: userLat, lng: userLng };
  return null;
}

function _psDist(ps) {
  if (ps.lat == null || ps.lng == null) return null;
  const c = _psCenter();
  if (!c) return null;
  return calcDistance(c.lat, c.lng, ps.lat, ps.lng);
}

function _psGetFiltered(src) {
  const c = _psCenter();
  if (!c) return { list: src, filteredOut: 0, withoutCoords: [], noLocation: true };

  const withCoords    = src.filter(ps => ps.lat != null && ps.lng != null);
  const withoutCoords = src.filter(ps => ps.lat == null || ps.lng == null);
  const inRadius      = withCoords.filter(ps => (_psDist(ps) || Infinity) <= _psRadius * 1000);

  inRadius.sort((a, b) => (_psDist(a) || 0) - (_psDist(b) || 0));

  return {
    list: inRadius,
    filteredOut: withCoords.length - inRadius.length,
    withoutCoords,   // koordinatenlose Gesuche — werden im Render nach Ownership aufgeteilt
    noLocation: false
  };
}

// Chip-Beschriftung für Home- und Gesuche-Seite
function _psChipLabel() {
  if (_psSearchType === 'manual_place' && _psSearchLabel) {
    const short = _psSearchLabel.length > 16 ? _psSearchLabel.slice(0, 16) + '…' : _psSearchLabel;
    return `${short} · ${_psRadius} km`;
  }
  const city = (typeof currentUser !== 'undefined' && currentUser?.city) ? currentUser.city : null;
  if (city) return `${city} · ${_psRadius} km`;
  if (typeof userLat !== 'undefined' && userLat) return `In deiner Nähe · ${_psRadius} km`;
  return `Umkreis: ${_psRadius} km`;
}

function _updateEfcRadius() {
  const el = document.getElementById('efc-radius-label');
  if (el) el.textContent = _eventsRadiusActive ? _psChipLabel() : 'Umkreis';
  document.getElementById('efc-radius')?.classList.toggle('efc-chip--active', _eventsRadiusActive);
}

function _updateEfcReset() {
  const anyActive = currentTimeFilter !== 'all' || currentTypeFilter !== 'all' || _eventsRadiusActive;
  const el = document.getElementById('efc-reset');
  if (el) el.style.display = anyActive ? '' : 'none';
}

function openFilterSheet(type) {
  if (type === 'time') {
    document.querySelectorAll('#filter-time-sheet .fso-item').forEach(b =>
      b.classList.toggle('fso-item--active', b.dataset.value === currentTimeFilter));
    openSheet('filter-time-sheet');
  } else if (type === 'mode') {
    document.querySelectorAll('#filter-mode-sheet .fso-item').forEach(b =>
      b.classList.toggle('fso-item--active', b.dataset.value === currentTypeFilter));
    openSheet('filter-mode-sheet');
  }
}

function applyTimeFilter(value, chipLabel) {
  currentTimeFilter = value;
  const el = document.getElementById('efc-time-label');
  if (el) el.textContent = chipLabel;
  document.getElementById('efc-time')?.classList.toggle('efc-chip--active', value !== 'all');
  _updateEfcReset();
  closeAllSheets();
  renderEvents();
}

function applyModeFilter(value, chipLabel) {
  currentTypeFilter = value;
  currentFilter = value;
  const el = document.getElementById('efc-mode-label');
  if (el) el.textContent = chipLabel;
  document.getElementById('efc-mode')?.classList.toggle('efc-chip--active', value !== 'all');
  _updateEfcReset();
  closeAllSheets();
  renderEvents();
}

// ── Radius-Sheet öffnen ───────────────────────────────────────────
function openPsRadiusSheet() {
  const input = document.getElementById('psr-search-input');
  const clear  = document.getElementById('psr-clear');
  const dd     = document.getElementById('psr-dropdown');
  if (input) {
    input.value = (_psSearchType === 'manual_place' && _psSearchLabel) ? _psSearchLabel : '';
    if (clear) clear.style.display = input.value ? '' : 'none';
  }
  if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
  _psGeoItems = [];
  _psUpdateLocationStatus();
  _radiusSliderUpdate('psr-radius-slider', 'psr-radius-display', _psRadius);
  _psrClearError();
  openSheet('ps-radius-sheet');
}

const _PSR_ERRORS = {
  required:      { title: 'Ort oder Standort erforderlich',   desc: 'Gib einen Ort ein oder verwende deinen aktuellen Standort.' },
  location_fail: { title: 'Standort nicht verfügbar',         desc: 'Gib stattdessen einen Ort ein oder erlaube den Standortzugriff in den Einstellungen.' }
};

function _psrShowError(type) {
  const e = _PSR_ERRORS[type] || _PSR_ERRORS.required;
  showInlineError('psr-validation', e);
}

function _psrClearError() {
  clearInlineError('psr-validation');
  const input = document.getElementById('psr-search-input');
  if (input) {
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
  }
}

function _psUpdateLocationStatus() {
  const el = document.getElementById('psr-location-status');
  if (!el) return;
  const hasGps = typeof userLat !== 'undefined' && userLat && userLng;
  if (_psSearchType === 'manual_place' && _psSearchLabel) {
    el.innerHTML = `<div class="psr-loc-ok">${ic('pin', 13)} ${escHtml(_psSearchLabel)} ausgewählt</div>`;
  } else if (_psSearchType === 'current_location' || hasGps) {
    el.innerHTML = `<div class="psr-loc-ok">${ic('pin', 13)} ${hasGps ? 'Aktueller Standort aktiv' : 'Standort wird angefordert…'}</div>`;
  } else {
    el.innerHTML = '';
  }
}

// ── Geocoding-Suche im Sheet ──────────────────────────────────────
function _psSearchInput(val) {
  const clear = document.getElementById('psr-clear');
  if (clear) clear.style.display = val ? '' : 'none';
  clearTimeout(_psGeoTimer);
  const dd = document.getElementById('psr-dropdown');
  if (!dd) return;
  if (val.length < 2) { dd.innerHTML = ''; dd.classList.remove('open'); return; }
  dd.innerHTML = `<div class="search-loading"><div class="search-spinner"></div> Suche läuft…</div>`;
  dd.classList.add('open');
  _psGeoTimer = setTimeout(() => _psRunSearch(val), 350);
}

function _psSearchKey(e) {
  if (e.key === 'Enter' && _psGeoItems.length) { e.preventDefault(); _psSelectPlace(0); }
}

async function _psRunSearch(q) {
  _psGeoItems = [];
  if (_psGeoAbort) _psGeoAbort.abort();
  _psGeoAbort = new AbortController();
  let corrected = null;
  try {
    let items = _geoDedupeItems(await _geoFetch(_geoWildcard(q), _psGeoAbort)).slice(0, 5);
    if (!items.length) {
      corrected = _geoFuzzyCorrect(q);
      if (corrected)
        items = _geoDedupeItems(await _geoFetch(_geoWildcard(corrected), _psGeoAbort)).slice(0, 5);
    }
    _psGeoItems = items;
    if (window.PT_DEBUG || location.hostname === 'localhost')
      console.log('[geo/ps] q=%s wildcard=%s fuzzy=%s results=%d', q, _geoWildcard(q), corrected || '-', items.length);
  } catch(e) { if (e?.name === 'AbortError') return; }
  _psRenderDd(q, corrected);
}

function _psRenderDd(q, corrected) {
  const dd = document.getElementById('psr-dropdown');
  if (!dd) return;
  if (!_psGeoItems.length) {
    dd.innerHTML = `<div class="search-empty">Keine Ergebnisse für „${escHtml(q)}"</div>`;
    dd.classList.add('open');
    return;
  }
  const dispQ = corrected || q;
  const hl = s => {
    try {
      return escHtml(s).replace(
        new RegExp(`(${escHtml(dispQ).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
        '<mark>$1</mark>'
      );
    } catch(_) { return escHtml(s); }
  };
  const hint = corrected
    ? `<div class="geo-hint">Ergebnisse für „${escHtml(corrected)}"</div>` : '';
  dd.innerHTML = hint + _psGeoItems.map((item, i) => `
    <div class="search-dropdown-item" tabindex="0"
         onmousedown="_psSelectPlace(${i})"
         ontouchend="event.preventDefault();_psSelectPlace(${i})"
         onkeydown="if(event.key==='Enter')_psSelectPlace(${i})">
      <div class="sdi-icon place">${ic('pin', 18)}</div>
      <div>
        <div class="sdi-main">${hl(item.label)}</div>
        ${item.sub ? `<div class="sdi-sub">${escHtml(item.sub)}</div>` : ''}
      </div>
    </div>`).join('');
  dd.classList.add('open');
}

function _psSelectPlace(idx) {
  const item = _psGeoItems[idx];
  if (!item) return;
  const dd    = document.getElementById('psr-dropdown');
  const input = document.getElementById('psr-search-input');
  if (dd)    { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (input) input.value = item.label;

  _psSearchLat   = item.lat;
  _psSearchLng   = item.lng;
  _psSearchLabel = item.label;
  _psSearchType  = 'manual_place';

  _psUpdateLocationStatus();
  _psrClearError();
}

function _psClearSearch() {
  const input = document.getElementById('psr-search-input');
  const clear  = document.getElementById('psr-clear');
  const dd     = document.getElementById('psr-dropdown');
  if (input) input.value = '';
  if (clear) clear.style.display = 'none';
  if (dd)   { dd.innerHTML = ''; dd.classList.remove('open'); }
}

function _psUseCurrentLocation() {
  _psClearSearch();
  _psSearchLat   = null;
  _psSearchLng   = null;
  _psSearchLabel = '';
  _psrClearError();

  // Already have GPS coords — use them immediately
  if (typeof userLat !== 'undefined' && userLat && userLng) {
    _psSearchType = 'current_location';
    _psUpdateLocationStatus();
    return;
  }

  _psSearchType = 'current_location';
  _psUpdateLocationStatus();

  if (!navigator.geolocation) {
    _psSearchType = null;
    _psrShowError('location_fail');
    _psUpdateLocationStatus();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      if (typeof updateDistances === 'function') updateDistances();
      _psUpdateLocationStatus();
      _psrClearError();
    },
    () => {
      _psSearchType = null;
      _psrShowError('location_fail');
      _psUpdateLocationStatus();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

// ── Slider-Eingabe & Schnellwerte für ps-radius-sheet ────────────
function _psrSliderInput(val) {
  _radiusSliderUpdate('psr-radius-slider', 'psr-radius-display', parseInt(val));
}

function _psrSnapRadius(val) {
  _radiusSliderUpdate('psr-radius-slider', 'psr-radius-display', val);
}

function applyPsRadius() {
  const c = _psCenter();
  if (!c) {
    const isLocationIntent = _psSearchType === 'current_location';
    _psrShowError(isLocationIntent ? 'location_fail' : 'required');
    if (!isLocationIntent) {
      const input = document.getElementById('psr-search-input');
      if (input) {
        input.classList.add('input-error');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    return;
  }
  _psrClearError();

  const slider = document.getElementById('psr-radius-slider');
  if (slider) _psRadius = _radiusClamp(parseInt(slider.value));

  try {
    localStorage.setItem('tt_ps_radius', String(_psRadius));
    if (_psSearchType === 'manual_place' && _psSearchLat && _psSearchLng) {
      localStorage.setItem('tt_ps_lat',   String(_psSearchLat));
      localStorage.setItem('tt_ps_lng',   String(_psSearchLng));
      localStorage.setItem('tt_ps_label', _psSearchLabel);
      localStorage.setItem('tt_ps_type',  'manual_place');
    } else {
      localStorage.removeItem('tt_ps_lat');
      localStorage.removeItem('tt_ps_lng');
      localStorage.removeItem('tt_ps_label');
      localStorage.setItem('tt_ps_type', 'current_location');
    }
  } catch(_) { /* Quota überschritten — Filter-State nicht persistent, funktioniert trotzdem */ }

  _eventsRadiusActive = true;
  PTAnalytics.track('radius_filter_changed', { radius_km: _psRadius });
  closeAllSheets();
  renderEvents();
  // Globale Synchronisation: alle Home-Bereiche mit neuem Radius neu rendern
  if (typeof renderHome === 'function') renderHome();
}

function _toggleFeedSection(key) {
  if (key === 'ps') _psCollapsed = !_psCollapsed;
  else              _gamesCollapsed = !_gamesCollapsed;
  const collapsed = key === 'ps' ? _psCollapsed : _gamesCollapsed;
  const wrap    = document.getElementById(`feed-${key}-wrap`);
  const chevron = document.getElementById(`feed-${key}-chevron`);
  if (wrap)    wrap.style.display       = collapsed ? 'none' : '';
  if (chevron) chevron.style.transform  = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
}

async function joinEvent(eventId, btn) {
  btn.disabled = true; btn.textContent = '…';
  if (!sb.isLoggedIn()) {
    btn.disabled = false; btn.textContent = 'Teilnehmen';
    showAuthPrompt();
    return;
  }
  const isFallback = allEvents.length === 0;
  if (isFallback) {
    setTimeout(()=>{
      btn.textContent='Dabei'; btn.style.background='var(--green)';
      showToast('Du nimmst am Event teil!');
    }, 400);
    return;
  }
  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });
  if(error && error.code === '23505') {
    showToast('Du nimmst bereits teil','info');
    btn.textContent='Dabei'; btn.style.background='var(--green)';
  } else if(error) {
    showToast('Fehler beim Beitreten','error');
    btn.disabled=false; btn.textContent='Dabei';
  } else {
    btn.textContent='Dabei'; btn.style.background='var(--green)';
    PTAnalytics.track('game_joined');
    showToast('Du nimmst am Event teil!');
    _patchEventParticipantJoin(eventId);
    renderHome();
    renderEvents();
  }
}

function renderPlayerSearchCard(ps, opts = {}) {
  const cardClick    = `showPlayerSearchDetail(${ps.id})`;
  const profileClick = `event.stopPropagation();showPlayerProfile('${escAttr(ps.userId||'')}','${escAttr(ps.username||'')}','${escAttr(ps.avatarEmoji||'')}',null,'${escAttr(ps.avatarUrl||'')}')`;
  const avHtml = getAvatarHtml({ avatar_emoji: ps.avatarEmoji, avatar_url: ps.avatarUrl, username: ps.username }, { size: 46 });
  const myId = sb.isLoggedIn() ? String(sb.getUserId()) : null;
  const isMySearch = myId && String(ps.userId) === myId;

  // 4. Zeitpunkt
  const wann = (ps.wann && ps.wann !== 'Egal') ? ps.wann : null;

  // 5. Entfernung + Suchradius (gemeinsame Zeile)
  const distParts = [];
  const dist = _psDist(ps);
  if (dist != null) {
    const distStr = typeof formatDistance === 'function'
      ? formatDistance(Math.round(dist))
      : (dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1).replace('.', ',') + ' km');
    distParts.push(`${distStr} entfernt`);
  } else if (ps.location_label) {
    distParts.push(escHtml(ps.location_label));
  }
  const srKm = ps.search_radius_km;
  if (srKm)                               distParts.push(`sucht im Umkreis ${srKm} km`);
  else if (ps.umkreis && ps.umkreis !== 'Egal') distParts.push(escHtml(ps.umkreis));

  return `
    <div class="player-search-card fade-up" onclick="${cardClick}">
      <!-- 1. Name + Badges -->
      <div class="psc-header">
        <div class="pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="psc-identity">
          <div class="psc-name pp-clickable" onclick="${profileClick}">${escHtml(ps.username || 'Spieler')}</div>
          ${gameTypePill(ps.spielart) ? `<div class="psc-type-row">${gameTypePill(ps.spielart)}</div>` : ''}
        </div>
        <div class="ecb-chevron">›</div>
      </div>
      <!-- 2. Persönliche Nachricht als Sprechblase -->
      ${ps.message ? `<div class="psc-bubble">${escHtml(ps.message)}</div>` : ''}
      <!-- 3. Zeitpunkt -->
      ${wann ? `<div class="psc-when">${ic('clock', 11)} ${escHtml(wann)}</div>` : ''}
      <!-- 4. Entfernung + Suchradius -->
      ${distParts.length ? `<div class="psc-meta">${ic('pin', 11)} ${distParts.join(' · ')}</div>` : ''}
      ${opts.noCoords ? `<div class="psc-no-location">${ic('pin', 11)} Kein Standort gesetzt</div>` : ''}
      ${isMySearch ? userStatusLine('Von dir erstellt') : ''}
    </div>`;
}

function _sortByDate(a, b) {
  return ((a.dateStr || '') + (a.time || '')).localeCompare((b.dateStr || '') + (b.time || ''));
}

function _psDateSortKey(ps) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const str  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00`;
  switch (ps.wann) {
    case 'Jetzt':       return str(now);
    case 'Heute':       return str(now);
    case 'Heute Abend': { const d = new Date(now); d.setHours(18,0,0,0); return str(d); }
    case 'Morgen':      { const d = new Date(now); d.setDate(d.getDate() + 1); return str(d); }
    case 'Diese Woche': { const d = new Date(now); d.setDate(d.getDate() + 3); return str(d); }
    case 'Wochenende':  { const d = new Date(now); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return str(d); }
    default: return '9999-12-31T00:00'; // Egal / unbekannt → ans Ende
  }
}

function getSortedEvents(events) {
  if (currentSort === 'dist') {
    return [...events].sort((a, b) => {
      const tA = tables.find(t => t.id === a.tid);
      const tB = tables.find(t => t.id === b.tid);
      const dA = (typeof userLat !== 'undefined' && userLat && tA?.lat) ? calcDistance(userLat, userLng, tA.lat, tA.lng) : Infinity;
      const dB = (typeof userLat !== 'undefined' && userLat && tB?.lat) ? calcDistance(userLat, userLng, tB.lat, tB.lng) : Infinity;
      return dA !== dB ? dA - dB : _sortByDate(a, b);
    });
  }
  return [...events].sort(_sortByDate);
}

function sortEvents(sort, btn) {
  currentSort = sort;
  document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

function renderEventCard(e, idx = 0) {
  const thumbFallback = e.type === 'punktspiel' ? 'images/placeholders/game_tournament.png'
    : e.type === 'casual'    ? 'images/placeholders/game_fun.png'
    : e.type === 'training'  ? 'images/placeholders/game_training.png'
    : 'images/placeholders/game_fun.png';
  const loadAttr = idx < 2 ? 'eager' : 'lazy';
  const thumbInner = (e.photos && e.photos.length)
    ? `<img src="${escAttr(e.photos[0])}" onerror="this.src='${thumbFallback}'" loading="${loadAttr}" decoding="async">`
    : `<img src="${thumbFallback}" loading="${loadAttr}" decoding="async">`;
  return `
  <div class="event-card-big fade-up" onclick="showEventDetail(${e.id})">
    <div class="ecb-thumb ev-thumb-${e.type||'casual'}">${thumbInner}</div>
    <div class="ecb-info">
      <div class="ecb-title">${e.name}</div>
      <div class="ecb-title-row">
        <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
      </div>
      <div class="ecb-date">${ic('calendar',12)} ${formatEventDate(e)}</div>
      <div class="ecb-creator">${ic('user',12)} ${e.creatorId
        ? `<b class="pp-clickable" style="cursor:pointer;" onclick="event.stopPropagation();showPlayerProfile('${escAttr(e.creatorId)}','${escAttr(e.creator||'')}','${escAttr(e.creatorEmoji||'')}',null,'${escAttr(e.creatorAvatarUrl||'')}')">${escHtml(e.creator||'Anonym')}</b>`
        : `<b>${escHtml(e.creator||'Anonym')}</b>`}</div>
      <div class="ecb-location">${icPlate(12)} ${e.tname}</div>
      <div class="ecb-participants-row">${participantStack(e.participants,4,26)}<span class="ecb-pcount">${e.p}/${e.max} Spieler</span></div>
      ${eventStatusBlock(e)}
    </div>
    <div class="ecb-chevron">›</div>
  </div>`;
}

function _applyTimeFilter(games) {
  if (currentTimeFilter === 'all') return games;
  const now   = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const ds    = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = ds(now);
  if (currentTimeFilter === 'today')   return games.filter(e => e.dateStr === today);
  if (currentTimeFilter === 'tomorrow') {
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    return games.filter(e => e.dateStr === ds(tmrw));
  }
  if (currentTimeFilter === 'week') {
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    return games.filter(e => e.dateStr >= today && e.dateStr <= ds(weekEnd));
  }
  if (currentTimeFilter === 'weekend') {
    return games.filter(e => {
      if (!e.dateStr) return false;
      const [y, mo, d] = e.dateStr.split('-').map(Number);
      return [0, 6].includes(new Date(y, mo - 1, d).getDay());
    });
  }
  if (currentTimeFilter === 'later') {
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    return games.filter(e => e.dateStr > ds(weekEnd));
  }
  return games;
}

function _applyTimePsFilter(src) {
  if (currentTimeFilter === 'all')      return src;
  if (currentTimeFilter === 'today')    return src.filter(ps => ['Jetzt','Heute','Heute Abend','Egal'].includes(ps.wann));
  if (currentTimeFilter === 'tomorrow') return src.filter(ps => ['Morgen','Diese Woche','Egal'].includes(ps.wann));
  if (currentTimeFilter === 'week')     return src.filter(ps => ['Jetzt','Heute','Heute Abend','Morgen','Diese Woche','Egal'].includes(ps.wann));
  if (currentTimeFilter === 'weekend')  return src.filter(ps => ['Diese Woche','Egal'].includes(ps.wann));
  if (currentTimeFilter === 'later')    return src.filter(ps => ps.wann === 'Egal');
  return src;
}

function renderEvents() {
  const c = document.getElementById('events-list');

  // Apply time + type filter to events; always strip past entries
  const todayStr  = new Date().toISOString().slice(0, 10);
  const timeGames = _applyTimeFilter(allEvents).filter(e => !e.dateStr || e.dateStr >= todayStr);
  const typeGames = currentTypeFilter === 'all'
    ? timeGames
    : timeGames.filter(e => e.type === currentTypeFilter);
  const games = typeGames; // sorting handled in combined merge below

  // Apply type + time + radius filter to player searches
  let srcPs = currentTypeFilter === 'all'
    ? allPlayerSearches
    : allPlayerSearches.filter(ps => ps.spielart === currentTypeFilter);
  srcPs = _applyTimePsFilter(srcPs);
  const { list: psFiltered, filteredOut, withoutCoords = [] } = _eventsRadiusActive
    ? _psGetFiltered(srcPs)
    : { list: srcPs, filteredOut: 0, withoutCoords: [], noLocation: false };

  // Eigene Gesuche ohne Koordinaten immer im Feed zeigen; fremde separat gruppieren
  const uid = sb.isLoggedIn() ? sb.getUserId() : null;
  const ownNoCoords   = uid ? withoutCoords.filter(ps => ps.userId === uid) : [];
  const otherNoCoords = withoutCoords.filter(ps => ps.userId !== uid);

  _updateEfcRadius();
  _updateEfcReset();

  const hasItems = games.length > 0 || psFiltered.length > 0 || ownNoCoords.length > 0 || otherNoCoords.length > 0;

  if (!hasItems) {
    const canReset = currentTimeFilter !== 'all' || currentTypeFilter !== 'all';
    c.innerHTML = `<div class="empty-state-card">
      <div class="esc-icon">${ic('calendar', 36)}</div>
      <div class="esc-title">Keine passenden Einträge gefunden</div>
      <div class="esc-body">Passe deine Filter an oder erstelle ein neues Spiel/Gesuch.</div>
      <div class="esc-actions">
        ${canReset ? `<button class="esc-btn esc-btn-ghost" onclick="resetEventFilters()">Filter zurücksetzen</button>` : ''}
        <button class="esc-btn" onclick="openSheet('create-choice-sheet')">+ Erstellen</button>
      </div>
    </div>`;
    return;
  }

  // Merge + sort events and player searches into one chronological list
  // Eigene Gesuche ohne Koordinaten werden ans Ende des Feeds gehängt (nach Datum sortiert)
  const combined = [
    ...games.map(e => ({
      kind: 'event', data: e, noCoords: false,
      sortKey: (e.dateStr || '9999-12-31') + 'T' + (e.time || '00:00'),
      dist: (() => { const t = tables.find(t => t.id === e.tid); return (typeof userLat !== 'undefined' && userLat && t?.lat) ? calcDistance(userLat, userLng, t.lat, t.lng) : Infinity; })()
    })),
    ...psFiltered.map(ps => ({
      kind: 'ps', data: ps, noCoords: false,
      sortKey: _psDateSortKey(ps),
      dist: _psDist(ps) ?? Infinity
    })),
    ...ownNoCoords.map(ps => ({
      kind: 'ps', data: ps, noCoords: true,
      sortKey: _psDateSortKey(ps),
      dist: Infinity   // kein Standort → immer am Ende bei Distanzsortierung
    }))
  ];
  if (currentSort === 'dist') {
    // Nähe zuerst — Entfernung primär, Datum sekundär
    combined.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.sortKey.localeCompare(b.sortKey);
    });
  } else {
    // Bald zuerst (default) — Datum primär, Entfernung als Tiebreaker
    combined.sort((a, b) => {
      const keyCmp = a.sortKey.localeCompare(b.sortKey);
      if (keyCmp !== 0) return keyCmp;
      return a.dist - b.dist;
    });
  }

  let feedHtml = combined.map((item, idx) =>
    item.kind === 'event'
      ? renderEventCard(item.data, idx)
      : renderPlayerSearchCard(item.data, { noCoords: item.noCoords })
  ).join('');

  // Fremde Gesuche ohne Koordinaten — als eigene Gruppe am Ende
  if (otherNoCoords.length > 0) {
    feedHtml += `<div class="ps-no-coords-group">
      <div class="ps-radius-note" style="margin-bottom:6px;">
        ${ic('pin', 13)} ${otherNoCoords.length} Gesuch${otherNoCoords.length !== 1 ? 'e' : ''} ohne Standort
      </div>
      ${otherNoCoords.map(ps => renderPlayerSearchCard(ps, { noCoords: true })).join('')}
    </div>`;
  }

  if (psFiltered.length === 0 && filteredOut > 0) {
    feedHtml += `<div class="ps-radius-note">
      ${ic('users', 13)} ${filteredOut} Gesuch${filteredOut !== 1 ? 'e' : ''} außerhalb des Radius —
      <span class="ps-expand-link" onclick="openPsRadiusSheet()">Umkreis erweitern</span>
    </div>`;
  }

  c.innerHTML = `<div class="events-feed">${feedHtml}</div>`;
}

function filterTime(type, btn) {
  currentTimeFilter = type;
  document.querySelectorAll('#event-time-pills .filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

function filterType(type, btn) {
  currentTypeFilter = type;
  currentFilter = type;
  document.querySelectorAll('#event-type-pills .filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

function resetEventFilters() {
  currentTimeFilter = 'all';
  currentTypeFilter = 'all';
  currentFilter = 'all';
  _eventsRadiusActive = false;
  const tl = document.getElementById('efc-time-label'); if (tl) tl.textContent = 'Zeitraum';
  const ml = document.getElementById('efc-mode-label'); if (ml) ml.textContent = 'Spielmodus';
  document.getElementById('efc-time')?.classList.remove('efc-chip--active');
  document.getElementById('efc-mode')?.classList.remove('efc-chip--active');
  _updateEfcRadius();
  _updateEfcReset();
  renderEvents();
}

function filterEvents(type, btn) {
  const isTime = type === 'all' || type === 'today' || type === 'week' || type === 'weekend';
  if (isTime) {
    currentTimeFilter = type;
    currentTypeFilter = 'all';
  } else {
    currentTypeFilter = type;
    currentFilter = type;
  }
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEvents();
}

function activateMitspielerFilter() {
  showPage('events');
  resetEventFilters();
}

function _resetCreateEventForm(titleText = 'Spiel organisieren', btnText = 'Spiel organisieren') {
  _editingEventId = null;
  const titleEl = document.getElementById('create-event-sheet-title');
  if (titleEl) titleEl.textContent = titleText;
  const submitBtn = document.getElementById('create-event-submit-btn');
  if (submitBtn) submitBtn.textContent = btnText;
  document.getElementById('ev-name').value  = '';
  document.getElementById('ev-date').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('ev-time').value  = '15:00';
  document.getElementById('ev-mode').value  = 'casual';
  const evMax = document.getElementById('ev-max');
  if (evMax) evMax.value = '4';
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = '';
  clearInlineError('ec-form-error');
}

// Öffnet "Spiel erstellen" als eigenständige Unterseite der Platten-Detailansicht.
function openCreateEventSheetFromTds(tableId) {
  _createEventFromTds = true;
  _resetCreateEventForm();
  PTAnalytics.track('game_create_started', { source: 'tds' });
  const sel = document.getElementById('ev-table');
  if (sel) sel.value = tableId;
  openTdsSubpage('create-event-sheet');
}

// Schließt "Spiel erstellen" und kehrt zum Ausgangspunkt zurück.
function closeCreateEventSheet() {
  if (_createEventFromTds) {
    _createEventFromTds = false;
    closeTdsSubpage('create-event-sheet');
  } else {
    closeAllSheets();
  }
}

function openCreateEventSheet() {
  _createEventFromTds = false;
  _resetCreateEventForm();
  PTAnalytics.track('game_create_started');
  closeAllSheets();
  openSheet('create-event-sheet');
}

async function submitCreateEvent() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
  const title   = document.getElementById('ev-name').value.trim();
  const tableId = document.getElementById('ev-table').value;
  const date    = document.getElementById('ev-date').value;
  const time    = document.getElementById('ev-time').value;
  const mode    = document.getElementById('ev-mode').value;
  const maxP    = parseInt(document.getElementById('ev-max')?.value || '4', 10) || 4;
  const desc    = (document.getElementById('ev-desc')?.value || '').trim();
  if(!title || !tableId || !date || !time) {
    showInlineError('ec-form-error', { title: 'Felder fehlen', desc: 'Bitte Name, Platte, Datum und Uhrzeit ausfüllen.' });
    if (!title) document.getElementById('ev-name')?.focus();
    else if (!tableId) document.getElementById('ev-table')?.focus();
    else if (!date) document.getElementById('ev-date')?.focus();
    else document.getElementById('ev-time')?.focus();
    return;
  }
  clearInlineError('ec-form-error');

  let _fromTds = false;

  if(_editingEventId) {
    const { error } = await new QueryBuilder('events').eq('id', _editingEventId).update({
      title, table_id: parseInt(tableId), event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) { showToast('Fehler beim Speichern','error'); console.error(error); return; }
    _editingEventId = null;
    closeAllSheets();
    showToast('Event gespeichert!');
  } else {
    // 1. Event anlegen
    const { data: inserted, error } = await new QueryBuilder('events').insert({
      title, table_id: parseInt(tableId),
      creator_id: sb.getUserId(),
      event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) { showToast('Fehler beim Erstellen','error'); console.error(error); return; }

    // 2. Ersteller sofort als Teilnehmer eintragen
    const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if(newId) {
      const { error: pErr } = await new QueryBuilder('event_participants')
        .insert({ event_id: newId, user_id: sb.getUserId() });
      if(pErr && pErr.code !== '23505') {
        console.warn('Participant-Insert fehlgeschlagen, versuche erneut:', pErr);
        await new QueryBuilder('event_participants')
          .insert({ event_id: newId, user_id: sb.getUserId() });
      }
    }

    PTAnalytics.track('game_created', { mode });
    _fromTds = _createEventFromTds;
    closeCreateEventSheet();
    showToast('Spiel organisiert!');
  }

  // 3. Globalen State neu laden
  await loadEvents();

  // 4. Kommende-Spiele im Table-Detail sofort aktualisieren (nur im TDS-Kontext)
  if (_fromTds && typeof _refreshTableDetailEvents === 'function') {
    _refreshTableDetailEvents(parseInt(tableId));
  }

  // 5. Alle Ansichten neu rendern
  renderEvents();
  renderHome();

  // 6. Karte aktualisieren: Marker-Badges, Liste, offene Preview
  if(mapInit) {
    _refreshMarkerIcons();
    _applyMapFilters();
    if(typeof refreshActiveMapPreview === 'function') refreshActiveMapPreview();
  }
}

// ── Mitspieler-Sheet öffnen (setzt Formular zurück) ──────────────
function openMitspielerSheet() {
  _msFormLat = null; _msFormLng = null; _msFormLabel = '';
  _msGeoItems = [];
  const locInput = document.getElementById('ms-loc-input');
  const locClear = document.getElementById('ms-loc-clear');
  const locDd    = document.getElementById('ms-loc-dropdown');
  const locStat  = document.getElementById('ms-loc-status');
  if (locInput) locInput.value = '';
  if (locClear) locClear.style.display = 'none';
  if (locDd)   { locDd.innerHTML = ''; locDd.classList.remove('open'); }
  if (locStat) locStat.innerHTML = '';
  _msSetSpielart('casual');
  _msSetWann('Heute');
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', 5);
  openSheet('mitspieler-sheet');
}

function _msSetSpielart(val) {
  const hidden = document.getElementById('ms-spielart');
  if (hidden) hidden.value = val;
  document.querySelectorAll('#ms-spielart-chips .ms-spielart-chip').forEach(btn => {
    const on = btn.dataset.spielart === val;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function _msSetWann(val) {
  const hidden = document.getElementById('ms-wann');
  if (hidden) hidden.value = val;
  document.querySelectorAll('#ms-wann-chips .ms-wann-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.wann === val);
  });
}

function _msSliderInput(val) {
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', parseInt(val));
}

function _msSnapRadius(val) {
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', val);
}

// ── Geocoding für Erstell-Formular ────────────────────────────────
function _msSearchInput(val) {
  const clear = document.getElementById('ms-loc-clear');
  if (clear) clear.style.display = val ? '' : 'none';
  clearTimeout(_msGeoTimer);
  const dd = document.getElementById('ms-loc-dropdown');
  if (!dd) return;
  if (val.length < 2) { dd.innerHTML = ''; dd.classList.remove('open'); return; }
  dd.innerHTML = `<div class="search-loading"><div class="search-spinner"></div> Suche läuft…</div>`;
  dd.classList.add('open');
  _msGeoTimer = setTimeout(() => _msRunSearch(val), 350);
}

function _msSearchKey(e) {
  if (e.key === 'Enter' && _msGeoItems.length) { e.preventDefault(); _msSelectPlace(0); }
}

async function _msRunSearch(q) {
  _msGeoItems = [];
  if (_msGeoAbort) _msGeoAbort.abort();
  _msGeoAbort = new AbortController();
  let corrected = null;
  try {
    let items = _geoDedupeItems(await _geoFetch(_geoWildcard(q), _msGeoAbort)).slice(0, 5);
    if (!items.length) {
      corrected = _geoFuzzyCorrect(q);
      if (corrected)
        items = _geoDedupeItems(await _geoFetch(_geoWildcard(corrected), _msGeoAbort)).slice(0, 5);
    }
    _msGeoItems = items;
    if (window.PT_DEBUG || location.hostname === 'localhost')
      console.log('[geo/ms] q=%s wildcard=%s fuzzy=%s results=%d', q, _geoWildcard(q), corrected || '-', items.length);
  } catch(e) { if (e?.name === 'AbortError') return; }
  _msRenderDd(q, corrected);
}

function _msRenderDd(q, corrected) {
  const dd = document.getElementById('ms-loc-dropdown');
  if (!dd) return;
  if (!_msGeoItems.length) {
    dd.innerHTML = `<div class="search-empty">Keine Ergebnisse für „${escHtml(q)}"</div>`;
    dd.classList.add('open');
    return;
  }
  const dispQ = corrected || q;
  const hl = s => {
    try {
      return escHtml(s).replace(
        new RegExp(`(${escHtml(dispQ).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
        '<mark>$1</mark>'
      );
    } catch(_) { return escHtml(s); }
  };
  const hint = corrected
    ? `<div class="geo-hint">Ergebnisse für „${escHtml(corrected)}"</div>` : '';
  dd.innerHTML = hint + _msGeoItems.map((item, i) => `
    <div class="search-dropdown-item" tabindex="0"
         onmousedown="_msSelectPlace(${i})"
         ontouchend="event.preventDefault();_msSelectPlace(${i})"
         onkeydown="if(event.key==='Enter')_msSelectPlace(${i})">
      <div class="sdi-icon place">${ic('pin', 18)}</div>
      <div>
        <div class="sdi-main">${hl(item.label)}</div>
        ${item.sub ? `<div class="sdi-sub">${escHtml(item.sub)}</div>` : ''}
      </div>
    </div>`).join('');
  dd.classList.add('open');
}

function _msSelectPlace(idx) {
  const item = _msGeoItems[idx];
  if (!item) return;
  const dd    = document.getElementById('ms-loc-dropdown');
  const input = document.getElementById('ms-loc-input');
  if (dd)    { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (input) input.value = item.label;
  _msFormLat   = item.lat;
  _msFormLng   = item.lng;
  _msFormLabel = item.label;
  _msUpdateLocStatus();
  clearInlineError('ms-loc-error');
}

function _msClearSearch() {
  const input = document.getElementById('ms-loc-input');
  const clear  = document.getElementById('ms-loc-clear');
  const dd     = document.getElementById('ms-loc-dropdown');
  if (input) input.value = '';
  if (clear) clear.style.display = 'none';
  if (dd)   { dd.innerHTML = ''; dd.classList.remove('open'); }
  _msFormLat = null; _msFormLng = null; _msFormLabel = '';
  _msUpdateLocStatus();
}

function _msUseCurrentLocation() {
  const input = document.getElementById('ms-loc-input');
  const clear  = document.getElementById('ms-loc-clear');
  const dd     = document.getElementById('ms-loc-dropdown');
  if (input) input.value = '';
  if (clear) clear.style.display = 'none';
  if (dd)   { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (typeof userLat !== 'undefined' && userLat && userLng) {
    _msFormLat   = userLat;
    _msFormLng   = userLng;
    _msFormLabel = 'Aktueller Standort';
  } else {
    _msFormLabel = 'Aktueller Standort';
    locateUser();
  }
  _msUpdateLocStatus();
  clearInlineError('ms-loc-error');
}

function _msUpdateLocStatus() {
  const el = document.getElementById('ms-loc-status');
  if (!el) return;
  if (_msFormLabel && (_msFormLat || _msFormLabel === 'Aktueller Standort')) {
    el.innerHTML = `<div class="psr-loc-ok">${ic('pin', 13)} ${escHtml(_msFormLabel)} ausgewählt</div>`;
  } else {
    el.innerHTML = '';
  }
}

async function submitMitspieler() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }

  const btn = document.getElementById('ms-submit-btn');
  if(btn) { btn.disabled = true; btn.textContent = '…'; }

  // Standort aus Formular — bei "Aktueller Standort" GPS-Globals nochmals abfragen
  let lat = _msFormLat;
  let lng = _msFormLng;
  if (_msFormLabel === 'Aktueller Standort' && !lat) {
    lat = (typeof userLat !== 'undefined') ? userLat : null;
    lng = (typeof userLng !== 'undefined') ? userLng : null;
  }

  if (!lat || !lng) {
    showInlineError('ms-loc-error', { title: 'Ort erforderlich', desc: 'Wähle einen Ort aus der Liste oder verwende deinen aktuellen Standort.' });
    document.getElementById('ms-loc-input')?.focus();
    if(btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
    return;
  }
  clearInlineError('ms-loc-error');

  const spielart       = document.getElementById('ms-spielart').value;
  const wann           = document.getElementById('ms-wann').value;
  const searchRadiusKm = parseInt(document.getElementById('ms-umkreis').value) || 5;
  const message        = (document.getElementById('ms-message').value || '').trim();
  const today          = new Date().toISOString().slice(0, 10);
  const title          = (currentUser?.username || 'Spieler') + ' sucht Mitspieler';

  // description enthält nur beschreibende Inhalte — Koordinaten in echten Spalten
  const descJson = JSON.stringify({
    spielart,
    wann,
    umkreis:     `${searchRadiusKm} km`,   // Rückwärtskompatibilität für alte Clients
    message,
    avatarEmoji: currentUser?.avatar_emoji || ''
  });

  const qb = new QueryBuilder('events');
  const {error} = await qb.insert({
    title,
    table_id:         null,
    creator_id:       sb.getUserId(),
    event_date:       today,
    event_time:       '00:00',
    mode:             'player_search',
    max_participants: 2,
    description:      descJson,
    // echte DB-Spalten (nach Migration vorhanden)
    lat,
    lng,
    location_label:   _msFormLabel || '',
    search_radius_km: searchRadiusKm
  });

  if(btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
  if(error) { showToast('Fehler beim Veröffentlichen', 'error'); console.error(error); return; }

  PTAnalytics.track('player_search_created', { radius_km: searchRadiusKm, mode: spielart });
  closeAllSheets();
  showToast('Gesuch veröffentlicht!');
  await loadEvents();
  renderEvents();
  renderHome();
}
