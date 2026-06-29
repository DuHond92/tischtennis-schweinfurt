// ╔══════════════════════════════════════════════════════════════╗
// ║           NAVIGATION                                         ║
// ╚══════════════════════════════════════════════════════════════╝
const pages = ['home','map','events','profile','admin'];
let currentPage = 'home';
let mapInit = false;

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
  if(name==='map' && !mapInit) { mapInit=true; setTimeout(initMap,50); }
  else if(name==='map' && leafletMap) { setTimeout(()=>leafletMap.invalidateSize(),50); }
  if(name==='profile') renderProfile();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           DARK MODE                                          ║
// ╚══════════════════════════════════════════════════════════════╝
const LOGO_LIGHT = 'images/logo/logo-bild-schrift.svg';
const LOGO_DARK  = 'images/logo/logo-bild-schrift-negative.svg';

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
let openSheetId = null;
function openSheet(id) {
  if(openSheetId) closeAllSheets();
  document.getElementById('overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
  openSheetId = id;
}
function closeAllSheets() {
  stopChatPolling();
  if (typeof stopDmPolling === 'function') stopDmPolling();
  document.querySelectorAll('.bottom-sheet.open').forEach(s => {
    s.classList.remove('open');
    s.style.removeProperty('height');
    s.style.removeProperty('max-height');
  });
  document.getElementById('overlay').classList.remove('open');
  const ppOv = document.getElementById('pp-overlay');
  if(ppOv) ppOv.classList.remove('open');
  const dmOv = document.getElementById('dm-overlay');
  if(dmOv) dmOv.classList.remove('open');
  openSheetId = null;
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
// ║           TOAST                                              ║
// ╚══════════════════════════════════════════════════════════════╝
const _TOAST_ICON_TYPE = { '❌': 'error', '⚠️': 'warning', 'ℹ️': 'info' };
const _TOAST_DURATION  = { success: 3800, info: 4000, warning: 5500, error: 6500 };
let _toastTimer = null;

function showToast(text, iconOrOpts) {
  let icon = '✅', type = 'success', duration;
  if (iconOrOpts && typeof iconOrOpts === 'object') {
    type     = iconOrOpts.type || 'success';
    icon     = iconOrOpts.icon || { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' }[type] || '✅';
    duration = iconOrOpts.duration;
  } else if (iconOrOpts) {
    icon = iconOrOpts;
    type = _TOAST_ICON_TYPE[icon] || 'success';
  }
  duration = duration || _TOAST_DURATION[type] || 3800;

  const t = document.getElementById('toast');
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-text').textContent = text;
  t.className = 'toast toast--' + type;
  void t.offsetHeight; // reflow to restart transition
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── SNACKBAR ────────────────────────────────────────────────────────
const _SNACKBAR_DURATION = { success: 5000, info: 5000, warning: 7000, error: 8000 };
let _snackbarTimer  = null;
let _snackbarAction = null;

function showSnackbar({ title, message, type = 'info', actionLabel, onAction, dismissible = true, duration } = {}) {
  const sb        = document.getElementById('snackbar');
  const titleEl   = document.getElementById('snackbar-title');
  const msgEl     = document.getElementById('snackbar-msg');
  const actionBtn = document.getElementById('snackbar-action');
  const dismissBtn= document.getElementById('snackbar-dismiss');

  titleEl.textContent  = title   || '';
  titleEl.style.display = title  ? '' : 'none';
  msgEl.textContent    = message || '';
  _snackbarAction      = onAction || null;

  if (actionLabel && onAction) {
    actionBtn.textContent    = actionLabel;
    actionBtn.style.display  = '';
  } else {
    actionBtn.style.display = 'none';
  }
  dismissBtn.style.display = dismissible ? '' : 'none';

  sb.className = 'snackbar snackbar--' + type;
  void sb.offsetHeight;
  sb.classList.add('show');

  clearTimeout(_snackbarTimer);
  const dur = duration ?? _SNACKBAR_DURATION[type] ?? 6000;
  if (dur > 0) _snackbarTimer = setTimeout(dismissSnackbar, dur);
}

function dismissSnackbar() {
  clearTimeout(_snackbarTimer);
  document.getElementById('snackbar')?.classList.remove('show');
}

function _triggerSnackbarAction() {
  if (_snackbarAction) _snackbarAction();
  dismissSnackbar();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           SEARCH AUTOCOMPLETE                                ║
// ╚══════════════════════════════════════════════════════════════╝
let searchTimer = null;
let dropdownItems = [];
let activeIdx = -1;

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
  const src = tables.length ? tables : FALLBACK_TABLES;

  // 1. Lokale Platten sofort matchen
  const localMatches = src.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    (t.addr||'').toLowerCase().includes(q.toLowerCase())
  );

  // 2. Nominatim (OSM Geocoding) für Orte/Adressen
  let geoResults = [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q + ' Schweinfurt')}&format=json&limit=4` +
      `&addressdetails=1&countrycodes=de&accept-language=de`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
    const data = await res.json();
    geoResults = data.slice(0,4);
  } catch(e) { /* Offline oder Rate-limit */ }

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
      🏓 Tischtennisplatten</div>`;
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
}

function closeDropdown() {
  document.getElementById('search-dropdown')?.classList.remove('open');
  activeIdx = -1;
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

// Dropdown schließen wenn man woanders klickt
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('search-wrapper');
  const dd = document.getElementById('search-dropdown');
  if (!wrapper && !dd) return;
  if(!wrapper?.contains(e.target) && !dd?.contains(e.target)) {
    closeDropdown();
  }
});



function animateCount(el, target) {
  if(!el) return;
  let n=0; const step=Math.max(1,Math.ceil(target/30));
  const t=setInterval(()=>{ n=Math.min(n+step,target); el.textContent=n; if(n>=target)clearInterval(t); },40);
}

document.addEventListener('DOMContentLoaded', () => {
  const inbox = document.getElementById('inbox-sheet');
  if (inbox) initSheetDrag(inbox, 0.78, 0.95);
});
