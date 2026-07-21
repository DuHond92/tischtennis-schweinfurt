// ╔══════════════════════════════════════════════════════════════╗
// ║           NAVIGATION                                         ║
// ╚══════════════════════════════════════════════════════════════╝
const pages = ['home','map','events','profile','admin'];
let currentPage = 'home';
let mapInit = false;

// Wartet per rAF bis der Map-Container echte Dimensionen hat, dann initMap()
// Verhindert Leaflet 0×0px-Mount auf langsamen iOS-Geräten
function _initMapWhenReady() {
  const el = document.getElementById('map');
  if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
    initMap();
  } else {
    requestAnimationFrame(_initMapWhenReady);
  }
}

function showPage(name) {
  // Auth-Gate: Profil, Events erstellen nur wenn eingeloggt
  if((name==='profile') && !sb.isLoggedIn()) {
    openSheet('auth-sheet');
    return;
  }
  pages.forEach(p => {
    document.getElementById('page-'+p).classList.toggle('active', p===name);
    document.getElementById('nav-'+p)?.classList.toggle('active', p===name);
  });
  currentPage = name;
  document.getElementById('main-fab').style.display =
    name==='events' ? 'flex' : 'none';
  document.querySelector('.bottom-nav').style.display =
    name === 'admin' ? 'none' : '';
  if(name==='map' && !mapInit) { mapInit=true; _initMapWhenReady(); }
  else if(name==='map' && leafletMap) { setTimeout(()=>leafletMap.invalidateSize(),50); }
  if(name==='profile') renderProfile();
  if(name==='map')    PTAnalytics.track('map_opened');
  if(name==='events') PTAnalytics.track('play_tab_opened');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           DARK MODE                                          ║
// ╚══════════════════════════════════════════════════════════════╝
const LOGO_LIGHT = 'images/logo/logo-plattentreff.svg';
const LOGO_DARK  = 'images/logo/logo-plattentreff-negative.svg';

let isDark = localStorage.getItem('tt_dark')==='1';
function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark?'dark':'light');
  const t = document.getElementById('dm-toggle');
  if(t) t.checked = isDark;
  const logo = document.getElementById('app-logo');
  if(logo) logo.src = isDark ? LOGO_DARK : LOGO_LIGHT;
}
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('tt_dark', isDark?'1':'0');
  applyTheme();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           BOTTOM SHEETS                                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ── SCROLL LOCK ───────────────────────────────────────────────
// Sperrt den Hintergrund-Scroll wenn ein Overlay offen ist.
// Speichert scrollTop des aktiven .page, statt position:fixed auf
// body zu setzen — kein Layout-Shift, kein Sticky-Regression.
let _scrollLockDepth  = 0;
let _savedPageScrollY = 0;

function _lockPageScroll() {
  _scrollLockDepth++;
  if (_scrollLockDepth > 1) return;           // bereits gesperrt
  const page = document.querySelector('.page.active');
  if (!page) return;
  _savedPageScrollY = page.scrollTop;
  page.style.overflowY = 'hidden';
}

function _unlockPageScroll() {
  if (_scrollLockDepth > 0) _scrollLockDepth--;
  if (_scrollLockDepth > 0) return;           // noch andere Overlays offen
  const page = document.querySelector('.page.active');
  if (!page) return;
  page.style.removeProperty('overflow-y');
  // rAF: erst nach Reflow scrollen, damit iOS die Position nicht verwirft
  requestAnimationFrame(() => {
    const pg = document.querySelector('.page.active');
    if (pg) pg.scrollTop = _savedPageScrollY;
  });
}

// Öffnet rechtliche Seiten im System-Browser (iOS/Android) oder neuem Tab (Web)
function openLegalPage(url) {
  PTAnalytics.track('legal_page_opened');
  const target = (typeof window.Capacitor !== 'undefined') ? '_system' : '_blank';
  window.open(url, target, 'noopener,noreferrer');
}

// ── TDS SUBPAGE NAVIGATION ────────────────────────────────────────
// Öffnet eine Unterseite auf dem table-detail-sheet (slide-right, kein Sheet-Wechsel).
// Das Parent-Sheet bleibt geöffnet — nur die Unterseite wird sichtbar.
function openTdsSubpage(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.removeProperty('transform');
  el.style.removeProperty('transition');
  el.style.removeProperty('visibility');
  el.classList.add('open');
}

