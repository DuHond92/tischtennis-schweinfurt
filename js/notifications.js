// ╔══════════════════════════════════════════════════════════════╗
// ║           NOTIFICATIONS (Verlauf, Badge, Read/Delete)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// State-Modell:
//  _allRecentMessages   — Chat-Nachrichten der letzten 7 Tage (Sheet-Verlauf)
//  pendingNotifs        — davon nur die ungelesenen (Badge-Quelle)
//  _systemNotifs        — alle nicht-gelöschten System-Notifs (read_at gesetzt = gelesen)
//
// Trennung: "gelesen" (read_at gesetzt) ≠ "gelöscht" (deleted_at gesetzt / aus localStorage)
// Das Öffnen oder Schließen des Sheets löscht KEINE Einträge.

let notifPollTimer     = null;
let _notifSeenTimer    = null;
let pendingNotifs      = [];   // ungelesene Chat-Nachrichten  (Badge)
let _allRecentMessages = [];   // alle Chat-Nachrichten, 7 Tage (Sheet)
let _systemNotifs      = [];   // nicht-gelöschte System-Notifs (report_resolved, suggestion_approved)

// ── Lokal versteckte Nachrichten (Soft-Delete, localStorage) ────

function _getHiddenMsgIds() {
  try { return new Set(JSON.parse(localStorage.getItem('_pt_hidden_msgs') || '[]')); }
  catch { return new Set(); }
}
function _addHiddenMsgId(id) {
  const s = _getHiddenMsgIds();
  s.add(String(id));
  localStorage.setItem('_pt_hidden_msgs', JSON.stringify([...s].slice(-300)));
}
function _clearHiddenMsgIds() {
  localStorage.removeItem('_pt_hidden_msgs');
}

// ── Badge ─────────────────────────────────────────────────────────

function showNotifBadge(count) {
  const dot = document.getElementById('notif-badge');
  if (!dot) return;
  dot.textContent = count > 9 ? '9+' : String(count);
  dot.style.display = '';
}
function hideNotifBadge() {
  const dot = document.getElementById('notif-badge');
  if (dot) dot.style.display = 'none';
}
function _updateBadgeCount() {
  const unreadSys = _systemNotifs.filter(n => !n.read_at).length;
  const total     = pendingNotifs.length + (pendingConnectionRequests?.length || 0) + unreadSys;
  total > 0 ? showNotifBadge(total) : hideNotifBadge();
}

// ── Polling ───────────────────────────────────────────────────────

