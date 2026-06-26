// ╔══════════════════════════════════════════════════════════════╗
// ║           INBOX / DIREKTNACHRICHTEN                         ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId    = null;
let _dmPartnerName  = '';
let _dmPartnerEmoji = '';
let _dmPollTimer    = null;
let _dmUnreadCount  = 0;

// Expand-Zustand pro Kategorie (bleibt innerhalb einer Session erhalten)
let _inboxExpanded  = {};
// Archivierte Events — wird beim Rendern befüllt und für openArchivedChats genutzt
let _archivedEvents = [];

// Lösch-Dialog Zustand
let _pendingDeleteType = null;
let _pendingDeleteId   = null;

// ── localStorage: nutzerspezifisch gelöschte Chats ────────────
function _getHiddenChats() {
  try { return JSON.parse(localStorage.getItem('tt_hidden_chats') || '[]'); } catch { return []; }
}
function _hideChat(type, id) {
  const list = _getHiddenChats();
  const key  = String(id);
  if (!list.find(h => h.type === type && h.id === key))
    list.push({ type, id: key });
  localStorage.setItem('tt_hidden_chats', JSON.stringify(list));
}
function _isChatHidden(type, id) {
  return _getHiddenChats().some(h => h.type === type && h.id === String(id));
}

const INBOX_PREVIEW  = 3;      // sichtbare Chats pro Kategorie bevor "mehr"
const ARCHIVE_DAYS   = 14;     // Events nach X Tagen archivieren

// ── Badge ──────────────────────────────────────────────────────
function updateDmBadge(n) {
  _dmUnreadCount = n || 0;
  const el = document.getElementById('dm-badge');
  if (!el) return;
  el.textContent  = _dmUnreadCount > 9 ? '9+' : String(_dmUnreadCount);
  el.style.display = _dmUnreadCount > 0 ? '' : 'none';
}

