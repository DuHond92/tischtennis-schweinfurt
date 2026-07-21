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
let _msLocationRequestId = 0;

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
      btn.textContent='Dabei';
      showToast('Du nimmst am Event teil!');
    }, 400);
    return;
  }
  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });
  if(error && error.code === '23505') {
    showToast('Du nimmst bereits teil','info');
    btn.textContent='Dabei';
  } else if(error) {
    showToast('Fehler beim Beitreten','error');
    btn.disabled=false; btn.textContent='Dabei';
  } else {
    btn.textContent='Dabei';
    PTAnalytics.track('game_joined');
    showToast('Du nimmst am Event teil!');
    _patchEventParticipantJoin(eventId);
    renderHome();
    renderEvents();
    setTimeout(() => { if (typeof showPushPermissionPrompt === 'function') showPushPermissionPrompt('game_joined'); }, 1500);
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
    <div class="player-search-card${isMySearch ? ' is-own-content' : ''} fade-up" onclick="${cardClick}">
      <!-- 1. Name + Badges -->
      <div class="psc-header">
        <div class="pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="psc-identity">
          <div class="psc-title-row">
            <div class="psc-name pp-clickable" onclick="${profileClick}">${escHtml(ps.username || 'Spieler')}</div>
            ${creatorFloatBadge(isMySearch)}
          </div>
          ${(gameTypePill(ps.spielart) || playerSkillPill(ps.skillLevel))
            ? `<div class="psc-type-row">${gameTypePill(ps.spielart)}${playerSkillPill(ps.skillLevel)}</div>`
            : ''}
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
    default: return '9999-12-31T00:00'; // Zeitlich flexibel / unbekannt → ans Ende
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

function eventCreatorInlineHtml(event) {
  const creator = event.creator || 'Anonym';
  const avatar = getAvatarHtml({
    avatar_url: event.creatorAvatarUrl || null,
    avatar_emoji: event.creatorEmoji || '',
    username: creator
  }, { size: 20, border: '1px solid var(--border)' });
  return `
    <span class="ecb-creator-prefix">von</span>
    <button type="button" class="ecb-creator-profile"
            data-uid="${escAttr(event.creatorId || '')}"
            data-name="${escAttr(creator)}"
            data-emoji="${escAttr(event.creatorEmoji || '')}"
            data-url="${escAttr(event.creatorAvatarUrl || '')}"
            aria-label="Profil von ${escAttr(creator)} öffnen"
            onclick="event.stopPropagation();showPlayerProfile(this.dataset.uid,this.dataset.name,this.dataset.emoji,null,this.dataset.url)">
      ${avatar}<span class="ecb-creator-name">${escHtml(creator)}</span>
    </button>`;
}

function renderEventCard(e, idx = 0) {
  const thumbFallback = e.type === 'punktspiel' ? 'images/placeholders/game_tournament.png'
    : e.type === 'training'  ? 'images/placeholders/game_training.png'
    : 'images/placeholders/game_fun.png';
  const loadAttr = idx < 2 ? 'eager' : 'lazy';
  const hasImage = Boolean(e.photos && e.photos.length);

  // Spielstatus & persönlicher Status
  const status  = getGameDisplayStatus(e);
  const myId    = (typeof sb !== 'undefined' && sb.isLoggedIn()) ? String(sb.getUserId()) : null;
  const isCreator = myId && String(e.creatorId) === myId;
  const isDabei   = myId && Array.isArray(e.participants) && e.participants.some(p => String(p.id) === myId);
  const relationBadge = eventRelationFloatBadge(isCreator, isDabei);

  // Spielort — nur informativ, kein Link
  const locationHtml = `${icPlate(11)} ${escHtml(e.tname || '–')}`;

  return `
  <div class="event-card-big${hasImage ? '' : ' event-card-big--compact'}${isCreator ? ' is-own-content' : ''} fade-up" onclick="showEventDetail(${e.id})">
    ${hasImage ? relationBadge : ''}
    ${hasImage ? `<div class="ecb-img ev-thumb-${e.type||'casual'}">
      <img src="${escAttr(e.photos[0])}" onerror="this.src='${thumbFallback}'" loading="${loadAttr}" decoding="async">
    </div>` : ''}
    <div class="ecb-body">
      ${hasImage
        ? `<div class="ecb-title">${escHtml(e.name)}</div>`
        : `<div class="ecb-title-row"><div class="ecb-title">${escHtml(e.name)}</div>${relationBadge}</div>`}
      <div class="ecb-status-row">
        ${gameTypePill(e.type)}
        ${status ? `<span class="ecb-stag ecb-stag--${status.kind}">${status.text}</span>` : ''}
      </div>
      <div class="ecb-meta-row">
        <span class="ecb-meta-item">${ic('calendar',11)} ${formatEventDate(e)}</span>
        <span class="ecb-meta-item ecb-location">${locationHtml}</span>
      </div>
      <div class="ecb-footer">
        <div class="ecb-creator-inline">${eventCreatorInlineHtml(e)}</div>
        <div class="ecb-participants-row">
          ${participantStack(e.participants, 4, 24, false)}
          <span class="ecb-pcount">${e.p}/${e.max} Spieler</span>
        </div>
      </div>
    </div>
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
  const flexible = ps => ['Zeitlich flexibel', 'Egal'].includes(ps.wann);
  if (currentTimeFilter === 'today')    return src.filter(ps => ['Jetzt','Heute','Heute Abend'].includes(ps.wann) || flexible(ps));
  if (currentTimeFilter === 'tomorrow') return src.filter(ps => ['Morgen','Diese Woche'].includes(ps.wann) || flexible(ps));
  if (currentTimeFilter === 'week')     return src.filter(ps => ['Jetzt','Heute','Heute Abend','Morgen','Diese Woche'].includes(ps.wann) || flexible(ps));
  if (currentTimeFilter === 'weekend')  return src.filter(ps => ps.wann === 'Diese Woche' || flexible(ps));
  if (currentTimeFilter === 'later')    return src.filter(flexible);
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

function _localDateValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _syncEventDateTimeField(input) {
  if (input) input.classList.toggle('is-empty', !input.value);
}

function onEventDateTimeInput(input) {
  if (input?.id === 'ev-date') _syncEventDateMin(input);
  _syncEventDateTimeField(input);
  onCreateEventFieldInput(input);
}

function onCreateEventFieldInput(input) {
  if (input?.id) _setFieldError(input.id, null);
}

function _syncEventDateMin(dateInput = document.getElementById('ev-date')) {
  if (!dateInput) return;
  const today = _localDateValue();
  const originalDate = dateInput.dataset.editOriginalValue || '';
  const keepsExistingPastDate = _editingEventId
    && originalDate
    && originalDate < today
    && dateInput.value === originalDate;
  dateInput.min = keepsExistingPastDate ? originalDate : today;
}

function _prepareEventDateTimeFields() {
  const dateInput = document.getElementById('ev-date');
  const timeInput = document.getElementById('ev-time');
  _syncEventDateMin(dateInput);
  _syncEventDateTimeField(dateInput);
  _syncEventDateTimeField(timeInput);
}

function _isUnchangedEditedEventDateTime(date, time) {
  if (!_editingEventId) return false;
  const dateInput = document.getElementById('ev-date');
  const timeInput = document.getElementById('ev-time');
  return date === (dateInput?.dataset.editOriginalValue || '')
    && time === (timeInput?.dataset.editOriginalValue || '');
}

function _validateEventDateTime(date, time) {
  _setFieldError('ev-date', null);
  _setFieldError('ev-time', null);
  const today = _localDateValue();
  let valid = true;

  if (!date) {
    _setFieldError('ev-date', 'Bitte ein Datum auswählen.');
    valid = false;
  } else if (date < today) {
    _setFieldError('ev-date', 'Das Datum darf nicht in der Vergangenheit liegen.');
    valid = false;
  }

  if (!time) {
    _setFieldError('ev-time', 'Bitte eine Uhrzeit auswählen.');
    valid = false;
  } else if (date === today) {
    const selectedTime = new Date(`${date}T${time}:00`);
    const currentMinute = new Date();
    currentMinute.setSeconds(0, 0);
    if (Number.isNaN(selectedTime.getTime()) || selectedTime.getTime() < currentMinute.getTime()) {
      _setFieldError('ev-time', 'Bitte eine Uhrzeit wählen, die noch nicht vergangen ist.');
      valid = false;
    }
  }

  return valid;
}

function _validateCurrentEventDateTime(date, time) {
  if (date && time && _isUnchangedEditedEventDateTime(date, time)) {
    _setFieldError('ev-date', null);
    _setFieldError('ev-time', null);
    return true;
  }
  return _validateEventDateTime(date, time);
}

function _validateEventRequiredFields(title, tableId) {
  _setFieldError('ev-name', null);
  _setFieldError('ev-table', null);
  let valid = true;
  if (!title) {
    _setFieldError('ev-name', 'Bitte einen Namen für die Spielrunde eingeben.');
    valid = false;
  }
  if (!tableId) {
    _setFieldError('ev-table', 'Bitte wähle eine Platte aus.');
    valid = false;
  }
  return valid;
}

// ── Plattenauswahl für „Spiel organisieren“ ───────────────────────
let _eventTablePickerMap = null;
let _eventTablePickerMapLayer = null;
let _eventTablePickerMarkerCluster = null;
let _eventTablePickerMarkers = [];
let _eventTablePickerUserLayers = [];
let _eventTablePickerSelectedId = null;
let _eventTablePickerMode = 'list';
let _eventTablePickerConfirming = false;
let _eventTablePickerConfirmTimer = null;
let _eventTablePickerVisibleCount = TABLE_LIST_BATCH_SIZE;
let _eventTablePickerResultKey = '';

function _resetEventTablePickerConfirmation() {
  _eventTablePickerConfirming = false;
  if (_eventTablePickerConfirmTimer) {
    clearTimeout(_eventTablePickerConfirmTimer);
    _eventTablePickerConfirmTimer = null;
  }
}

function _eventTableById(tableId) {
  return (selectableEventTables || []).find(table => String(table.id) === String(tableId)) || null;
}

function _setEventTableSelection(tableId, fallbackName = '') {
  const input = document.getElementById('ev-table');
  const value = document.getElementById('ev-table-value');
  const hasSelection = tableId !== null && tableId !== undefined && String(tableId) !== '';
  const table = hasSelection ? _eventTableById(tableId) : null;
  const tableName = table?.name || String(fallbackName || '').trim();
  if (input) {
    input.value = hasSelection ? String(table?.id ?? tableId) : '';
    if (tableName) input.dataset.tableName = tableName;
    else delete input.dataset.tableName;
  }
  if (value) {
    value.textContent = hasSelection ? (tableName || 'Ausgewählte Platte') : 'Bitte Platte auswählen';
    value.classList.toggle('is-placeholder', !hasSelection);
  }
  _setFieldError('ev-table', null);
  if (typeof refreshCreateEventImagePreview === 'function') refreshCreateEventImagePreview();
  if (typeof updateEventWizardSummary === 'function') updateEventWizardSummary();
}

function _eventTableDistance(table) {
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return null;
  return calcDistance(userLat, userLng, table.lat, table.lng);
}

function _eventTablePickerResults() {
  const query = (document.getElementById('event-table-picker-search')?.value || '').trim().toLocaleLowerCase('de');
  const result = (selectableEventTables || []).filter(table => {
    if (!query) return true;
    return `${table.name || ''} ${table.addr || ''}`.toLocaleLowerCase('de').includes(query);
  });

  result.sort((a, b) => {
    const distanceA = _eventTableDistance(a);
    const distanceB = _eventTableDistance(b);
    if (distanceA != null || distanceB != null) return (distanceA ?? Infinity) - (distanceB ?? Infinity);
    if (query) {
      const aStarts = (a.name || '').toLocaleLowerCase('de').startsWith(query) ? 0 : 1;
      const bStarts = (b.name || '').toLocaleLowerCase('de').startsWith(query) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    return (a.name || '').localeCompare(b.name || '', 'de');
  });
  return result;
}

function _eventTablePickerRowHtml(table, index = 0) {
  const selected = String(table.id) === String(_eventTablePickerSelectedId);
  const displayTable = Object.create(table);
  displayTable.distance = _eventTableDistance(table);
  return renderTableListCardHtml(displayTable, {
    mode: 'select',
    eager: index < 3,
    selected,
    metaIdPrefix: 'event-picker-list-meta'
  });
}

function _bindEventTablePickerProgressiveRendering(panel) {
  if (!panel || panel.dataset.progressiveRenderingBound === 'true') return;
  panel.dataset.progressiveRenderingBound = 'true';
  panel.addEventListener('scroll', () => {
    const resultCount = _eventTablePickerResults().length;
    const distanceToEnd = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    if (distanceToEnd >= 240 || _eventTablePickerVisibleCount >= resultCount) return;
    _eventTablePickerVisibleCount = Math.min(
      _eventTablePickerVisibleCount + TABLE_LIST_BATCH_SIZE,
      resultCount
    );
    _renderEventTablePickerList();
  }, { passive: true });
}

function _renderEventTablePickerList({ reset = false } = {}) {
  const list = document.getElementById('event-table-picker-list');
  if (!list) return;
  const panel = document.getElementById('event-table-picker-list-panel');
  _bindEventTablePickerProgressiveRendering(panel);
  const result = _eventTablePickerResults();
  const query = (document.getElementById('event-table-picker-search')?.value || '').trim();
  const resultKey = `${query}\u0000${result.map(table => table.id).join('\u0001')}`;
  if (reset || resultKey !== _eventTablePickerResultKey) {
    _eventTablePickerVisibleCount = TABLE_LIST_BATCH_SIZE;
    if (panel) panel.scrollTop = 0;
  }
  _eventTablePickerResultKey = resultKey;
  const visibleResult = result.slice(0, _eventTablePickerVisibleCount);
  list.innerHTML = result.length
    ? visibleResult.map((table, index) => _eventTablePickerRowHtml(table, index)).join('')
    : '<div class="event-table-picker-empty">Keine Platte zu dieser Suche gefunden.</div>';
  visibleResult.forEach(table => {
    if (table.ratingAvg === undefined) {
      _loadListMeta(table.id, `event-picker-list-meta-${table.id}`);
    }
  });
}

function _renderEventTablePickerMarkers(fitMap = false) {
  if (!_eventTablePickerMap) return;
  if (!_eventTablePickerMarkerCluster) {
    _eventTablePickerMarkerCluster = _createTableMarkerClusterGroup().addTo(_eventTablePickerMap);
  }
  _eventTablePickerMarkerCluster.clearLayers();
  _eventTablePickerMarkers = [];

  const points = [];
  _eventTablePickerResults().forEach(table => {
    if (!Number.isFinite(Number(table.lat)) || !Number.isFinite(Number(table.lng))) return;
    const selected = String(table.id) === String(_eventTablePickerSelectedId);
    const marker = L.marker([Number(table.lat), Number(table.lng)], {
      icon: _makeMarkerIcon(table, selected),
      keyboard: true,
      title: table.name || 'Tischtennisplatte'
    });
    marker.on('click', () => selectEventTablePickerMarker(table.id));
    _eventTablePickerMarkerCluster.addLayer(marker);
    _eventTablePickerMarkers.push({ tableId: table.id, marker });
    points.push([Number(table.lat), Number(table.lng)]);
  });

  if (fitMap && points.length) {
    if (points.length === 1) _eventTablePickerMap.setView(points[0], 15, { animate: false });
    else _eventTablePickerMap.fitBounds(points, { padding: [32, 32], maxZoom: 15, animate: false });
  }
}

function _showEventTablePickerPreview(tableId) {
  const preview = document.getElementById('event-table-picker-preview');
  const panel = document.getElementById('event-table-picker-map-panel');
  const table = _eventTableById(tableId);
  if (!preview) return;
  if (!table) {
    preview.innerHTML = '';
    preview.classList.remove('is-visible');
    panel?.classList.remove('has-fp');
    return;
  }
  const displayTable = Object.create(table);
  displayTable.distance = _eventTableDistance(table);
  renderMapPreviewCard({
    container: preview,
    table: displayTable,
    metaId: `event-picker-meta-${table.id}`,
    onActivate: () => confirmEventTableSelection(table.id),
    onClose: _eventTablePickerConfirming ? null : () => clearEventTablePickerPreview(),
    selected: _eventTablePickerConfirming && String(table.id) === String(_eventTablePickerSelectedId)
  });
  preview.classList.add('is-visible');
  panel?.classList.add('has-fp');
}

function clearEventTablePickerPreview() {
  _eventTablePickerSelectedId = null;
  _showEventTablePickerPreview(null);
  _renderEventTablePickerMarkers(false);
  _renderEventTablePickerList();
}

function selectEventTablePickerMarker(tableId) {
  _eventTablePickerSelectedId = String(tableId);
  // Marker-Tap ist bereits eine gültige Auswahl. Die Kartenansicht bleibt offen,
  // damit der Nutzer noch vergleichen kann; Zurück übernimmt diesen Stand.
  _setEventTableSelection(tableId);
  _eventTablePickerMarkers.forEach(({ tableId: id, marker }) => {
    const table = _eventTableById(id);
    if (table) marker.setIcon(_makeMarkerIcon(table, String(id) === String(tableId)));
  });
  _eventTablePickerMarkerCluster?.refreshClusters?.();
  _showEventTablePickerPreview(tableId);
  _renderEventTablePickerList();
  const table = _eventTableById(tableId);
  if (_eventTablePickerMap && table) {
    _eventTablePickerMap.setView([Number(table.lat), Number(table.lng)], 16, { animate: true });
    setTimeout(() => {
      if (String(_eventTablePickerSelectedId) === String(tableId)) {
        _eventTablePickerMap?.panBy([0, 72], { animate: true });
      }
    }, 380);
  }
}

function _renderEventTablePickerUserLocation(center = false) {
  if (!_eventTablePickerMap || !Number.isFinite(userLat) || !Number.isFinite(userLng)) return;
  _eventTablePickerUserLayers.forEach(layer => layer.remove());
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  _eventTablePickerUserLayers = [
    L.circle([userLat, userLng], {
      radius: 80, color: primaryColor, fillColor: primaryColor, fillOpacity: .08, weight: 1
    }).addTo(_eventTablePickerMap),
    L.marker([userLat, userLng], {
      icon: L.divIcon({ className: '', html: '<div class="event-table-picker-user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      keyboard: false
    }).addTo(_eventTablePickerMap)
  ];
  if (center) _eventTablePickerMap.setView([userLat, userLng], 14, { animate: true });
}

function _initEventTablePickerMap() {
  if (_eventTablePickerMap || typeof L === 'undefined') return;
  _eventTablePickerMap = L.map('event-table-picker-map', {
    center: [50.0490, 10.2310], zoom: 13, maxZoom: 19, zoomControl: false
  });
  _eventTablePickerMapLayer = L.maplibreGL({
    style: _currentMapStyle(), attribution: _MAP_ATTR
  }).addTo(_eventTablePickerMap);
  _eventTablePickerMap.attributionControl.setPrefix(false);
  _eventTablePickerMap.on('click', () => {
    if (_eventTablePickerSelectedId && !_eventTablePickerConfirming) clearEventTablePickerPreview();
  });
  _renderEventTablePickerMarkers(true);
  _renderEventTablePickerUserLocation(false);
}

function setEventTablePickerMode(mode) {
  _eventTablePickerMode = mode === 'map' ? 'map' : 'list';
  const mapActive = _eventTablePickerMode === 'map';
  const mapTab = document.getElementById('event-table-picker-map-tab');
  const listTab = document.getElementById('event-table-picker-list-tab');
  const mapPanel = document.getElementById('event-table-picker-map-panel');
  const listPanel = document.getElementById('event-table-picker-list-panel');
  mapTab?.setAttribute('aria-selected', mapActive ? 'true' : 'false');
  listTab?.setAttribute('aria-selected', mapActive ? 'false' : 'true');
  if (mapTab) mapTab.tabIndex = mapActive ? 0 : -1;
  if (listTab) listTab.tabIndex = mapActive ? -1 : 0;
  if (mapPanel) mapPanel.hidden = !mapActive;
  if (listPanel) listPanel.hidden = mapActive;
  if (mapActive) {
    requestAnimationFrame(() => {
      _initEventTablePickerMap();
      _eventTablePickerMapLayer?.getMaplibreMap()?.setStyle(_currentMapStyle());
      _eventTablePickerMap?.invalidateSize();
      _renderEventTablePickerMarkers(false);
      _renderEventTablePickerUserLocation(false);
    });
  } else {
    _renderEventTablePickerList();
  }
}

function onEventTablePickerSearch() {
  _renderEventTablePickerList({ reset: true });
  _renderEventTablePickerMarkers(false);
  const selectedIsVisible = _eventTablePickerSelectedId &&
    _eventTablePickerResults().some(t => String(t.id) === String(_eventTablePickerSelectedId));
  _showEventTablePickerPreview(selectedIsVisible ? _eventTablePickerSelectedId : null);
}

function _refreshEventTablePickerTheme() {
  _eventTablePickerMapLayer?.getMaplibreMap()?.setStyle(_currentMapStyle());
  _renderEventTablePickerUserLocation(false);
}

function openEventTablePicker(mode = 'list', focusSearch = false) {
  _resetEventTablePickerConfirmation();
  _eventTablePickerSelectedId = document.getElementById('ev-table')?.value || null;
  const search = document.getElementById('event-table-picker-search');
  if (search) search.value = '';
  _renderEventTablePickerList({ reset: true });
  _showEventTablePickerPreview(_eventTablePickerSelectedId);
  openSubSheet('event-table-picker-sheet');
  setEventTablePickerMode(mode);
  if (focusSearch) requestAnimationFrame(() => search?.focus());
}

function closeEventTablePicker() {
  _resetEventTablePickerConfirmation();
  closeSubSheet();
  document.getElementById('ev-table-trigger')?.focus({ preventScroll: true });
}

function confirmEventTableSelection(tableId) {
  if (_eventTablePickerConfirming || !_eventTableById(tableId)) return;
  _eventTablePickerConfirming = true;
  _eventTablePickerSelectedId = String(tableId);
  _setEventTableSelection(tableId);
  _showEventTablePickerPreview(tableId);
  showToast('Platte ausgewählt');
  _eventTablePickerConfirmTimer = setTimeout(() => {
    _eventTablePickerConfirmTimer = null;
    if (_openSubSheetId === 'event-table-picker-sheet') closeEventTablePicker();
  }, 180);
}

function locateEventTablePicker() {
  if (!navigator.geolocation) {
    showSnackbar({ title: 'Standort nicht verfügbar', message: 'Dein Gerät unterstützt keine Standortfunktion.', type: 'warning' });
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    _renderEventTablePickerUserLocation(true);
    _renderEventTablePickerList();
    _showEventTablePickerPreview(_eventTablePickerSelectedId);
    showToast('Standort gefunden!');
  }, err => {
    showSnackbar({
      title: err.code === 1 ? 'Standort gesperrt' : 'Standort nicht verfügbar',
      message: err.code === 1
        ? 'Erlaube den Standortzugriff in den Einstellungen oder nutze die Suche.'
        : 'Nutze stattdessen die Suche oder die alphabetisch sortierte Liste.',
      type: err.code === 1 ? 'info' : 'warning'
    });
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function _setSpielartSelection(inputId, chipsId, value) {
  const hidden = document.getElementById(inputId);
  if (hidden) hidden.value = value;
  document.querySelectorAll(`#${chipsId} .ms-spielart-chip`).forEach(btn => {
    const selected = btn.dataset.spielart === value;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function _setEventMode(value) {
  _setSpielartSelection('ev-mode', 'ev-mode-chips', value);
  updateEventWizardSummary();
}

// ── 3-Schritt-Wizard „Spiel organisieren“ ─────────────────────────
let _eventWizardStep = 1;
let _createEventImageFile = null;
let _createEventImagePreviewUrl = '';
let _createEventExistingImageUrl = '';

function _setEventWizardStep(step, direction = 'forward') {
  const nextStep = Math.max(1, Math.min(3, Number(step) || 1));
  _eventWizardStep = nextStep;
  document.querySelectorAll('.event-wizard-step').forEach(section => {
    const active = section.id === `event-wizard-step-${nextStep}`;
    section.hidden = !active;
    section.classList.toggle('is-active', active);
    section.classList.remove('enter-forward', 'enter-back');
    if (active && direction !== 'none') {
      section.classList.add(direction === 'back' ? 'enter-back' : 'enter-forward');
    }
  });

  const progressLabel = document.getElementById('event-wizard-progress-label');
  const progress = document.getElementById('event-wizard-progressbar');
  const fill = document.getElementById('event-wizard-progress-fill');
  if (progressLabel) progressLabel.textContent = `Schritt ${nextStep} von 3`;
  if (progress) progress.setAttribute('aria-valuenow', String(nextStep));
  if (fill) fill.style.width = `${nextStep / 3 * 100}%`;

  const back = document.getElementById('event-wizard-back-btn');
  const next = document.getElementById('event-wizard-next-btn');
  const submit = document.getElementById('create-event-submit-btn');
  if (back) back.hidden = nextStep === 1;
  if (next) {
    next.hidden = nextStep === 3;
    next.textContent = nextStep === 1 ? 'Weiter' : 'Weiter →';
  }
  if (submit) submit.hidden = nextStep !== 3;

  if (nextStep === 3) {
    refreshCreateEventImagePreview();
    updateEventWizardSummary();
  }
  const scroll = document.getElementById('event-wizard-scroll');
  if (scroll) scroll.scrollTo({ top: 0, behavior: 'auto' });
}

function _validateEventMaxParticipants() {
  const input = document.getElementById('ev-max');
  const value = Number(input?.value);
  _setFieldError('ev-max', null);
  if (!Number.isInteger(value) || value < 2 || value > 100) {
    _setFieldError('ev-max', 'Bitte wähle eine Teilnehmerzahl zwischen 2 und 100.');
    return false;
  }
  return true;
}

function eventWizardNext() {
  if (_eventWizardStep === 1) {
    const title = document.getElementById('ev-name')?.value.trim() || '';
    const tableId = document.getElementById('ev-table')?.value || '';
    if (!_validateEventRequiredFields(title, tableId)) {
      if (!title) document.getElementById('ev-name')?.focus();
      else document.getElementById('ev-table-trigger')?.focus();
      return;
    }
    _setEventWizardStep(2, 'forward');
    return;
  }
  if (_eventWizardStep === 2) {
    const date = document.getElementById('ev-date')?.value || '';
    const time = document.getElementById('ev-time')?.value || '';
    const dateTimeValid = _validateCurrentEventDateTime(date, time);
    const maxValid = _validateEventMaxParticipants();
    if (!dateTimeValid || !maxValid) {
      if (!date || date < _localDateValue()) document.getElementById('ev-date')?.focus();
      else if (!dateTimeValid) document.getElementById('ev-time')?.focus();
      else document.getElementById('ev-max')?.focus();
      return;
    }
    _setEventWizardStep(3, 'forward');
  }
}

function eventWizardBack() {
  if (_eventWizardStep > 1) _setEventWizardStep(_eventWizardStep - 1, 'back');
}

function handleCreateEventBack() {
  if (_eventWizardStep > 1) eventWizardBack();
  else closeCreateEventSheet();
}

function requestCancelCreateEvent() {
  const editing = !!_editingEventId;
  showConfirmDialog({
    title: editing ? 'Bearbeitung abbrechen?' : 'Spielerstellung abbrechen?',
    body: editing
      ? 'Deine nicht gespeicherten Änderungen gehen verloren.'
      : 'Deine bisherigen Eingaben gehen verloren.',
    confirmLabel: 'Ja, abbrechen',
    cancelLabel: 'Weiter bearbeiten',
    danger: true,
    onConfirm: () => {
      _resetCreateEventForm();
      closeCreateEventSheet();
    }
  });
}

function _formatEventWizardDate(dateValue, timeValue) {
  if (!dateValue) return 'Noch nicht gewählt';
  const date = new Date(`${dateValue}T12:00:00`);
  const formatted = Number.isNaN(date.getTime())
    ? dateValue
    : new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  return timeValue ? `${formatted}, ${timeValue} Uhr` : formatted;
}

function updateEventWizardSummary() {
  const summary = document.getElementById('event-wizard-summary');
  if (!summary) return;
  const tableInput = document.getElementById('ev-table');
  const table = _eventTableById(tableInput?.value);
  const modeLabels = { casual: 'Just 4 Fun', training: 'Training', punktspiel: 'Punktspiel' };
  const rows = [
    ['Spielname', document.getElementById('ev-name')?.value.trim() || '–'],
    ['Platte', table?.name || tableInput?.dataset.tableName || '–'],
    ['Zeitpunkt', _formatEventWizardDate(document.getElementById('ev-date')?.value, document.getElementById('ev-time')?.value)],
    ['Spielart', modeLabels[document.getElementById('ev-mode')?.value] || '–'],
    ['Teilnehmer', `Max. ${document.getElementById('ev-max')?.value || '–'}`]
  ];
  summary.innerHTML = rows.map(([label, value]) => `<div><dt>${escHtml(label)}</dt><dd>${escHtml(value)}</dd></div>`).join('');
}

function handleCreateEventImageSelect(input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';
  handleCreateEventImageFile(file);
}

async function openCreateEventPhotoLibrary() {
  const file = await pickImageFromPhotoLibrary('event-create-image-input');
  if (file) handleCreateEventImageFile(file);
}

function handleCreateEventImageFile(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    showToast('Bitte wähle eine Bilddatei aus.', 'warning');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast('Das Bild ist zu groß. Bitte wähle ein Bild unter 15 MB.', 'warning');
    return;
  }
  _createEventImageFile = file;
  const reader = new FileReader();
  reader.onload = event => {
    if (_createEventImageFile !== file) return;
    _createEventImagePreviewUrl = event.target?.result || '';
    refreshCreateEventImagePreview();
  };
  reader.onerror = () => showToast('Das Bild konnte nicht gelesen werden.', 'error');
  reader.readAsDataURL(file);
}

function removeCreateEventImage() {
  _createEventImageFile = null;
  _createEventImagePreviewUrl = '';
  refreshCreateEventImagePreview();
}

function refreshCreateEventImagePreview() {
  const preview = document.getElementById('event-create-image-preview');
  const image = document.getElementById('event-create-image');
  const source = document.getElementById('event-create-image-source');
  const remove = document.getElementById('event-create-image-remove');
  const addLabel = document.getElementById('event-create-image-add-label');
  const hint = document.getElementById('event-create-image-hint');
  if (!preview || !image) return;

  const table = _eventTableById(document.getElementById('ev-table')?.value);
  const tableImage = table?.photos?.[0] || '';
  const imageUrl = _createEventImagePreviewUrl || _createEventExistingImageUrl || tableImage;
  const custom = !!_createEventImageFile;
  preview.hidden = !imageUrl;
  if (imageUrl) image.src = imageUrl;
  if (source) source.textContent = custom
    ? 'Eigenes Spielbild'
    : (_createEventExistingImageUrl ? 'Aktuelles Spielbild' : 'Bild der ausgewählten Platte');
  if (remove) remove.hidden = !custom;
  if (addLabel) addLabel.textContent = (custom || _createEventExistingImageUrl)
    ? 'Anderes Bild auswählen'
    : (tableImage ? 'Eigenes Spielbild auswählen' : 'Spielbild hinzufügen');
  if (hint) hint.textContent = custom
    ? 'Dein eigenes Bild ersetzt das Plattenbild für dieses Spiel.'
    : (_createEventExistingImageUrl
      ? 'Das vorhandene Spielbild bleibt unverändert, solange du kein neues auswählst.'
      : tableImage
      ? 'Ohne eigenes Bild wird das Bild der ausgewählten Platte verwendet.'
      : 'Ohne eigenes Bild wird das Spiel ohne Headerbild angezeigt.');
}

function _resetCreateEventImage() {
  _createEventImageFile = null;
  _createEventImagePreviewUrl = '';
  _createEventExistingImageUrl = '';
  const input = document.getElementById('event-create-image-input');
  if (input) input.value = '';
  refreshCreateEventImagePreview();
}

function _setExistingCreateEventImage(imageUrl) {
  _createEventExistingImageUrl = imageUrl || '';
  refreshCreateEventImagePreview();
}

function _resetCreateEventForm(titleText = 'Spiel organisieren', btnText = 'Spiel veröffentlichen') {
  _editingEventId = null;
  const titleEl = document.getElementById('create-event-sheet-title');
  if (titleEl) titleEl.textContent = titleText;
  const submitBtn = document.getElementById('create-event-submit-btn');
  if (submitBtn) { submitBtn.textContent = btnText; submitBtn.disabled = false; }
  document.getElementById('ev-name').value  = '';
  const dateInput = document.getElementById('ev-date');
  const timeInput = document.getElementById('ev-time');
  dateInput.value = '';
  timeInput.value = '';
  delete dateInput.dataset.editOriginalValue;
  delete timeInput.dataset.editOriginalValue;
  _setEventTableSelection(null);
  _setEventMode('casual');
  const evMax = document.getElementById('ev-max');
  if (evMax) evMax.value = '4';
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = '';
  _resetCreateEventImage();
  _setFieldError('ev-name', null);
  _setFieldError('ev-table', null);
  _setFieldError('ev-date', null);
  _setFieldError('ev-time', null);
  _setFieldError('ev-max', null);
  _prepareEventDateTimeFields();
  _setEventWizardStep(1, 'none');
}

// Öffnet "Spiel erstellen" als eigenständige Unterseite der Platten-Detailansicht.
function openCreateEventSheetFromTds(tableId) {
  _createEventFromTds = true;
  _createEventReturnToChoice = false;
  _resetCreateEventForm();
  PTAnalytics.track('game_create_started', { source: 'tds' });
  _setEventTableSelection(tableId);
  openTdsSubpage('create-event-sheet');
}

// Schließt "Spiel erstellen" und kehrt zum Ausgangspunkt zurück.
function closeCreateEventSheet(returnToOrigin = true) {
  if (_createEventFromTds) {
    _createEventFromTds = false;
    closeTdsSubpage('create-event-sheet');
  } else if (returnToOrigin && _createEventReturnToChoice) {
    _createEventReturnToChoice = false;
    openSheet('create-choice-sheet');
  } else {
    _createEventReturnToChoice = false;
    closeAllSheets();
  }
}

function openCreateEventSheet() {
  _createEventFromTds = false;
  _createEventReturnToChoice = openSheetId === 'create-choice-sheet';
  closeAllSheets();
  _resetCreateEventForm();
  PTAnalytics.track('game_create_started');
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
  const requiredFieldsValid = _validateEventRequiredFields(title, tableId);
  const dateTimeValid = _validateCurrentEventDateTime(date, time);
  const maxValid = _validateEventMaxParticipants();
  if (!requiredFieldsValid || !dateTimeValid || !maxValid) {
    if (!requiredFieldsValid) {
      _setEventWizardStep(1, 'back');
      requestAnimationFrame(() => (!title ? document.getElementById('ev-name') : document.getElementById('ev-table-trigger'))?.focus());
    } else {
      _setEventWizardStep(2, 'back');
      requestAnimationFrame(() => {
        if (!date || date < _localDateValue()) document.getElementById('ev-date')?.focus();
        else if (!dateTimeValid) document.getElementById('ev-time')?.focus();
        else document.getElementById('ev-max')?.focus();
      });
    }
    return;
  }

  let _fromTds = false;
  let savedEventId = _editingEventId || null;
  let imageUploadFailed = false;
  const editing = !!_editingEventId;
  const originalTableId = editing
    ? allEvents.find(event => String(event.id) === String(savedEventId))?.tid ?? null
    : null;
  const submitBtn = document.getElementById('create-event-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = editing ? 'Wird gespeichert…' : 'Wird veröffentlicht…';
  }

  if(editing) {
    const { error } = await new QueryBuilder('events').eq('id', savedEventId).update({
      title, table_id: parseInt(tableId), event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Änderungen speichern'; }
      showToast('Fehler beim Speichern','error'); console.error(error); return;
    }
  } else {
    // 1. Event anlegen
    const { data: inserted, error } = await new QueryBuilder('events').insert({
      title, table_id: parseInt(tableId),
      creator_id: sb.getUserId(),
      event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Spiel veröffentlichen'; }
      showToast('Fehler beim Erstellen','error'); console.error(error); return;
    }

    // 2. Ersteller sofort als Teilnehmer eintragen
    savedEventId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if(savedEventId) {
      const { error: pErr } = await new QueryBuilder('event_participants')
        .insert({ event_id: savedEventId, user_id: sb.getUserId() });
      if(pErr && pErr.code !== '23505') {
        console.warn('Participant-Insert fehlgeschlagen, versuche erneut:', pErr);
        await new QueryBuilder('event_participants')
          .insert({ event_id: savedEventId, user_id: sb.getUserId() });
      }
    }
  }

  // 3. Optionales eigenes Spielbild nutzt denselben Upload wie die Detailansicht.
  if (_createEventImageFile) {
    if (!savedEventId) {
      imageUploadFailed = true;
    } else {
      try {
        await uploadEventImageFile(_createEventImageFile, savedEventId);
      } catch (error) {
        imageUploadFailed = true;
        console.error('Event image upload error:', error);
      }
    }
  }

  _fromTds = _createEventFromTds;
  if (editing) {
    _editingEventId = null;
    closeAllSheets();
  } else {
    PTAnalytics.track('game_created', { mode });
    closeCreateEventSheet(false);
    setTimeout(() => { if (typeof showPushPermissionPrompt === 'function') showPushPermissionPrompt('game_created'); }, 1500);
  }
  showToast(
    imageUploadFailed
      ? 'Spiel gespeichert, das Bild konnte jedoch nicht hochgeladen werden.'
      : (editing ? 'Änderungen gespeichert!' : 'Spiel veröffentlicht!'),
    imageUploadFailed ? 'warning' : 'success'
  );
  _resetCreateEventImage();

  // 4. Globalen State neu laden
  await loadEvents();

  // 5. Betroffene Platten-Details aktualisieren. Bei einem Wechsel gehören alte
  // und neue Platte dazu; die Render-Funktion aktualisiert nur das aktuell geladene Detail.
  if (typeof _refreshTableDetailEvents === 'function') {
    const affectedTableIds = new Set();
    if (_fromTds || editing) affectedTableIds.add(Number(tableId));
    if (editing && originalTableId != null) affectedTableIds.add(Number(originalTableId));
    affectedTableIds.forEach(affectedTableId => _refreshTableDetailEvents(affectedTableId));
  }

  // 6. Alle Ansichten neu rendern
  renderEvents();
  renderHome();

  // 7. Karte aktualisieren: Marker-Badges, Liste, offene Preview
  if(mapInit) {
    _refreshMarkerIcons();
    _applyMapFilters();
    if(typeof refreshActiveMapPreview === 'function') refreshActiveMapPreview();
  }
}

// ── Mitspieler-Sheet öffnen (setzt Formular zurück) ──────────────
function openMitspielerSheet() {
  _msLocationRequestId++;
  _mitspielerReturnToChoice = openSheetId === 'create-choice-sheet';
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
  const message = document.getElementById('ms-message');
  const submit  = document.getElementById('ms-submit-btn');
  const locationButton = document.getElementById('ms-current-location-btn');
  if (message) message.value = '';
  if (submit) { submit.disabled = false; submit.textContent = 'Veröffentlichen'; }
  if (locationButton) locationButton.disabled = false;
  clearInlineError('ms-loc-error');
  _msSetSpielart('casual');
  _msSetWann('Heute');
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', 5);
  _msSetRadiusEnabled(false);
  openSheet('mitspieler-sheet');
}

function closeMitspielerSheet() {
  if (_mitspielerReturnToChoice) {
    _mitspielerReturnToChoice = false;
    openSheet('create-choice-sheet');
  } else {
    closeAllSheets();
  }
}

function _isMitspielerFormDirty() {
  const locationValue = document.getElementById('ms-loc-input')?.value.trim() || '';
  const message = document.getElementById('ms-message')?.value.trim() || '';
  const spielart = document.getElementById('ms-spielart')?.value || 'casual';
  const wann = document.getElementById('ms-wann')?.value || 'Heute';
  const radius = parseInt(document.getElementById('ms-umkreis')?.value, 10) || 5;
  return !!(locationValue || _msFormLabel || message || spielart !== 'casual' || wann !== 'Heute' || radius !== 5);
}

function requestCancelMitspieler() {
  const discard = () => {
    _mitspielerReturnToChoice = false;
    closeAllSheets();
  };
  if (!_isMitspielerFormDirty()) {
    discard();
    return;
  }
  showConfirmDialog({
    title: 'Erstellung abbrechen?',
    body: 'Deine bisherigen Eingaben gehen verloren.',
    confirmLabel: 'Ja, abbrechen',
    cancelLabel: 'Weiter bearbeiten',
    danger: true,
    onConfirm: discard
  });
}

function _msSetSpielart(val) {
  _setSpielartSelection('ms-spielart', 'ms-spielart-chips', val);
  const message = document.getElementById('ms-message');
  if (!message) return;
  const placeholders = {
    casual: 'z. B. Lust auf eine lockere Runde Ping Pong am Nachmittag …',
    training: 'z. B. Ich möchte meine Rückhand üben und freue mich über Tipps …',
    punktspiel: 'z. B. Suche jemanden für ein Punktspiel auf ähnlichem Niveau …'
  };
  message.placeholder = placeholders[val] || placeholders.casual;
}

function _msSetWann(val) {
  const hidden = document.getElementById('ms-wann');
  if (hidden) hidden.value = val;
  document.querySelectorAll('#ms-wann-chips .ms-wann-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.wann === val);
  });
}

function _msSliderInput(val) {
  const radius = parseInt(val, 10);
  const snapValues = [1, 5, 10, 15, 25];
  const snapped = snapValues.reduce((closest, candidate) =>
    Math.abs(candidate - radius) < Math.abs(closest - radius) ? candidate : closest
  );
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', snapped);
}

function _msSnapRadius(val) {
  _radiusSliderUpdate('ms-umkreis', 'ms-radius-display', val);
}

function _msSetRadiusEnabled(enabled) {
  const block = document.getElementById('ms-radius-block');
  const slider = document.getElementById('ms-umkreis');
  if (block) {
    block.classList.toggle('is-disabled', !enabled);
    block.setAttribute('aria-disabled', String(!enabled));
  }
  if (slider) slider.disabled = !enabled;
  block?.querySelectorAll('.radius-snap-btn').forEach(btn => { btn.disabled = !enabled; });
}

// ── Geocoding für Erstell-Formular ────────────────────────────────
function _msSearchInput(val) {
  const clear = document.getElementById('ms-loc-clear');
  if (clear) clear.style.display = val ? '' : 'none';
  clearInlineError('ms-loc-error');
  if (_msFormLabel && val.trim() !== _msFormLabel) {
    _msFormLat = null; _msFormLng = null; _msFormLabel = '';
    _msUpdateLocStatus();
    _msSetRadiusEnabled(false);
  }
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
  _msSetRadiusEnabled(true);
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
  _msSetRadiusEnabled(false);
  clearInlineError('ms-loc-error');
}

function _msUseCurrentLocation() {
  const input = document.getElementById('ms-loc-input');
  const clear  = document.getElementById('ms-loc-clear');
  const dd     = document.getElementById('ms-loc-dropdown');
  if (input) input.value = '';
  if (clear) clear.style.display = 'none';
  if (dd)   { dd.innerHTML = ''; dd.classList.remove('open'); }
  if (typeof userLat !== 'undefined' && Number.isFinite(userLat) && Number.isFinite(userLng)) {
    _msFormLat   = userLat;
    _msFormLng   = userLng;
    _msFormLabel = 'Aktueller Standort';
    _msUpdateLocStatus();
    _msSetRadiusEnabled(true);
    clearInlineError('ms-loc-error');
    return;
  }

  _msFormLat = null; _msFormLng = null; _msFormLabel = '';
  _msSetRadiusEnabled(false);
  if (!navigator.geolocation) {
    _msUpdateLocStatus();
    showInlineError('ms-loc-error', { title: 'Standort nicht verfügbar', desc: 'Bitte wähle stattdessen einen Ort über die Suche aus.' });
    return;
  }

  const button = document.getElementById('ms-current-location-btn');
  const requestId = ++_msLocationRequestId;
  if (button) button.disabled = true;
  _msUpdateLocStatus(true);
  clearInlineError('ms-loc-error');
  navigator.geolocation.getCurrentPosition(position => {
    if (requestId !== _msLocationRequestId) return;
    userLat = position.coords.latitude;
    userLng = position.coords.longitude;
    _msFormLat = userLat;
    _msFormLng = userLng;
    _msFormLabel = 'Aktueller Standort';
    if (button) button.disabled = false;
    _msUpdateLocStatus();
    _msSetRadiusEnabled(true);
  }, error => {
    if (requestId !== _msLocationRequestId) return;
    if (button) button.disabled = false;
    _msUpdateLocStatus();
    const denied = error?.code === 1;
    showInlineError('ms-loc-error', {
      title: denied ? 'Standortzugriff nicht erlaubt' : 'Standort nicht verfügbar',
      desc: denied
        ? 'Erlaube den Standortzugriff in den Geräteeinstellungen oder wähle einen Ort über die Suche aus.'
        : 'Bitte versuche es erneut oder wähle einen Ort über die Suche aus.'
    });
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function _msUpdateLocStatus(loading = false) {
  const el = document.getElementById('ms-loc-status');
  if (!el) return;
  if (loading) {
    el.innerHTML = '<div class="psr-loc-pending"><span class="search-spinner" aria-hidden="true"></span> Standort wird ermittelt …</div>';
  } else if (_msFormLabel && Number.isFinite(_msFormLat) && Number.isFinite(_msFormLng)) {
    el.innerHTML = `<div class="psr-loc-ok">${ic('check', 13)} ${escHtml(_msFormLabel)} ausgewählt</div>`;
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
  if (_msFormLabel === 'Aktueller Standort' && !Number.isFinite(lat)) {
    lat = (typeof userLat !== 'undefined') ? userLat : null;
    lng = (typeof userLng !== 'undefined') ? userLng : null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
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