async function checkNotifications() {
  if (!sb.isLoggedIn()) {
    hideNotifBadge();
    pendingNotifs = []; _allRecentMessages = [];
    return;
  }
  if (localStorage.getItem('tt_notifs_enabled') === '0') {
    hideNotifBadge();
    return;
  }
  const userId = sb.getUserId();

  // 1. Events & Gesuche wo User beteiligt ist
  const creatorIds   = allEvents.filter(e => e.creatorId === userId).map(e => e.id);
  const psCreatorIds = allPlayerSearches.filter(ps => ps.userId === userId).map(ps => ps.id);
  let participantIds   = [];
  let psParticipantIds = [];
  const allPsIds = allPlayerSearches.map(ps => ps.id);

  await Promise.all([
    (async () => {
      try {
        const qb = new QueryBuilder('event_participants');
        qb._select = 'event_id'; qb.eq('user_id', userId);
        const { data } = await qb.execute();
        if (data) participantIds = data.map(p => p.event_id);
      } catch(e) { console.warn('notif: participant query failed', e); }
    })(),
    allPsIds.length ? (async () => {
      try {
        const url = `${SUPABASE_URL}/rest/v1/event_messages?select=event_id&user_id=eq.${userId}&event_id=in.(${allPsIds.join(',')})`;
        const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
        if (Array.isArray(data)) psParticipantIds = [...new Set(data.map(m => m.event_id))];
      } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[notif] psParticipant:', e); }
    })() : Promise.resolve()
  ]);

  const myEventIds = [...new Set([...creatorIds, ...participantIds, ...psCreatorIds, ...psParticipantIds])];

  // 2. Chat-Nachrichten der letzten 7 Tage (Verlauf — NICHT auf seen_chat_* gefiltert)
  if (myEventIds.length) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const url = `${SUPABASE_URL}/rest/v1/event_messages`
        + `?select=id,message,created_at,user_id,event_id`
        + `&event_id=in.(${myEventIds.join(',')})`
        + `&user_id=neq.${userId}`
        + `&created_at=gt.${sevenDaysAgo}`
        + `&order=created_at.desc&limit=100`;
      const { data: msgData } = await fetchWithRefresh(url, { headers: dbHeaders() });
      const rawMsgs = Array.isArray(msgData) ? msgData : [];
      // Profiles separat laden (stabiler als PostgREST embedded join)
      const profMap = {};
      const uIds = [...new Set(rawMsgs.map(m => m.user_id).filter(Boolean))];
      if (uIds.length) {
        const profUrl = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${uIds.join(',')})`;
        const {ok, data: profs} = await fetchWithRefresh(profUrl, {headers: dbHeaders()});
        if (ok && Array.isArray(profs)) profs.forEach(p => { profMap[p.id] = p; });
      }
      const messages = rawMsgs.map(m => ({...m, profiles: profMap[m.user_id] || null}));
      const hiddenIds  = _getHiddenMsgIds();
      _allRecentMessages = messages.filter(m => !hiddenIds.has(String(m.id)));
      // Badge-Quelle: nur echte Ungelesene
      pendingNotifs = _allRecentMessages.filter(m => {
        const seenTs = localStorage.getItem('seen_chat_' + m.event_id) || '1970-01-01T00:00:00Z';
        return m.created_at > seenTs;
      });
    } catch(e) { console.warn('notif: message query failed', e); }
  } else {
    pendingNotifs = []; _allRecentMessages = [];
  }

  if (typeof checkConnectionNotifications === 'function') await checkConnectionNotifications();
  if (typeof _pollAdminCounts === 'function') await _pollAdminCounts();

  // 3. System-Notifs: ALLE nicht-gelöschten (gelesen + ungelesen sichtbar)
  try {
    const url = `${SUPABASE_URL}/rest/v1/notifications`
      + `?user_id=eq.${userId}`
      + `&deleted_at=is.null`
      + `&type=in.(report_resolved,suggestion_approved)`
      + `&order=created_at.desc&limit=50`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    _systemNotifs = data || [];
  } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[notif] systemNotifs fetch:', e); }

  _updateBadgeCount();
}

// ── Als gesehen markieren ─────────────────────────────────────────
// Aktualisiert nur den seen_chat_*-Timestamp und den Badge.
// _allRecentMessages bleibt für den Verlauf erhalten.

function markEventSeen(eventId) {
  if (!eventId) return;
  localStorage.setItem('seen_chat_' + eventId, new Date().toISOString());
  pendingNotifs = pendingNotifs.filter(m => m.event_id !== eventId);
  _updateBadgeCount();
}

function markAllSeen() {
  const now = new Date().toISOString();
  [...new Set(_allRecentMessages.map(m => m.event_id))].forEach(id =>
    localStorage.setItem('seen_chat_' + id, now)
  );
  pendingNotifs = [];
  _updateBadgeCount();
  renderNotifSheet(); // Sheet neu rendern: ungelesen → gelesen
}

// ── System-Notifs als gelesen markieren ──────────────────────────
// Setzt read_at, löscht NICHT aus dem Verlauf.

async function _markSystemNotifsRead() {
  const unread = _systemNotifs.filter(n => !n.read_at);
  if (!unread.length) return;
  const now = new Date().toISOString();
  const ids  = unread.map(n => n.id);
  // In-Memory aktualisieren
  _systemNotifs = _systemNotifs.map(n => n.read_at ? n : { ...n, read_at: now });
  _updateBadgeCount();
  renderNotifSheet();
  // DB persistieren
  try {
    await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/notifications?id=in.(${ids.map(id => encodeURIComponent(id)).join(',')})`,
      { method: 'PATCH', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read_at: now }) }
    );
  } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[notif] markSystemRead:', e); }
}

// ── Löschen ───────────────────────────────────────────────────────

function _deleteSystemNotif(id) {
  _systemNotifs = _systemNotifs.filter(n => n.id !== id);
  _updateBadgeCount();
  renderNotifSheet();
  fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }) }
  ).catch(() => {});
}

function _deleteMsgNotif(msgId) {
  _addHiddenMsgId(msgId);
  const sid = String(msgId);
  _allRecentMessages = _allRecentMessages.filter(m => String(m.id) !== sid);
  pendingNotifs      = pendingNotifs.filter(m => String(m.id) !== sid);
  _updateBadgeCount();
  renderNotifSheet();
}