// Schließt die Unterseite und kehrt zum Parent-Sheet zurück.
function closeTdsSubpage(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
}

let openSheetId = null;

// ── SUB-SHEET: stapelt über einem bestehenden Eltern-Sheet ──
// openSubSheet / closeSubSheet berühren weder openSheetId noch den regulären
// Sheet-Stack. Das darunterliegende Sheet bleibt vollständig erhalten.
let _openSubSheetId = null;

function openSubSheet(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (_openSubSheetId && _openSubSheetId !== id) {
    const prev = document.getElementById(_openSubSheetId);
    if (prev) {
      prev.classList.remove('open');
      prev.style.removeProperty('transform');
      prev.style.removeProperty('transition');
    }
  }
  const ov = document.getElementById('sub-sheet-overlay');
  if (ov) ov.classList.add('open');
  el.style.removeProperty('transform');
  el.style.removeProperty('transition');
  el.classList.add('open');
  _openSubSheetId = id;
}

function closeSubSheet() {
  if (!_openSubSheetId) return;
  const closingSubSheetId = _openSubSheetId;
  if (closingSubSheetId === 'event-table-picker-sheet'
      && typeof _resetEventTablePickerConfirmation === 'function') {
    _resetEventTablePickerConfirmation();
  }
  const el = document.getElementById(_openSubSheetId);
  if (el) {
    el.classList.remove('open');
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
  }
  const ov = document.getElementById('sub-sheet-overlay');
  if (ov) ov.classList.remove('open');
  _openSubSheetId = null;
}

function openSheet(id) {
  if (openSheetId === id) return;
  const el = document.getElementById(id);
  if (!el) return;

  if (openSheetId) {
    // Sheet-Wechsel: Overlay bleibt open — kein opacity-Flicker durch Fade-out/Fade-in
    stopChatPolling();
    if (typeof stopDmPolling          === 'function') stopDmPolling();
    if (typeof _cancelNotifSeenTimers === 'function') _cancelNotifSeenTimers();
    if (typeof _destroyEdsMap         === 'function') _destroyEdsMap();
    document.querySelectorAll('.bottom-sheet.open').forEach(s => {
      s.classList.remove('open');
      s.style.removeProperty('height');
      s.style.removeProperty('max-height');
      s.style.removeProperty('transform');
      s.style.removeProperty('transition');
    });
    // Overlay + Body-Klasse + Scroll-Lock bleiben — direkt neues Sheet öffnen
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
    el.classList.add('open');
    openSheetId = id;
    return;
  }

  // Kein Sheet offen — normaler Öffnungsweg mit Overlay
  el.style.removeProperty('transform');
  el.style.removeProperty('transition');
  document.getElementById('overlay').classList.add('open');
  el.classList.add('open');
  document.body.classList.add('has-open-sheet');
  _lockPageScroll();
  openSheetId = id;
}
function closeAllSheets() {
  closeSubSheet();
  stopChatPolling();
  if (typeof stopDmPolling            === 'function') stopDmPolling();
  if (typeof _cancelNotifSeenTimers   === 'function') _cancelNotifSeenTimers();
  if (typeof _destroyEdsMap           === 'function') _destroyEdsMap();
  if (typeof _cleanupSuggestPin       === 'function') _cleanupSuggestPin();
  document.querySelectorAll('.bottom-sheet.open').forEach(s => {
    s.classList.remove('open');
    s.style.removeProperty('height');
    s.style.removeProperty('max-height');
    s.style.removeProperty('transform');
    s.style.removeProperty('transition');
  });
  document.getElementById('overlay').classList.remove('open');
  const ppOv = document.getElementById('pp-overlay');
  if(ppOv) ppOv.classList.remove('open');
  const dmOv = document.getElementById('dm-overlay');
  if(dmOv) dmOv.classList.remove('open');
  document.body.classList.remove('has-open-sheet');
  // Depth auf 0 zwingen (closeAllSheets schliesst alles auf einmal)
  _scrollLockDepth = 1;
  _unlockPageScroll();
  openSheetId = null;
}

