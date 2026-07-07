// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENTS                                             ║
// ╚══════════════════════════════════════════════════════════════╝
let _psCollapsed       = false;
let _gamesCollapsed    = false;
let _eventsRadiusActive = false;
// ── Radius / Suchzentrum – State ──────────────────────────────────
let _psRadius      = parseInt(localStorage.getItem('tt_ps_radius') || '5');
let _psSearchLat   = parseFloat(localStorage.getItem('tt_ps_lat')  || '') || null;
let _psSearchLng   = parseFloat(localStorage.getItem('tt_ps_lng')  || '') || null;
let _psSearchLabel = localStorage.getItem('tt_ps_label') || '';
let _psSearchType  = localStorage.getItem('tt_ps_type')  || ''; // 'manual_place' | 'current_location' | ''

let _psGeoTimer = null, _psGeoAbort = null;
let _psGeoItems = [];

// ── Standort-State für das Erstell-Formular (getrennt vom Filter) ─
let _msFormLat = null, _msFormLng = null, _msFormLabel = '';
let _msGeoTimer = null, _msGeoAbort = null, _msGeoItems = [];

// Liefert das aktive Suchzentrum (manuell oder GPS)
function _psCenter() {
  if (_psSearchLat && _psSearchLng) return { lat: _psSearchLat, lng: _psSearchLng };
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
  if (!c) return { list: src, filteredOut: 0, noLocation: true };

  const withCoords    = src.filter(ps => ps.lat != null && ps.lng != null);
  const withoutCoords = src.filter(ps => ps.lat == null || ps.lng == null);
  const inRadius      = withCoords.filter(ps => (_psDist(ps) || Infinity) <= _psRadius * 1000);

  inRadius.sort((a, b) => (_psDist(a) || 0) - (_psDist(b) || 0));

  // Wenn Zentrum aktiv: NUR Gesuche im Radius zeigen — ortslose Gesuche ausschließen
  return {
    list: inRadius,
    filteredOut: withCoords.length - inRadius.length,
    noCoords: withoutCoords.length,
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

  document.querySelectorAll('.radius-chip').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.km) === _psRadius);
  });
  const v = document.getElementById('psr-validation');
  if (v) v.style.display = 'none';

  openSheet('ps-radius-sheet');
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
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=6` +
      `&addressdetails=1&countrycodes=de&accept-language=de` +
      `&viewbox=9.8,50.25,10.75,49.85&bounded=0` +
      `&email=kontakt%40plattentreff.app`;
    const res = await fetch(url, {
      signal: _psGeoAbort.signal,
      headers: { 'Accept-Language': 'de' }
    });
    const geo = (await res.json()).slice(0, 5);
    _psGeoItems = geo.map(r => ({
      lat:   parseFloat(r.lat),
      lng:   parseFloat(r.lon),
      label: r.name || r.display_name.split(',')[0],
      sub:   r.display_name.split(',').slice(1, 3).join(',').trim()
    }));
  } catch(e) { if (e?.name === 'AbortError') return; }
  _psRenderDd(q);
}

function _psRenderDd(q) {
  const dd = document.getElementById('psr-dropdown');
  if (!dd) return;
  if (!_psGeoItems.length) {
    dd.innerHTML = `<div class="search-empty">Keine Ergebnisse für „${escHtml(q)}"</div>`;
    dd.classList.add('open');
    return;
  }
  const hl = s => {
    if (!q) return escHtml(s);
    return escHtml(s).replace(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
      '<mark>$1</mark>'
    );
  };
  dd.innerHTML = _psGeoItems.map((item, i) => `
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
  const v = document.getElementById('psr-validation');
  if (v) v.style.display = 'none';
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
  _psSearchType  = 'current_location';
  _psUpdateLocationStatus();
  const v = document.getElementById('psr-validation');
  if (v) v.style.display = 'none';
  if (typeof userLat === 'undefined' || !userLat) locateUser();
}

// ── Chip-Auswahl & Anwenden ───────────────────────────────────────
function setPsRadius(km) {
  _psRadius = km;
  document.querySelectorAll('.radius-chip').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.km) === km);
  });
}

function applyPsRadius() {
  const c = _psCenter();
  if (!c) {
    const v = document.getElementById('psr-validation');
    if (v) { v.textContent = 'Bitte gib einen Ort ein oder verwende deinen aktuellen Standort.'; v.style.display = ''; }
    return;
  }
  const v = document.getElementById('psr-validation');
  if (v) v.style.display = 'none';

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

  _eventsRadiusActive = true;
  PTAnalytics.track('radius_filter_changed', { radius_km: _psRadius });
  closeAllSheets();
  renderEvents();
  if (typeof renderHomePsSection === 'function') renderHomePsSection();
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
      btn.textContent='✅'; btn.style.background='var(--green)';
      showToast('🏓 Du nimmst am Event teil!');
    }, 400);
    return;
  }
  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });
  if(error && error.code === '23505') {
    showToast('Du nimmst bereits teil','ℹ️');
    btn.textContent='✅'; btn.style.background='var(--green)';
  } else if(error) {
    showToast('Fehler beim Beitreten','❌');
    btn.disabled=false; btn.textContent='Dabei';
  } else {
    btn.textContent='✅'; btn.style.background='var(--green)';
    PTAnalytics.track('game_joined');
    showToast('🏓 Du nimmst am Event teil!');
    _patchEventParticipantJoin(eventId);
    renderHome();
    renderEvents();
  }
}

function renderPlayerSearchCard(ps) {
  const cardClick    = `showPlayerSearchDetail(${ps.id})`;
  const profileClick = `event.stopPropagation();showPlayerProfile('${escAttr(ps.userId||'')}','${escAttr(ps.username||'')}','${escAttr(ps.avatarEmoji||'')}',null,'${escAttr(ps.avatarUrl||'')}')`;
  const avHtml = getAvatarHtml({ avatar_emoji: ps.avatarEmoji, avatar_url: ps.avatarUrl, username: ps.username }, { size: 46 });
  const metaParts = [];
  // wann first, then distance, then search radius
  if (ps.wann && ps.wann !== 'Egal') metaParts.push(`${ic('clock',12)} <b style="color:var(--text);font-weight:600;">${escHtml(ps.wann)}</b>`);
  const dist = _psDist(ps);
  if (dist != null) {
    const distStr = typeof formatDistance === 'function'
      ? formatDistance(Math.round(dist))
      : (dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1).replace('.', ',') + ' km');
    metaParts.push(`${ic('pin',12)} ${distStr} entfernt`);
  } else if (ps.location_label) {
    metaParts.push(`${ic('pin',12)} ${escHtml(ps.location_label)}`);
  }
  const srKm = ps.search_radius_km;
  if (srKm) metaParts.push(`${ic('navigate',12)} sucht im Umkreis ${srKm} km`);
  else if (ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`${ic('navigate',12)} ${escHtml(ps.umkreis)}`);
  return `
    <div class="player-search-card fade-up" onclick="${cardClick}">
      <div class="psc-profile">
        <div class="pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="psc-identity">
          <div class="psc-name pp-clickable" onclick="${profileClick}">${escHtml(ps.username || 'Spieler')}</div>
          <div class="psc-type-row">
            <span class="fc-type-badge fc-type-badge--gesuch">GESUCH</span>
            ${gameTypePill(ps.spielart)}
          </div>
        </div>
        <div class="ecb-chevron">›</div>
      </div>
      ${metaParts.length ? `<div class="psc-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>` : ''}
      ${ps.message ? `<div class="psc-message">"${escHtml(ps.message)}"</div>` : ''}
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
    case 'Heute': return str(now);
    case 'Diese Woche': { const d = new Date(now); d.setDate(d.getDate() + 3); return str(d); }
    case 'Wochenende': { const d = new Date(now); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return str(d); }
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
  const myId = sb.isLoggedIn() ? String(sb.getUserId()) : null;
  const isDabei = myId && e.participants.some(p => String(p.id) === myId);
  return `
  <div class="event-card-big fade-up" onclick="showEventDetail(${e.id})">
    <div class="ecb-thumb ev-thumb-${e.type||'casual'}">${thumbInner}</div>
    <div class="ecb-info">
      <div class="ecb-title-row">
        <span class="fc-type-badge fc-type-badge--spiel">SPIEL</span>
        <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
        ${isDabei ? '<span class="ecb-dabei-badge">Dabei</span>' : ''}
      </div>
      <div class="ecb-title">${e.name}</div>
      <div class="ecb-date">${ic('calendar',12)} ${formatEventDate(e)}</div>
      <div class="ecb-creator">${ic('user',12)} ${e.creatorId
        ? `<b class="pp-clickable" style="cursor:pointer;" onclick="event.stopPropagation();showPlayerProfile('${escAttr(e.creatorId)}','${escAttr(e.creator||'')}','${escAttr(e.creatorEmoji||'')}',null,'${escAttr(e.creatorAvatarUrl||'')}')">${escHtml(e.creator||'Anonym')}</b>`
        : `<b>${escHtml(e.creator||'Anonym')}</b>`}</div>
      <div class="ecb-location">${ic('pin')} ${e.tname}</div>
      <div class="ecb-participants-row">${participantStack(e.participants,4,26)}<span class="ecb-pcount">${e.p}/${e.max} Teilnehmer</span></div>
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
  if (currentTimeFilter === 'today')    return src.filter(ps => ps.wann === 'Heute' || ps.wann === 'Egal');
  if (currentTimeFilter === 'tomorrow') return src.filter(ps => ps.wann === 'Diese Woche' || ps.wann === 'Egal');
  if (currentTimeFilter === 'week')     return src.filter(ps => ['Heute','Diese Woche','Egal'].includes(ps.wann));
  if (currentTimeFilter === 'weekend')  return src.filter(ps => ps.wann === 'Diese Woche' || ps.wann === 'Egal');
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
  const { list: psFiltered, filteredOut } = _eventsRadiusActive
    ? _psGetFiltered(srcPs)
    : { list: srcPs, filteredOut: 0, noLocation: false };

  _updateEfcRadius();
  _updateEfcReset();

  const hasItems = games.length > 0 || psFiltered.length > 0;

  if (!hasItems) {
    const canReset = currentTimeFilter !== 'all' || currentTypeFilter !== 'all';
    c.innerHTML = `<div class="empty-state-card">
      <div class="esc-icon">📅</div>
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
  const combined = [
    ...games.map(e => ({
      kind: 'event', data: e,
      sortKey: (e.dateStr || '9999-12-31') + 'T' + (e.time || '00:00'),
      dist: (() => { const t = tables.find(t => t.id === e.tid); return (typeof userLat !== 'undefined' && userLat && t?.lat) ? calcDistance(userLat, userLng, t.lat, t.lng) : Infinity; })()
    })),
    ...psFiltered.map(ps => ({
      kind: 'ps', data: ps,
      sortKey: _psDateSortKey(ps),
      dist: _psDist(ps) ?? Infinity
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
    item.kind === 'event' ? renderEventCard(item.data, idx) : renderPlayerSearchCard(item.data)
  ).join('');

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

function openCreateEventSheet() {
  _editingEventId = null;
  PTAnalytics.track('game_create_started');
  document.querySelector('#create-event-sheet .sheet-title').textContent = 'Spiel organisieren';
  document.querySelector('#create-event-sheet .btn-primary').textContent = 'Spiel organisieren 🏓';
  document.getElementById('ev-name').value  = '';
  document.getElementById('ev-date').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('ev-time').value  = '15:00';
  document.getElementById('ev-mode').value  = 'casual';
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = '';
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
  if(!title || !tableId || !date || !time) { showToast('Bitte alle Pflichtfelder ausfüllen','⚠️'); return; }

  if(_editingEventId) {
    const { error } = await new QueryBuilder('events').eq('id', _editingEventId).update({
      title, table_id: parseInt(tableId), event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) { showToast('Fehler beim Speichern','❌'); console.error(error); return; }
    _editingEventId = null;
    closeAllSheets();
    showToast('✅ Event gespeichert!');
  } else {
    // 1. Event anlegen (insert gibt die neue Zeile zurück)
    const { data: inserted, error } = await new QueryBuilder('events').insert({
      title, table_id: parseInt(tableId),
      creator_id: sb.getUserId(),
      event_date: date, event_time: time, mode,
      max_participants: maxP, description: desc || null
    });
    if(error) { showToast('Fehler beim Erstellen','❌'); console.error(error); return; }

    // 2. Ersteller sofort als Teilnehmer eintragen
    const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if(newId) {
      const { error: pErr } = await new QueryBuilder('event_participants')
        .insert({ event_id: newId, user_id: sb.getUserId() });
      if(pErr && pErr.code !== '23505') {
        console.warn('Participant-Insert fehlgeschlagen, versuche erneut:', pErr);
        // Einmal wiederholen
        await new QueryBuilder('event_participants')
          .insert({ event_id: newId, user_id: sb.getUserId() });
      }
    }

    PTAnalytics.track('game_created', { mode });
    closeAllSheets();
    showToast('🎉 Spiel organisiert!');
  }

  // 3. Globalen State neu laden (holt Event + Participants)
  await loadEvents();

  // 4. Alle Ansichten neu rendern
  renderEvents();
  renderHome();

  // 5. Karte aktualisieren: Marker-Badges, Liste, offene Preview
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
  openSheet('mitspieler-sheet');
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
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=6` +
      `&addressdetails=1&countrycodes=de&accept-language=de` +
      `&viewbox=9.8,50.25,10.75,49.85&bounded=0` +
      `&email=kontakt%40plattentreff.app`;
    const res = await fetch(url, {
      signal: _msGeoAbort.signal,
      headers: { 'Accept-Language': 'de' }
    });
    const geo = (await res.json()).slice(0, 5);
    _msGeoItems = geo.map(r => ({
      lat:   parseFloat(r.lat),
      lng:   parseFloat(r.lon),
      label: r.name || r.display_name.split(',')[0],
      sub:   r.display_name.split(',').slice(1, 3).join(',').trim()
    }));
  } catch(e) { if (e?.name === 'AbortError') return; }
  _msRenderDd(q);
}

function _msRenderDd(q) {
  const dd = document.getElementById('ms-loc-dropdown');
  if (!dd) return;
  if (!_msGeoItems.length) {
    dd.innerHTML = `<div class="search-empty">Keine Ergebnisse für „${escHtml(q)}"</div>`;
    dd.classList.add('open');
    return;
  }
  const hl = s => {
    if (!q) return escHtml(s);
    return escHtml(s).replace(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
      '<mark>$1</mark>'
    );
  };
  dd.innerHTML = _msGeoItems.map((item, i) => `
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
    showToast('Bitte wähle einen Ort aus, damit andere dein Gesuch in der Nähe finden können.', '⚠️');
    if(btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
    return;
  }

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
  if(error) { showToast('Fehler beim Veröffentlichen', '❌'); console.error(error); return; }

  PTAnalytics.track('player_search_created', { radius_km: searchRadiusKm, mode: spielart });
  closeAllSheets();
  showToast('👥 Gesuch veröffentlicht!', '✅');
  await loadEvents();
  renderEvents();
  renderHome();
}