async function checkDmNotifications() {
  if (!sb.isLoggedIn()) { updateDmBadge(0); return; }
  const uid = sb.getUserId();
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id&receiver_id=eq.${uid}&read_at=is.null&limit=50`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    updateDmBadge(Array.isArray(data) ? data.length : 0);
  } catch(e) {}
}

// ── Inbox öffnen ───────────────────────────────────────────────
async function openInbox() {
  if (!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  openSheet('inbox-sheet');
  await renderInboxChats();
}

// ── Inbox rendern ─────────────────────────────────────────────
async function renderInboxChats() {
  const el = document.getElementById('inbox-body');
  if (!el) return;

  if (!sb.isLoggedIn()) {
    el.innerHTML = _inboxEmpty('💬', 'Bitte melde dich an.');
    return;
  }

  el.innerHTML = _inboxEmpty('⏳', 'Lade Unterhaltungen…', true);

  const uid = sb.getUserId();

  // Parallel: DMs und Event-Beteiligungen laden
  const [dmMessages, eventData] = await Promise.all([
    _loadDmMessages(uid),
    _loadEventConversations(uid)
  ]);

  // ── Spielpartner (DMs) — werden NIE archiviert ──────────────
  const dmConvs = _groupDmsByPartner(dmMessages, uid);

  let dmProfiles = {};
  const partnerIds = dmConvs.map(c => c.partnerId).filter(Boolean);
  if (partnerIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${partnerIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { dmProfiles[p.id] = p; });
    } catch(e) {}
  }

  updateDmBadge(dmConvs.reduce((s, c) => s + c.unread, 0));

  // ── Archiv-Grenzwert ────────────────────────────────────────
  const archiveBefore = Date.now() - ARCHIVE_DAYS * 86_400_000;

  // Spielrunden: Events mit Datum > 14 Tage in der Vergangenheit → Archiv
  const allSpielrunden  = eventData.filter(e => e.mode !== 'player_search');
  const spielrunden     = allSpielrunden.filter(e => !_isArchivedEvent(e, archiveBefore));
  const archSpielrunden = allSpielrunden.filter(e =>  _isArchivedEvent(e, archiveBefore));

  // Mitspieler-Gesuche: vorerst nach Datum archivieren (gleiche Regel);
  // später erweiterbar um Status-Feld (z. B. status='closed')
  const allMitgesuch  = eventData.filter(e => e.mode === 'player_search');
  const mitgesuch     = allMitgesuch.filter(e => !_isArchivedEvent(e, archiveBefore));
  const archMitgesuch = allMitgesuch.filter(e =>  _isArchivedEvent(e, archiveBefore));

  // Archivliste merken (für openArchivedChats)
  _archivedEvents = [...archSpielrunden, ...archMitgesuch];

  // ── HTML aufbauen ───────────────────────────────────────────
  const renderDm = c => _renderDmRow(c, dmProfiles, uid);
  let html = '';

  html += _renderSection('spielpartner', '👤 Spielpartner',      dmConvs,    renderDm);
  html += _renderSection('spielrunden',  '🏓 Spielrunden',       spielrunden, _renderEventRow);
  html += _renderSection('mitgesuch',    '🔍 Mitspieler gesucht', mitgesuch,  _renderEventRow);

  if (!html) {
    html = _inboxEmpty('💬', 'Noch keine Unterhaltungen.<br>Schreib einem Spielpartner!');
  }

  // Archiv-Zeile (immer ganz unten)
  html += _renderArchiveRow(_archivedEvents.length);

  el.innerHTML = html;
}

// ── Archivierungs-Logik ───────────────────────────────────────

function _isArchivedEvent(event, archiveBefore) {
  if (!event.event_date) return false;
  return new Date(event.event_date).getTime() < archiveBefore;
}

// ── Kollabierbare Sektions-Renderer ──────────────────────────

function _renderSection(key, label, items, renderFn) {
  if (!items.length) return '';

  const visible  = items.slice(0, INBOX_PREVIEW);
  const hidden   = items.slice(INBOX_PREVIEW);
  const expanded = _inboxExpanded[key] || false;

  let html = `<div class="inbox-section-label">${label}</div>`;
  html += visible.map(renderFn).join('');

  if (hidden.length) {
    const moreStyle = expanded ? '' : 'style="display:none;"';
    html += `<div id="inbox-more-${key}" ${moreStyle}>`;
    html += hidden.map(renderFn).join('');
    html += `</div>`;

    const btnLabel = expanded
      ? 'Weniger anzeigen ↑'
      : `+ ${hidden.length} weitere`;
    html += `<button class="inbox-expand-btn"
      data-key="${key}"
      data-hidden="${hidden.length}"
      onclick="toggleInboxSection('${key}', this)">${btnLabel}</button>`;
  }

  return html;
}

function toggleInboxSection(key, btn) {
  _inboxExpanded[key] = !_inboxExpanded[key];
  const moreEl = document.getElementById('inbox-more-' + key);
  if (moreEl) moreEl.style.display = _inboxExpanded[key] ? '' : 'none';
  if (btn) btn.textContent = _inboxExpanded[key]
    ? 'Weniger anzeigen ↑'
    : `+ ${btn.dataset.hidden} weitere`;
}

// ── Archiv-Zeile ──────────────────────────────────────────────

function _renderArchiveRow(count) {
  if (!count) return '';
  return `
    <div class="inbox-archive-row" onclick="openArchivedChats()">
      <span class="inbox-archive-icon">📦</span>
      <span class="inbox-archive-label">Archivierte Unterhaltungen</span>
      <span class="inbox-archive-badge">${count}</span>
      <span class="inbox-archive-chevron">›</span>
    </div>`;
}

function openArchivedChats() {
  // Volle Archiv-Ansicht wird in einer späteren Version implementiert.
  // Vorerst: direkte Einblendung unterhalb der Archiv-Zeile.
  const row = document.querySelector('.inbox-archive-row');
  if (!row) return;

  const existing = document.getElementById('inbox-archive-detail');
  if (existing) { existing.remove(); return; }

  const detail = document.createElement('div');
  detail.id = 'inbox-archive-detail';
  detail.className = 'inbox-archive-detail';

  if (!_archivedEvents.length) {
    detail.innerHTML = _inboxEmpty('📭', 'Keine archivierten Unterhaltungen.');
  } else {
    detail.innerHTML =
      `<div class="inbox-section-label" style="padding-top:12px;">Archiv</div>` +
      _archivedEvents.map(e => _renderEventRow(e, true)).join('');
  }

  row.insertAdjacentElement('afterend', detail);
}

// ── Löschen: Bestätigungs-Dialog ──────────────────────────────

function initDeleteChat(type, id, name) {
  _pendingDeleteType = type;
  _pendingDeleteId   = String(id);

  let dlg = document.getElementById('inbox-delete-dlg');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'inbox-delete-dlg';
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = `
    <div class="idlg-backdrop" onclick="cancelDeleteChat()"></div>
    <div class="idlg-box">
      <div class="idlg-title">Chat löschen?</div>
      <div class="idlg-body">„${escHtml(name)}" wird nur aus <b>deiner</b> Liste entfernt.
        Nachrichten anderer Teilnehmer bleiben unberührt.</div>
      <div class="idlg-actions">
        <button class="idlg-btn-cancel" onclick="cancelDeleteChat()">Abbrechen</button>
        <button class="idlg-btn-delete" onclick="confirmDeleteChat()">Löschen</button>
      </div>
    </div>`;
  dlg.style.display = 'flex';
}

function cancelDeleteChat() {
  const dlg = document.getElementById('inbox-delete-dlg');
  if (dlg) dlg.style.display = 'none';
  _pendingDeleteType = null;
  _pendingDeleteId   = null;
}

function confirmDeleteChat() {
  if (!_pendingDeleteType || !_pendingDeleteId) return;
  _hideChat(_pendingDeleteType, _pendingDeleteId);
  cancelDeleteChat();
  // Archiv-Detail neu rendern ohne vollen Reload
  const detail = document.getElementById('inbox-archive-detail');
  if (detail) {
    const remaining = _archivedEvents.filter(e => !_isChatHidden('event', e.id));
    if (!remaining.length) {
      detail.remove();
      document.querySelector('.inbox-archive-row')?.remove();
    } else {
      detail.innerHTML =
        `<div class="inbox-section-label" style="padding-top:12px;">Archiv</div>` +
        remaining.map(e => _renderEventRow(e, true)).join('');
      // Badge aktualisieren
      const badge = document.querySelector('.inbox-archive-badge');
      if (badge) badge.textContent = remaining.length;
    }
  } else {
    renderInboxChats();
  }
}

// ── Datenlader ────────────────────────────────────────────────

async function _loadDmMessages(uid) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id,sender_id,receiver_id,message,created_at,read_at&or=(sender_id.eq.${uid},receiver_id.eq.${uid})&order=created_at.desc&limit=200`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    return data || [];
  } catch(e) { return []; }
}