// Swipe-right-to-close für slide-right-sheets
// edgePx > 0: nur tracken wenn Touch innerhalb edgePx vom linken Rand (wie iOS-Kanten-Swipe)
function initSwipeClose(sheetEl, closeFn, edgePx = 0) {
  let startX = 0, startY = 0, dx = 0, tracking = null;

  sheetEl.addEventListener('touchstart', e => {
    startX   = e.touches[0].clientX;
    startY   = e.touches[0].clientY;
    dx       = 0;
    tracking = (edgePx > 0 && startX > edgePx) ? false : null;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', e => {
    if (!sheetEl.classList.contains('open')) return;
    const adx = e.touches[0].clientX - startX;
    const ady = Math.abs(e.touches[0].clientY - startY);
    if (tracking === null && (Math.abs(adx) > 6 || ady > 6)) {
      tracking = adx > 0 && Math.abs(adx) > ady; // nur Rechtswisch
    }
    if (!tracking) return;
    e.preventDefault();
    dx = Math.max(0, adx);
    sheetEl.style.transition = 'none';
    sheetEl.style.transform  = `translateX(calc(-50% + ${dx}px))`;
  }, { passive: false });

  const _resetStyles = () => {
    sheetEl.style.removeProperty('transition');
    sheetEl.style.removeProperty('transform');
  };

  const _snapBack = () => {
    if (!tracking) return;
    tracking = null;
    _resetStyles();
  };

  sheetEl.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = null;
    if (dx > 90) {
      // Nach rechts rausfliegen, dann schließen
      sheetEl.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)';
      sheetEl.style.transform  = 'translateX(100vw)';
      setTimeout(() => {
        _resetStyles();
        closeFn();
      }, 270);
    } else {
      // Nicht weit genug — zurückschnappen (transition entfernen damit CSS-Klasse übernimmt)
      _resetStyles();
    }
  });
  sheetEl.addEventListener('touchcancel', _snapBack);
}

// Swipe-down to close für Bottom-Sheets (nur wenn am Scroll-Anfang)
function initSwipeDownClose(sheetEl, closeFn) {
  let startY = 0, startX = 0, dy = 0, tracking = null;

  sheetEl.addEventListener('touchstart', e => {
    startY   = e.touches[0].clientY;
    startX   = e.touches[0].clientX;
    dy       = 0;
    tracking = null;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', e => {
    if (!sheetEl.classList.contains('open')) return;
    const ady = e.touches[0].clientY - startY;
    const adx = Math.abs(e.touches[0].clientX - startX);
    if (tracking === null && (Math.abs(ady) > 6 || adx > 6)) {
      // nur starten wenn Sheet oben gescrollt + klare Abwärts-Richtung
      tracking = ady > 0 && Math.abs(ady) > adx && sheetEl.scrollTop === 0;
    }
    if (!tracking) return;
    e.preventDefault();
    dy = Math.max(0, ady);
    sheetEl.style.transition = 'none';
    sheetEl.style.transform  = `translateX(-50%) translateY(${dy}px)`;
  }, { passive: false });

  const _reset = () => {
    sheetEl.style.removeProperty('transition');
    sheetEl.style.removeProperty('transform');
  };

  sheetEl.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = null;
    if (dy > 90) {
      sheetEl.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)';
      sheetEl.style.transform  = `translateX(-50%) translateY(100%)`;
      setTimeout(() => { _reset(); closeFn(); }, 270);
    } else {
      _reset();
    }
  });

  sheetEl.addEventListener('touchcancel', () => { tracking = null; _reset(); });
}

