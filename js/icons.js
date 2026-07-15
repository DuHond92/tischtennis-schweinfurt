// ╔══════════════════════════════════════════════════════════════╗
// ║           LUCIDE ICONS (inline SVG helper)                   ║
// ╚══════════════════════════════════════════════════════════════╝
const _IC = {
  // Navigation & Layout
  pin:           '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  'map-pinned':  '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.869 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.9.553l-2.662 5.324a.5.5 0 0 0 .448.724h18.22a.5.5 0 0 0 .448-.724l-2.662-5.324A1 1 0 0 0 18.996 14H15.29"/>',
  'arrow-left':  '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  navigate:      '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  search:        '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  x:             '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',

  // Time & Date
  clock:         '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16.5 12"/>',
  calendar:      '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  'calendar-plus': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M12 14v4"/><path d="M10 16h4"/>',

  // People
  user:          '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:         '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user-plus':   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  handshake:     '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-1"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',

  // Communication
  bell:          '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chat:          '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail:          '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  send:          '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  share:         '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',

  // Media
  camera:        '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  image:         '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  eye:           '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':     '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',

  // Actions
  plus:          '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check:         '<path d="M20 6 9 17l-5-5"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  'x-circle':    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pencil:        '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  save:          '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  'trash-2':     '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  flag:          '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',

  // Status & Feedback
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info:          '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  star:          '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',

  // Settings & Security
  settings:      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  shield:        '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'file-text':   '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  lock:          '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key:           '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  moon:          '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  logout:        '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',

  // Place & Environment
  sun:           '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  building:      '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',

  // Sport & Activity
  trophy:        '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  swords:        '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="3" y1="17" y2="21"/>',
  gamepad:       '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="17" y1="13" y2="13"/><path d="M6 12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 20H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>',
  gauge:         '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  // Custom: Tischtennis-Schläger + Ball (outline, 24×24 viewBox, Lucide-Stil)
  'table-tennis': '<circle cx="9" cy="10" r="6"/><path d="M13.5 14.5 19 20"/><path d="M17.5 18.5a2 2 0 1 0 2.83-2.83"/><circle cx="21" cy="4" r="2"/>',
};

function ic(name, size) {
  const s = size || 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-3px;flex-shrink:0;">${_IC[name] || ''}</svg>`;
}

// ── AVATAR HELPERS ────────────────────────────────────────────────
const _AV_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1'];

function _avColor(name) {
  let h = 0;
  const n = name || '?';
  for(let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return _AV_COLORS[Math.abs(h) % _AV_COLORS.length];
}

function initAvatar(name, size) {
  size = size || 28;
  const n  = name || '';
  const fs = Math.round(size * 0.36);
  return `<div class="init-av" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${_avColor(n)};">${getInitials(n)}</div>`;
}

const _GAME_TYPE_META = {
  casual:       { label: 'Just 4 Fun',  cls: 'pill-casual'     },
  fun:          { label: 'Just 4 Fun',  cls: 'pill-casual'     },
  just4fun:     { label: 'Just 4 Fun',  cls: 'pill-casual'     },
  just_for_fun: { label: 'Just 4 Fun',  cls: 'pill-casual'     },
  training:     { label: 'Training',    cls: 'pill-training'   },
  punktspiel:   { label: 'Punktspiel',  cls: 'pill-punktspiel' },
  ranked:       { label: 'Punktspiel',  cls: 'pill-punktspiel' },
  competitive:  { label: 'Punktspiel',  cls: 'pill-punktspiel' },
};

function gameTypePill(type) {
  const meta = _GAME_TYPE_META[type];
  if (!meta) return '';
  return `<span class="ev-type-pill ${meta.cls}">${meta.label}</span>`;
}

function typeLabel(type) {
  return _GAME_TYPE_META[type]?.label || 'Spiel';
}

function userStatusLine(text) {
  if (!text) return '';
  return `<div class="ecb-user-status">${ic('check', 12)} ${text}</div>`;
}

// Zentraler Datumshelper für alle Event-/Spiel-Anzeigen
// Format: "So. 10. Juli, 14:00 Uhr" | "Heute, 14:00 Uhr" | "So. 10. Juli 2026, 14:00 Uhr"
// timeStr = null → kein Uhrzeitteil
function formatEventDateTime(dateStr, timeStr) {
  const WEEKDAYS = ['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'];
  const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli',
                    'August','September','Oktober','November','Dezember'];
  const timeLabel = timeStr ? `, ${timeStr} Uhr` : '';
  if (!dateStr) return `Datum offen${timeLabel}`;
  let d;
  try {
    const [y, mo, day] = dateStr.split('-').map(Number);
    d = new Date(y, mo - 1, day); // lokale Zeit, kein UTC-Offset
    if (isNaN(d.getTime())) throw 0;
  } catch (_) { return `Datum offen${timeLabel}`; }
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const tmrw     = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tmrwStr  = `${tmrw.getFullYear()}-${pad(tmrw.getMonth()+1)}-${pad(tmrw.getDate())}`;
  if (dateStr === todayStr) return `Heute${timeLabel}`;
  if (dateStr === tmrwStr)  return `Morgen${timeLabel}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}${timeLabel}`;
}

function formatEventDate(e) {
  // Wrapper mit Fallback für alte Fallback-Daten (kein dateStr, nur day+mon)
  if (!e.dateStr && (e.day || e.mon)) {
    const t = e.time ? `, ${e.time} Uhr` : '';
    return `${parseInt(e.day || '0', 10)}. ${e.mon || ''}${t}`;
  }
  return formatEventDateTime(e.dateStr || null, e.time || null);
}