async function _loadEventConversations(uid) {
  let eventIds = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/event_participants?select=event_id&user_id=eq.${uid}`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) eventIds = data.map(r => r.event_id).filter(Boolean);
  } catch(e) {}

  // Eigene Mitspieler-Gesuche ergänzen (Creator ohne eigenen Teilnahme-Eintrag)
  try {
    const url = `${SUPABASE_URL}/rest/v1/events?select=id&creator_id=eq.${uid}&mode=eq.player_search`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) data.forEach(r => {
      if (!eventIds.includes(r.id)) eventIds.push(r.id);
    });
  } catch(e) {}

  // Mitspieler-Gesuche ergänzen, in denen der Nutzer mindestens eine Nachricht geschrieben hat
  try {
    const msgUrl = `${SUPABASE_URL}/rest/v1/event_messages?select=event_id&user_id=eq.${uid}`;
    const { data: msgData } = await fetchWithRefresh(msgUrl, { headers: dbHeaders() });
    if (Array.isArray(msgData)) {
      const msgEventIds = [...new Set(msgData.map(r => r.event_id).filter(Boolean))];
      if (msgEventIds.length) {
        const evUrl = `${SUPABASE_URL}/rest/v1/events?select=id&mode=eq.player_search&id=in.(${msgEventIds.join(',')})`;
        const { data: psEvData } = await fetchWithRefresh(evUrl, { headers: dbHeaders() });
        if (Array.isArray(psEvData)) psEvData.forEach(r => {
          if (!eventIds.includes(r.id)) eventIds.push(r.id);
        });
      }
    }
  } catch(e) {}

  if (!eventIds.length) return [];

  let events = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/events?select=id,title,mode,event_date&id=in.(${eventIds.join(',')})`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    events = data || [];
  } catch(e) { return []; }

  // Letzte Nachricht pro Event
  let lastMsgs = {};
  try {
    const url = `${SUPABASE_URL}/rest/v1/event_messages?select=event_id,message,created_at,profiles(username,avatar_emoji,avatar_url)&event_id=in.(${eventIds.join(',')})&order=created_at.desc&limit=${eventIds.length * 5}`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) data.forEach(m => {
      if (!lastMsgs[m.event_id]) lastMsgs[m.event_id] = m;
    });
  } catch(e) {}

  // Ungelesene Benachrichtigungen aus pendingNotifs
  const unreadByEvent = {};
  (typeof pendingNotifs !== 'undefined' ? pendingNotifs : []).forEach(m => {
    unreadByEvent[m.event_id] = (unreadByEvent[m.event_id] || 0) + 1;
  });

  return events
    .map(e => ({ ...e, lastMsg: lastMsgs[e.id] || null, unread: unreadByEvent[e.id] || 0 }))
    .filter(e => !_isChatHidden('event', e.id))
    .sort((a, b) => {
      const ta = a.lastMsg?.created_at || a.event_date || '';
      const tb = b.lastMsg?.created_at || b.event_date || '';
      return tb.localeCompare(ta);
    });
}