function _showDeleteAllConfirm() {
  const body = document.getElementById('notif-body');
  if (!body) return;
  const overlay = document.createElement('div');
  overlay.id = 'notif-confirm-overlay';
  overlay.className = 'notif-confirm-overlay';
  overlay.innerHTML = `
    <div class="notif-confirm-card">
      <div class="notif-confirm-title">Alle Benachrichtigungen löschen?</div>
      <div class="notif-confirm-msg">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
      <div class="notif-confirm-actions">
        <button class="notif-confirm-btn notif-confirm-btn--cancel" onclick="renderNotifSheet()">Abbrechen</button>
        <button class="notif-confirm-btn notif-confirm-btn--danger" onclick="_confirmDeleteAll()">Alle löschen</button>
      </div>
    </div>`;
  body.appendChild(overlay);
}

async function _confirmDeleteAll() {
  const userId = sb.getUserId();
  // System-Notifs
  _systemNotifs = [];
  fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&deleted_at=is.null`,
    { method: 'PATCH', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }) }
  ).catch(() => {});
  // Chat-Nachrichten
  _allRecentMessages.forEach(m => _addHiddenMsgId(String(m.id)));
  _allRecentMessages = [];
  pendingNotifs = [];
  _updateBadgeCount();
  renderNotifSheet();
}

// ── Sheet öffnen ──────────────────────────────────────────────────

function openNotifSheet() {
  _cancelNotifSeenTimers();
  renderNotifSheet();
  openSheet('notif-sheet');
  // Nach 1,2 s als gelesen markieren — Einträge bleiben im Verlauf sichtbar
  _notifSeenTimer = setTimeout(() => {
    _notifSeenTimer = null;
    const sheet = document.getElementById('notif-sheet');
    if (!sheet?.classList.contains('open')) return;
    if (document.visibilityState !== 'visible') return;
    markAllSeen();
    _markSystemNotifsRead();
  }, 1200);
}

function _cancelNotifSeenTimers() {
  if (_notifSeenTimer) { clearTimeout(_notifSeenTimer); _notifSeenTimer = null; }
}

// ── Sheet rendern ─────────────────────────────────────────────────

function renderNotifSheet() {
  const body = document.getElementById('notif-body');
  if (!body) return;

  if (!sb.isLoggedIn()) {
    body.innerHTML = `<div class="notif-empty">
      <div class="notif-empty-icon">${ic('bell', 36)}</div>
      <div>Melde dich an, um Benachrichtigungen zu sehen.</div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px;"
        onclick="closeAllSheets();openSheet('auth-sheet')">Anmelden</button>
    </div>`;
    return;
  }

  const hasSys  = _systemNotifs.length > 0;
  const hasMsgs = _allRecentMessages.length > 0;
  const hasConn = !!(pendingConnectionRequests?.length);

  if (!hasSys && !hasMsgs && !hasConn) {
    body.innerHTML = `<div class="notif-empty">
      <div class="notif-empty-icon">${ic('check-circle', 36)}</div>
      <div>Noch keine Benachrichtigungen</div>
    </div>`;
    return;
  }

  // ── Header-Aktionen ──────────────────────────────────────────────
  const headerHtml = `<div class="notif-sheet-actions">
    <button class="notif-action-link" onclick="_showDeleteAllConfirm()">Alle löschen</button>
  </div>`;

  // ── System-Notifs ────────────────────────────────────────────────
  const systemHtml = _systemNotifs.map(n => {
    const unread    = !n.read_at;
    const time      = _notifTime(n.created_at);
    const icon      = n.type === 'suggestion_approved' ? ic('table-tennis', 20) : ic('bell', 20);
    const cls       = `notif-item${unread ? ' notif-item--unread' : ' notif-item--read'} notif-item--system`;
    return `<div class="${cls}" onclick="_tapSystemNotif('${escAttr(n.id)}')">
      <div class="notif-report-icon">${icon}</div>
      <div class="notif-content">
        <div class="notif-title">${unread ? `<b>${escHtml(n.title || '')}</b>` : escHtml(n.title || '')}</div>
        <div class="notif-preview">${escHtml(n.body || '')}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${unread ? '<div class="notif-dot"></div>' : '<div class="notif-dot notif-dot--hidden"></div>'}
      <button class="notif-delete-btn" onclick="event.stopPropagation();_deleteSystemNotif('${escAttr(n.id)}')" aria-label="Löschen">${ic('x', 14)}</button>
    </div>`;
  }).join('');

  // ── Verbindungsanfragen ──────────────────────────────────────────
  const connHtml = typeof renderConnectionRequestNotifs === 'function'
    ? renderConnectionRequestNotifs() : '';

  // ── Chat-Nachrichten ─────────────────────────────────────────────
  const evMap = {};
  allEvents.forEach(e => { evMap[e.id] = e; });
  allPlayerSearches.forEach(ps => {
    if (!evMap[ps.id]) evMap[ps.id] = { id: ps.id, name: (ps.username || '') + ' sucht Mitspieler' };
  });

  const msgHtml = _allRecentMessages.slice(0, 30).map(m => {
    const seenTs  = localStorage.getItem('seen_chat_' + m.event_id) || '1970-01-01T00:00:00Z';
    const unread  = m.created_at > seenTs;
    const ev      = evMap[m.event_id];
    const evTitle = ev ? ev.name : 'Mitspieler-Gesuch';
    const isPs    = allPlayerSearches.some(ps => ps.id === m.event_id);
    const verb    = isPs ? 'hat geantwortet' : 'hat kommentiert';
    const sender  = m.profiles?.username || 'Jemand';
    const emoji   = m.profiles?.avatar_emoji || '';
    const avUrl   = m.profiles?.avatar_url   || '';
    const uid     = m.user_id || '';
    const avClick = uid ? `onclick="event.stopPropagation();showPlayerProfile('${escAttr(uid)}','${escAttr(sender)}','${escAttr(emoji)}',null,'${escAttr(avUrl)}')"` : '';
    const avHtml  = getAvatarHtml(m.profiles, { size: 38 });
    const preview = m.message.length > 60 ? m.message.slice(0, 60) + '…' : m.message;
    const time    = _notifTime(m.created_at);
    const cls     = `notif-item${unread ? ' notif-item--unread' : ' notif-item--read'}`;
    return `<div class="${cls}" onclick="openNotifEvent(${m.event_id})">
      <div class="notif-av pp-clickable" ${avClick}>${avHtml}</div>
      <div class="notif-content">
        <div class="notif-title">${unread ? `<b>${escHtml(sender)} ${verb}</b> in „${escHtml(evTitle)}"` : `${escHtml(sender)} ${verb} in „${escHtml(evTitle)}"`}</div>
        <div class="notif-preview">${escHtml(preview)}</div>
        <div class="notif-time">${time}</div>
      </div>
      ${unread ? '<div class="notif-dot"></div>' : '<div class="notif-dot notif-dot--hidden"></div>'}
      <button class="notif-delete-btn" onclick="event.stopPropagation();_deleteMsgNotif(${m.id})" aria-label="Löschen">${ic('x', 14)}</button>
    </div>`;
  }).join('');

  body.innerHTML = headerHtml + systemHtml + connHtml + msgHtml;
}

// ── System-Notif antippen → als gelesen + navigieren ─────────────

function _tapSystemNotif(id) {
  const n = _systemNotifs.find(x => x.id === id);
  if (!n) return;
  // Als gelesen markieren (falls noch nicht)
  if (!n.read_at) {
    const now = new Date().toISOString();
    _systemNotifs = _systemNotifs.map(x => x.id === id ? { ...x, read_at: now } : x);
    _updateBadgeCount();
    renderNotifSheet();
    fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ read_at: now }) }
    ).catch(() => {});
  }
  // Navigation zum zugehörigen Inhalt
  const d = n.data || {};
  if (n.type === 'suggestion_approved' && d.suggestion_id) {
    closeAllSheets();
    const t = tables.find(t => t.id === d.suggestion_id);
    if (t) showTableDetail(t.id);
    else showToast('Platte nicht mehr verfügbar', 'info');
  } else if (n.type === 'report_resolved' && d.content_type) {
    closeAllSheets();
  }
}

// ── Klick auf Chat-Benachrichtigung → Event / Gesuch öffnen ──────

function openNotifEvent(eventId) {
  markEventSeen(eventId);
  closeAllSheets();
  if (allPlayerSearches.some(ps => ps.id === eventId)) {
    showPlayerSearchDetail(eventId);
  } else {
    const ev = allEvents.find(e => e.id === eventId);
    if (ev) {
      showEventDetail(eventId);
    } else {
      showToast('Dieses Spiel existiert nicht mehr', 'info');
    }
  }
}

// ── Zeitformatierung ─────────────────────────────────────────────

function _notifTime(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)    return 'Gerade eben';
  if (diff < 3600)  return `Vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `Vor ${Math.floor(diff / 3600)} Std.`;
  return new Date(isoStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

// ── Toggle ────────────────────────────────────────────────────────

function toggleNotifications(enabled) {
  localStorage.setItem('tt_notifs_enabled', enabled ? '1' : '0');
  if (!enabled) { pendingNotifs = []; _allRecentMessages = []; _systemNotifs = []; hideNotifBadge(); }
  else checkNotifications();
}

// ── Polling ───────────────────────────────────────────────────────

function startNotifPolling() {
  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(checkNotifications, 60 * 1000);
}