// Drag-to-expand: Sheet zwischen zwei Snap-Punkten ziehbar machen
function initSheetDrag(sheetEl, snap1Vh, snap2Vh) {
  const handle = sheetEl.querySelector('.sheet-handle');
  if (!handle) return;
  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener('touchstart', e => {
    dragging = true;
    startY = e.touches[0].clientY;
    startH = sheetEl.offsetHeight;
    sheetEl.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy  = startY - e.touches[0].clientY;
    const vh  = window.innerHeight;
    const min = vh * 0.25;
    const max = vh * snap2Vh;
    const newH = Math.min(max, Math.max(min, startH + dy));
    sheetEl.style.height = newH + 'px';
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sheetEl.style.transition = '';
    const h  = sheetEl.offsetHeight;
    const vh = window.innerHeight;
    // Snap: über 86 % → Fullscreen-Snap, sonst zurück zu snap1
    const snap = h > vh * 0.86 ? vh * snap2Vh : vh * snap1Vh;
    sheetEl.style.height = snap + 'px';
  });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           UNIFIED TOP TOAST                                  ║
// ╚══════════════════════════════════════════════════════════════╝
// Im Capacitor-App ist window.location.href 'capacitor://localhost/...' — kein gültiger Share-URL.
// Diese Funktion liefert immer eine https://-Basis für Share-Links.
function _getShareBase() {
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:')
    return APP_BASE_URL + '/';
  const u = new URL(window.location.href);
  u.search = '';
  return u.toString();
}

const _TOAST_EMOJI_TYPE = { '❌': 'error', '⚠️': 'warning', 'ℹ️': 'info', '✅': 'success' };
const _TOAST_ICON_NAME  = { success: 'check-circle', error: 'x-circle', warning: 'triangle-alert', info: 'info' };
const _TOAST_DURATION   = { success: 4000, info: 4000, warning: 5000, error: 5000 };
let _toastTimer  = null;
let _toastAction = null;

function showToast(text, iconOrOpts) {
  let type = 'success', duration, title = null, actionLabel = null, onAction = null, dismissible = true;

  if (iconOrOpts && typeof iconOrOpts === 'object') {
    type        = iconOrOpts.type || 'success';
    duration    = iconOrOpts.duration;
    title       = iconOrOpts.title       || null;
    actionLabel = iconOrOpts.actionLabel || null;
    onAction    = iconOrOpts.onAction    || null;
    dismissible = iconOrOpts.dismissible !== false;
  } else if (typeof iconOrOpts === 'string') {
    type = _TOAST_EMOJI_TYPE[iconOrOpts] || iconOrOpts || 'success';
    if (!_TOAST_ICON_NAME[type]) type = 'success';
  }
  duration = duration ?? _TOAST_DURATION[type] ?? 4000;

  const t        = document.getElementById('toast');
  const titleEl  = document.getElementById('toast-title');
  const actsEl   = document.getElementById('toast-acts');
  const actBtn   = document.getElementById('toast-act-btn');
  const closeBtn = document.getElementById('toast-close-btn');

  document.getElementById('toast-icon').innerHTML = ic(_TOAST_ICON_NAME[type], 16);
  document.getElementById('toast-text').textContent = text;

  if (titleEl) {
    titleEl.textContent   = title || '';
    titleEl.style.display = title ? '' : 'none';
  }

  _toastAction = onAction || null;
  const hasAction = !!(actionLabel && onAction);
  if (actBtn)   { actBtn.textContent = actionLabel || ''; actBtn.style.display = hasAction ? '' : 'none'; }
  if (closeBtn) { closeBtn.style.display = (hasAction || !dismissible) ? '' : 'none'; }
  if (actsEl)   { actsEl.style.display = (hasAction || !dismissible) ? '' : 'none'; }

  t.className = 'toast toast--' + type;
  t.setAttribute('role', (type === 'error' || type === 'warning') ? 'alert' : 'status');
  t.setAttribute('aria-live', (type === 'error' || type === 'warning') ? 'assertive' : 'polite');
  void t.offsetHeight;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  if (duration > 0) _toastTimer = setTimeout(clearToast, duration);
}

function clearToast() {
  clearTimeout(_toastTimer);
  document.getElementById('toast')?.classList.remove('show');
}

function _triggerToastAction() {
  if (_toastAction) _toastAction();
  clearToast();
}

// ── SNACKBAR → delegiert an showToast ───────────────────────────────
function showSnackbar({ title, message, type = 'info', actionLabel, onAction, dismissible = true, duration } = {}) {
  const text = message || title || '';
  showToast(text, { type, title: message ? title : null, actionLabel, onAction, dismissible, duration });
}
function dismissSnackbar() { clearToast(); }
function _triggerSnackbarAction() { _triggerToastAction(); }

// ── INLINE-FEHLER (wiederverwendbar) ────────────────────────────────
function showInlineError(elOrId, { title = '', desc = '' } = {}) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.innerHTML =
    `<span class="form-error-icon" aria-hidden="true">${ic('triangle-alert', 16)}</span>` +
    `<div class="form-error-content">` +
      `<div class="form-error-title">${escHtml(title)}</div>` +
      (desc ? `<div class="form-error-desc">${escHtml(desc)}</div>` : '') +
    `</div>`;
  el.style.display = '';
}