// ── Render-Helfer ─────────────────────────────────────────────

function _groupDmsByPartner(messages, uid) {
  const convMap = {};
  messages.forEach(m => {
    const partnerId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!convMap[partnerId]) convMap[partnerId] = { partnerId, lastMsg: m, unread: 0 };
    if (m.receiver_id === uid && !m.read_at) convMap[partnerId].unread++;
  });
  return Object.values(convMap)
    .filter(c => !_isChatHidden('dm', c.partnerId))
    .sort((a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
}

function _renderDmRow(c, profiles, uid) {
  const p      = profiles[c.partnerId] || { id: c.partnerId, username: 'Spieler' };
  const av     = getAvatarHtml(p, { size: 56 });
  const nm     = escHtml(p.username || 'Spieler');
  const pid    = escAttr(c.partnerId);
  const pnm    = escAttr(p.username || 'Spieler');
  const pem    = escAttr(p.avatar_emoji || '');
  const isMine = c.lastMsg.sender_id === uid;
  const prev   = c.lastMsg.message.length > 60
    ? c.lastMsg.message.slice(0, 60) + '…' : c.lastMsg.message;
  const time   = _dmTime(c.lastMsg.created_at);
  const hasNew = c.unread > 0;
  return `
    <div class="inbox-conv-row" onclick="openDmFromInbox('${pid}','${pnm}','${pem}')">
      <div class="inbox-conv-av">${av}</div>
      <div class="inbox-conv-body">
        <div class="inbox-conv-top">
          <div class="inbox-conv-name${hasNew ? ' inbox-conv-name-bold' : ''}">${nm}</div>
          <div class="inbox-conv-time${hasNew ? ' inbox-conv-time-bold' : ''}">${time}</div>
        </div>
        <div class="inbox-conv-bottom">
          <div class="inbox-conv-preview${hasNew ? ' inbox-conv-preview-bold' : ''}">
            ${isMine ? '<span class="inbox-conv-mine">Du: </span>' : ''}${escHtml(prev)}
          </div>
          ${hasNew ? `<span class="inbox-conv-badge">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _renderEventRow(e, deletable = false) {
  const last   = e.lastMsg;
  const sender = last?.profiles?.username || '';
  const prev   = last
    ? (sender ? sender + ': ' : '') + (last.message.length > 55 ? last.message.slice(0, 55) + '…' : last.message)
    : 'Noch keine Nachrichten';
  const time   = last ? _dmTime(last.created_at) : '';
  const hasNew = e.unread > 0;
  const avHtml = last?.profiles
    ? getAvatarHtml(last.profiles, { size: 56 })
    : `<div class="inbox-event-av">${e.mode === 'player_search' ? '🔍' : '🏓'}</div>`;
  const title  = escAttr(e.title || 'Spielrunde');
  const delBtn = deletable ? `
    <button class="inbox-delete-btn" title="Aus Archiv entfernen"
      onclick="event.stopPropagation();initDeleteChat('event','${e.id}','${title}')">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
    </button>` : '';
  return `
    <div class="inbox-conv-row${deletable ? ' inbox-conv-row-arch' : ''}" onclick="closeAllSheets();openNotifEvent(${e.id})">
      <div class="inbox-conv-av">${avHtml}</div>
      <div class="inbox-conv-body">
        <div class="inbox-conv-top">
          <div class="inbox-conv-name${hasNew ? ' inbox-conv-name-bold' : ''}">${escHtml(e.title || 'Spielrunde')}</div>
          <div class="inbox-conv-time${hasNew ? ' inbox-conv-time-bold' : ''}">${time}</div>
        </div>
        <div class="inbox-conv-bottom">
          <div class="inbox-conv-preview${hasNew ? ' inbox-conv-preview-bold' : ''}">${escHtml(prev)}</div>
          ${hasNew ? `<span class="inbox-conv-badge">${e.unread > 9 ? '9+' : e.unread}</span>` : ''}
        </div>
      </div>
      ${delBtn}
    </div>`;
}

function _inboxEmpty(icon, text, dim) {
  return `<div class="inbox-empty${dim ? ' inbox-empty-dim' : ''}">
    <div class="inbox-empty-icon">${icon}</div><div>${text}</div>
  </div>`;
}

// ── DM Konversation ────────────────────────────────────────────

async function openDmFromInbox(partnerId, partnerName, partnerEmoji) {
  await openDmConversation(partnerId, partnerName, partnerEmoji);
}

async function openDmFromProfile() {
  if (!_dmPartnerId) return;
  closeAllSheets();
  await openDmConversation(_dmPartnerId, _dmPartnerName, _dmPartnerEmoji);
}

async function openDmConversation(partnerId, partnerName, partnerEmoji) {
  if (!sb.isLoggedIn()) { openSheet('auth-sheet'); return; }
  _dmPartnerId    = partnerId;
  _dmPartnerName  = partnerName || 'Spieler';
  _dmPartnerEmoji = partnerEmoji || '';

  const headerEl = document.getElementById('dm-partner-name');
  const avEl     = document.getElementById('dm-partner-av');
  if (headerEl) headerEl.textContent = _dmPartnerName;
  if (avEl) avEl.innerHTML = getAvatarHtml(
    { avatar_emoji: _dmPartnerEmoji, username: _dmPartnerName }, { size: 34 }
  );

  document.getElementById('dm-feed').innerHTML = '<div class="chat-empty">Lade Nachrichten…</div>';
  document.getElementById('dm-overlay').classList.add('open');
  document.getElementById('dm-sheet').classList.add('open');

  await loadDmMessages();
  startDmPolling();
  await markDmRead();
}

function closeDmSheet() {
  stopDmPolling();
  document.getElementById('dm-overlay').classList.remove('open');
  document.getElementById('dm-sheet').classList.remove('open');
}

async function loadDmMessages() {
  const el = document.getElementById('dm-feed');
  if (!el || !_dmPartnerId) return;
  const uid = sb.getUserId();
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id,sender_id,receiver_id,message,created_at,read_at&or=(and(sender_id.eq.${uid},receiver_id.eq.${_dmPartnerId}),and(sender_id.eq.${_dmPartnerId},receiver_id.eq.${uid}))&order=created_at.asc&limit=200`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    _renderDmMessages(data || []);
  } catch(e) {
    el.innerHTML = '<div class="chat-empty">Fehler beim Laden.</div>';
  }
}

function _renderDmMessages(messages) {
  const el  = document.getElementById('dm-feed');
  if (!el) return;
  const uid   = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Nachrichten – schreib als Erster! 💬</div>';
    return;
  }
  let lastDate = '';
  el.innerHTML = messages.map(m => {
    const isMine  = m.sender_id === uid;
    const msgDate = new Date(m.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const time    = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const del     = isMod ? ` <button class="msg-delete-btn" onclick="deleteDm('${escAttr(m.id)}')">🗑</button>` : '';
    const preview = escAttr((m.message || '').slice(0, 80));
    const report  = (!isMod && sb.isLoggedIn() && !isMine)
      ? ` <button class="report-btn" data-type="direct_message" data-id="${escAttr(m.id)}" data-preview="${preview}" onclick="openReportFromBtn(this)" title="Melden">🚩</button>`
      : '';
    let sep = '';
    if (msgDate !== lastDate) {
      sep = `<div class="dm-date-sep"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }
    return `${sep}<div class="dm-msg ${isMine ? 'dm-mine' : 'dm-theirs'}">
      <div class="dm-bubble">${escHtml(m.message)}</div>
      <div class="dm-meta">${time}${del}${report}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function deleteDm(messageId) {
  if (!confirm('Nachricht wirklich löschen?')) return;
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/direct_messages?id=eq.${encodeURIComponent(messageId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }
  _logModAction('delete_dm', 'direct_message', messageId);
  showToast('Nachricht gelöscht');
  await loadDmMessages();
}

async function sendDm() {
  if (!sb.isLoggedIn()) { showToast('Bitte zuerst anmelden', '⚠️'); return; }
  const input = document.getElementById('dm-input');
  const msg   = input.value.trim();
  if (!msg || !_dmPartnerId) return;
  input.value = '';
  const uid = sb.getUserId();
  const { ok } = await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/direct_messages`, {
    method:  'POST',
    headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ sender_id: uid, receiver_id: _dmPartnerId, message: msg })
  });
  if (!ok) { showToast('Fehler beim Senden', '❌'); input.value = msg; return; }
  await loadDmMessages();
}

async function markDmRead() {
  if (!sb.isLoggedIn() || !_dmPartnerId) return;
  const uid = sb.getUserId();
  try {
    await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/direct_messages?receiver_id=eq.${uid}&sender_id=eq.${encodeURIComponent(_dmPartnerId)}&read_at=is.null`,
      {
        method:  'PATCH',
        headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ read_at: new Date().toISOString() })
      }
    );
    checkDmNotifications();
  } catch(e) {}
}

function startDmPolling() {
  stopDmPolling();
  _dmPollTimer = setInterval(async () => {
    if (_dmPartnerId) { await loadDmMessages(); await markDmRead(); }
  }, 4000);
}

function stopDmPolling() {
  if (_dmPollTimer) { clearInterval(_dmPollTimer); _dmPollTimer = null; }
}

function _dmTime(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)    return 'Gerade';
  if (diff < 3600)  return `${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} Std.`;
  const d     = new Date(isoStr);
  const today = new Date();
  if (d.getFullYear() === today.getFullYear())
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function onDmInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
}
