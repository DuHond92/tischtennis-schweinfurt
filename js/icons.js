// ╔══════════════════════════════════════════════════════════════╗
// ║           LUCIDE ICONS (inline SVG helper)                   ║
// ╚══════════════════════════════════════════════════════════════╝
const _IC = {
  pin:      '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16.5 12"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell:     '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search:   '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  gamepad:  '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="17" y1="13" y2="13"/><path d="M6 12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 20H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>',
  trophy:   '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  swords:   '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="3" y1="17" y2="21"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  moon:     '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  user:     '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chat:     '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  gauge:    '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  navigate: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
};

function ic(name, size) {
  const s = size || 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0;">${_IC[name] || ''}</svg>`;
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
  const n  = name || '?';
  const fs = Math.round(size * 0.4);
  return `<div class="init-av" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${_avColor(n)};">${n[0].toUpperCase()}</div>`;
}

// Einheitliche Typ-Labels mit Emojis (single source of truth)
function typeLabel(type) {
  return type === 'casual'   ? '🎉 Just 4 Fun'
       : type === 'ranked'   ? '🏓 Spiel um Punkte'
       : type === 'training' ? '🎯 Training'
       : 'Spiel';
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
    const clickHandler = `event.stopPropagation();showPlayerProfile(this.dataset.uid,this.dataset.name,this.dataset.emoji)`;
    const inner = getAvatarHtml(p, {size, extraStyle:'border:2px solid var(--surface);'});
    return `<div class="pstack-item pstack-clickable" data-uid="${uid}" data-name="${nm}" data-emoji="${em}" onclick="${clickHandler}" style="width:${size}px;height:${size}px;">${inner}</div>`;
  }).join('');
  const extraHtml = extra > 0
    ? `<div class="pstack-item pstack-extra" style="width:${size}px;height:${size}px;font-size:${fs}px;">+${extra}</div>`
    : '';
  return `<div class="pstack">${items}${extraHtml}</div>`;
}