function clearInlineError(elOrId) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (el) el.style.display = 'none';
}

// ── BESTÄTIGUNGSDIALOG ──────────────────────────────────────────────
let _cdOnConfirm   = null;
let _cdReturnFocus = null;

function showConfirmDialog({ title = '', body = '', confirmLabel = 'Löschen', cancelLabel = 'Abbrechen', onConfirm = null, danger = true, iconVisible = true } = {}) {
  const overlay = document.getElementById('confirm-dialog');
  if (!overlay) {
    // Fallback: nativer confirm wenn DOM nicht bereit
    if (confirm(body || title)) { if (onConfirm) onConfirm(); }
    return;
  }
  _cdReturnFocus = document.activeElement;
  document.getElementById('cd-title').textContent = title;
  document.getElementById('cd-body').textContent  = body;
  const btn = document.getElementById('cd-confirm-btn');
  btn.textContent = confirmLabel;
  btn.className   = 'btn ' + (danger ? 'btn-error' : 'btn-primary');
  document.getElementById('cd-cancel-btn').textContent = cancelLabel;
  const iconEl = overlay.querySelector('.cd-icon');
  if (iconEl) iconEl.style.display = iconVisible ? '' : 'none';
  _cdOnConfirm = onConfirm;
  overlay.classList.add('show');
  requestAnimationFrame(() => document.getElementById('cd-cancel-btn')?.focus());
}

function _cdClose() {
  document.getElementById('confirm-dialog').classList.remove('show');
  _cdReturnFocus?.focus();
  _cdReturnFocus = null;
}

function _cdConfirm() {
  _cdClose();
  const cb = _cdOnConfirm;
  _cdOnConfirm = null;
  if (cb) cb();
}

function _cdCancel() {
  _cdOnConfirm = null;
  _cdClose();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           SEARCH AUTOCOMPLETE                                ║
// ╚══════════════════════════════════════════════════════════════╝
let searchTimer = null, _searchAbort = null;
let dropdownItems = [];
let activeIdx = -1;
let _ddOutsideAbort = null;

function onSearchInput() {
  const q = document.getElementById('home-search').value.trim();
  clearTimeout(searchTimer);
  activeIdx = -1;
  if(q.length < 2) { closeDropdown(); return; }
  showDropdownLoading();
  // Debounce: 350ms nach letztem Tastendruck
  searchTimer = setTimeout(() => runSearch(q), 350);
}

async function runSearch(q) {
  // tablesLoaded = false solange Supabase noch antwortet.
  // FALLBACK_TABLES darf hier nicht erscheinen — Ladezustand halten, kein Demo-Content.
  if (!tablesLoaded) return;

  // tables ist jetzt der echte Supabase-Stand: [] = leer (gültig), [...] = Daten
  // 1. Lokale Platten sofort matchen
  const localMatches = tables.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    (t.addr||'').toLowerCase().includes(q.toLowerCase())
  );

  // 2. Nominatim (OSM Geocoding) für Orte/Adressen
  if (_searchAbort) _searchAbort.abort();
  _searchAbort = new AbortController();
  let geoResults = [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q + ' Schweinfurt')}&format=json&limit=4` +
      `&addressdetails=1&countrycodes=de&accept-language=de` +
      `&email=kontakt%40plattentreff.app`;
    const res = await fetch(url, {
      signal: _searchAbort.signal,
      headers: { 'Accept-Language': 'de' }
    });
    const data = await res.json();
    geoResults = data.slice(0,4);
  } catch(e) { if (e?.name === 'AbortError') return; }

  renderDropdown(q, localMatches, geoResults);
}

function highlight(text, q) {
  if(!q) return text;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

function renderDropdown(q, localMatches, geoResults) {
  const dd = document.getElementById('search-dropdown');
  dropdownItems = [];
  let html = '';

  // Lokale Platten
  if(localMatches.length) {
    html += `<div style="padding:6px 14px 4px;font-size:0.68rem;font-weight:800;
      color:var(--text-xdim);text-transform:uppercase;letter-spacing:0.8px;">
      ${ic('table-tennis', 13)} Tischtennisplatten</div>`;
    localMatches.slice(0,3).forEach(t => {
      const idx = dropdownItems.length;
      dropdownItems.push({ type:'table', data:t });
      html += `<div class="search-dropdown-item" tabindex="0"
        onmousedown="selectDropdownItem(${idx})"
        onkeydown="if(event.key==='Enter')selectDropdownItem(${idx})"
        id="sdi-${idx}">
        <div class="sdi-icon table">${t.icon}</div>
        <div>
          <div class="sdi-main">${highlight(t.name, q)}</div>
          <div class="sdi-sub">${ic('pin')} ${t.addr||''} · ${t.type==='indoor'?'Indoor':'Outdoor'}</div>
        </div>
      </div>`;
    });
  }

  // OSM Geo-Ergebnisse
  if(geoResults.length) {
    html += `<div style="padding:6px 14px 4px;font-size:0.68rem;font-weight:800;
      color:var(--text-xdim);text-transform:uppercase;letter-spacing:0.8px;">
      ${ic('pin')} Orte & Adressen</div>`;
    geoResults.forEach(r => {
      const idx = dropdownItems.length;
      const name = r.name || r.display_name.split(',')[0];
      const sub  = r.display_name.split(',').slice(1,3).join(',').trim();
      dropdownItems.push({ type:'geo', data:r });
      html += `<div class="search-dropdown-item" tabindex="0"
        onmousedown="selectDropdownItem(${idx})"
        onkeydown="if(event.key==='Enter')selectDropdownItem(${idx})"
        id="sdi-${idx}">
        <div class="sdi-icon place">${ic('pin',18)}</div>
        <div>
          <div class="sdi-main">${highlight(name, q)}</div>
          <div class="sdi-sub">${sub}</div>
        </div>
      </div>`;
    });
  }

  if(!html) {
    html = `<div class="search-empty">Keine Ergebnisse für „${q}"</div>`;
  }

  dd.innerHTML = html;
  openDropdown();
}