// PlattenTreff Loader — springender Tischtennisball
// text: optional label (false = kein Text), small: .pt-loader--sm
function ptLoader(text, small) {
  const cls = small ? 'pt-loader pt-loader--sm' : 'pt-loader';
  const label = (text !== false && text) ? `<div class="pt-loader-text">${text}</div>` : '';
  return `<div class="${cls}">
    <div class="pt-loader-ball"></div>
    <div class="pt-loader-shadow"></div>
    <div class="pt-loader-line"></div>
    ${label}
  </div>`;
}

// ── SKELETON TEMPLATES ────────────────────────────────────────
function skeletonEventCard() {
  return `<div class="event-card-big" aria-hidden="true">
    <div class="ecb-thumb skeleton"></div>
    <div class="ecb-info" style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;gap:6px;">
        <div class="skeleton skeleton-pill" style="width:38px;height:15px;"></div>
        <div class="skeleton skeleton-pill" style="width:58px;height:15px;"></div>
      </div>
      <div class="skeleton skeleton-line skeleton-line--lg" style="width:68%;"></div>
      <div class="skeleton skeleton-line" style="width:50%;"></div>
      <div class="skeleton skeleton-line" style="width:44%;"></div>
      <div class="skeleton skeleton-line" style="width:48%;"></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
        <div class="skeleton skeleton-avatar" style="width:24px;height:24px;"></div>
        <div class="skeleton skeleton-avatar" style="width:24px;height:24px;"></div>
        <div class="skeleton skeleton-line" style="width:64px;height:9px;margin-left:2px;"></div>
      </div>
    </div>
  </div>`;
}

function skeletonPsCard() {
  return `<div class="player-search-card" aria-hidden="true">
    <div class="psc-profile" style="pointer-events:none;">
      <div class="skeleton skeleton-avatar" style="width:40px;height:40px;flex-shrink:0;"></div>
      <div class="psc-identity">
        <div class="skeleton skeleton-line skeleton-line--lg" style="width:120px;margin-bottom:7px;"></div>
        <div style="display:flex;gap:6px;">
          <div class="skeleton skeleton-pill" style="width:42px;height:14px;"></div>
          <div class="skeleton skeleton-pill" style="width:58px;height:14px;"></div>
        </div>
      </div>
    </div>
    <div class="skeleton skeleton-line skeleton-line--sm" style="width:58%;margin-top:8px;"></div>
  </div>`;
}

function skeletonMessageRow() {
  return `<div class="inbox-conv-row" aria-hidden="true" style="pointer-events:none;">
    <div class="inbox-conv-av"><div class="skeleton skeleton-avatar" style="width:44px;height:44px;"></div></div>
    <div class="inbox-conv-body">
      <div class="inbox-conv-top">
        <div class="skeleton skeleton-line" style="width:38%;height:13px;"></div>
        <div class="skeleton skeleton-line skeleton-line--sm" style="width:36px;"></div>
      </div>
      <div class="skeleton skeleton-line skeleton-line--sm" style="width:62%;margin-top:5px;"></div>
    </div>
  </div>`;
}

function skeletonComment() {
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);" aria-hidden="true">
    <div class="skeleton skeleton-avatar" style="width:32px;height:32px;flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
      <div class="skeleton skeleton-line skeleton-line--sm" style="width:28%;"></div>
      <div class="skeleton skeleton-line" style="width:72%;"></div>
    </div>
  </div>`;
}

function skeletonAdminRow() {
  return `<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);" aria-hidden="true">
    <div class="skeleton skeleton-avatar" style="width:40px;height:40px;flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:7px;">
      <div class="skeleton skeleton-line" style="width:55%;height:13px;"></div>
      <div class="skeleton skeleton-line skeleton-line--sm" style="width:40%;"></div>
    </div>
  </div>`;
}

function skeletonList(type, count) {
  count = count || 3;
  const fn = { event: skeletonEventCard, ps: skeletonPsCard, message: skeletonMessageRow, comment: skeletonComment, admin: skeletonAdminRow }[type] || skeletonAdminRow;
  return Array.from({length: count}, fn).join('');
}

// Encode attribute values (prevents XSS / quote-breakout in data attrs)
function escAttr(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Encode HTML text content
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Renders overlapping avatar stack (Slack/Notion style) — items are clickable
function participantStack(participants, maxShow, size) {
  maxShow = maxShow || 3;
  size    = size    || 24;
  if(!participants || !participants.length) return '';
  const visible = participants.slice(0, maxShow);
  const extra   = participants.length - maxShow;
  const fs = Math.round(size * 0.38);
  const items = visible.map(p => {
    const n   = p.username || '?';
    const uid = escAttr(p.id   || '');
    const nm  = escAttr(n);
    const em  = escAttr(p.avatar_emoji || '');
    const ur  = escAttr(p.avatar_url   || '');
    const clickHandler = `event.stopPropagation();showPlayerProfile(this.dataset.uid,this.dataset.name,this.dataset.emoji,null,this.dataset.url)`;
    const inner = getAvatarHtml(p, {size, extraStyle:'border:2px solid var(--surface);'});
    return `<div class="pstack-item pstack-clickable" data-uid="${uid}" data-name="${nm}" data-emoji="${em}" data-url="${ur}" onclick="${clickHandler}" style="width:${size}px;height:${size}px;">${inner}</div>`;
  }).join('');
  const extraHtml = extra > 0
    ? `<div class="pstack-item pstack-extra" style="width:${size}px;height:${size}px;font-size:${fs}px;">+${extra}</div>`
    : '';
  return `<div class="pstack">${items}${extraHtml}</div>`;
}