function showDropdownLoading() {
  const dd = document.getElementById('search-dropdown');
  dd.innerHTML = `<div class="search-loading">
    <div class="search-spinner"></div> Suche läuft…
  </div>`;
  openDropdown();
}

function openDropdown() {
  document.getElementById('search-dropdown')?.classList.add('open');
  _ddOutsideAbort?.abort();
  _ddOutsideAbort = new AbortController();
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('search-wrapper');
    const dd = document.getElementById('search-dropdown');
    if (!wrapper?.contains(e.target) && !dd?.contains(e.target)) closeDropdown();
  }, { signal: _ddOutsideAbort.signal });
}

function closeDropdown() {
  document.getElementById('search-dropdown')?.classList.remove('open');
  activeIdx = -1;
  _ddOutsideAbort?.abort();
  _ddOutsideAbort = null;
}

function selectDropdownItem(idx) {
  const item = dropdownItems[idx];
  if(!item) return;
  closeDropdown();

  if(item.type === 'table') {
    // Direkt zur Platte navigieren
    const t = item.data;
    document.getElementById('home-search').value = t.name;
    showPage('map');
    setTimeout(() => {
      selectMapItem(t.id);
      showTableDetail(t.id);
    }, 100);

  } else if(item.type === 'geo') {
    // Auf der Karte zu Koordinaten zoomen
    const lat = parseFloat(item.data.lat);
    const lng = parseFloat(item.data.lon);
    const name = item.data.name || item.data.display_name.split(',')[0];
    document.getElementById('home-search').value = name;
    showPage('map');
    setTimeout(() => {
      if(leafletMap) leafletMap.setView([lat, lng], 15, { animate: true });
    }, 100);
  }
}

// Tastaturnavigation im Dropdown (↑ ↓ Enter Escape)
function onSearchKey(e) {
  const items = document.querySelectorAll('.search-dropdown-item');
  if(!items.length) return;
  if(e.key === 'ArrowDown') {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, items.length - 1);
    items[activeIdx]?.focus();
  } else if(e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, -1);
    if(activeIdx === -1) document.getElementById('home-search').focus();
    else items[activeIdx]?.focus();
  } else if(e.key === 'Escape') {
    closeDropdown();
    document.getElementById('home-search').blur();
  }
}




function animateCount(el, target) {
  if(!el) return;
  const duration = 1200;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(progress * target);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (_openSubSheetId) { closeSubSheet(); return; }
    const cd = document.getElementById('confirm-dialog');
    if (cd?.classList.contains('show')) { _cdCancel(); e.stopPropagation(); }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const inbox = document.getElementById('inbox-sheet');
  const dm    = document.getElementById('dm-sheet');
  if (inbox) initSwipeClose(inbox, () => closeAllSheets());
  if (dm)    initSwipeClose(dm,    () => closeDmSheet());
  const auth = document.getElementById('auth-sheet');
  if (auth)  initSwipeDownClose(auth, () => closeAllSheets());

  // Fullscreen detail sheets — edge-only swipe (44px) um Konflikte mit Foto-Slidern zu vermeiden
  const tds = document.getElementById('table-detail-sheet');
  const eds = document.getElementById('event-detail-sheet');
  const psd = document.getElementById('ps-detail-sheet');
  const nst = document.getElementById('notif-sheet');
  const pps = document.getElementById('player-profile-sheet');
  const pes = document.getElementById('profile-edit-sheet');
  const hs  = document.getElementById('history-sheet');
  const rs  = document.getElementById('rating-sheet');
  const ces = document.getElementById('create-event-sheet');
  const etp = document.getElementById('event-table-picker-sheet');
  const mss = document.getElementById('mitspieler-sheet');
  if (rs)  initSwipeClose(rs,  () => closeRatingSheet(),       44);
  if (ces) initSwipeClose(ces, () => handleCreateEventBack(),  44);
  if (etp) initSwipeClose(etp, () => closeEventTablePicker(), 44);
  if (mss) initSwipeClose(mss, () => closeMitspielerSheet(),   44);
  const ars = document.getElementById('all-ratings-sheet');
  if (ars) initSwipeClose(ars, () => closeAllRatingsSheet(),   44);
  if (tds) initSwipeClose(tds, () => closeAllSheets(),         44);
  if (eds) initSwipeClose(eds, () => _closeEventDetail(),   44);
  if (hs)  initSwipeClose(hs,  () => closeAllSheets(),      44);
  if (psd) initSwipeClose(psd, () => closeAllSheets(),     44);
  if (nst) initSwipeClose(nst, () => closeAllSheets(),     44);
  if (pps) initSwipeClose(pps, () => closePlayerProfile(), 44);
  if (pes) initSwipeClose(pes, () => closeAllSheets(),     44);

  // Sub-sheets: Swipe-down schließt nur das Sub-Sheet
  const leaveEventSheet = document.getElementById('leave-event-sheet');
  const ppAs = document.getElementById('pp-action-sheet');
  const dmAs = document.getElementById('dm-action-sheet');
  if (leaveEventSheet) initSwipeDownClose(leaveEventSheet, () => closeSubSheet());
  if (ppAs) initSwipeDownClose(ppAs, () => closeSubSheet());
  if (dmAs) initSwipeDownClose(dmAs, () => closeSubSheet());
});

// ── Keyboard Avoidance ────────────────────────────────────────────────────
// Setzt --app-height auf die tatsächlich sichtbare Viewport-Höhe (ohne
// Tastatur). Fullscreen-Sheets nutzen diese Variable anstelle von 100dvh,
// damit Eingabefelder nie von der Tastatur verdeckt werden.
(function _initKeyboardAvoidance() {
  function _updateAppHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _updateAppHeight);
    window.visualViewport.addEventListener('scroll', _updateAppHeight);
  }
  window.addEventListener('resize', _updateAppHeight);
  _updateAppHeight();

  // Fokussiertes Input in den sichtbaren Bereich scrollen.
  // Nötig für Inputs innerhalb scrollbarer Container (z.B. Event-Kommentare
  // in eds-scroll-body), wo der Browser nicht automatisch scrollt.
  document.addEventListener('focusin', function(e) {
    const el = e.target;
    if (!el || !el.matches(
      'input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),' +
      'textarea'
    )) return;

    setTimeout(function() {
      // DM-Chat: letzter Feed-Eintrag sichtbar halten (Input ist sticky unten)
      if (el.id === 'dm-input') {
        const feed = document.getElementById('dm-feed');
        if (feed) feed.scrollTop = feed.scrollHeight;
        return;
      }
      // Alle anderen Inputs: in nächstgelegenen Scrollcontainer einrollen
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 350); // Tastatur-Animations-Delay abwarten
  }, true);
})();
