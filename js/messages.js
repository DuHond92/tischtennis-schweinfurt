// ╔══════════════════════════════════════════════════════════════╗
// ║           INBOX / DIREKTNACHRICHTEN                         ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId    = null;
let _dmPartnerName  = '';
let _dmPartnerEmoji = '';
let _dmPollTimer    = null;
let _dmUnreadCount  = 0;

// ── Badge ──────────────────────────────────────────────────────
function updateDmBadge(n) {
  _dmUnreadCount = n || 0;
  const el = document.getElementById('dm-badge');
  if (!el) return;
  if (_dmUnreadCount > 0) {
    el.textContent = _dmUnreadCount > 9 ? '9+' : String(_dmUnreadCount);
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
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

// ── Inbox rendern: drei Kategorien ────────────────────────────
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

  // ── Spielpartner (1:1 DMs) ──────────────────────────────────
  const dmConvs = _groupDmsByPartner(dmMessages, uid);

  // Profile für DM-Partner
  let dmProfiles = {};
  const partnerIds = dmConvs.map(c => c.partnerId).filter(Boolean);
  if (partnerIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${partnerIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { dmProfiles[p.id] = p; });
    } catch(e) {}
  }

  // Unread-Badge im Topbar aktualisieren
  const totalDmUnread = dmConvs.reduce((s, c) => s + c.unread, 0);
  updateDmBadge(totalDmUnread);

  // ── Event-Kategorien aufteilen ──────────────────────────────
  const spielrunden = eventData.filter(e => e.mode !== 'player_search');
  const mitgesuch   = eventData.filter(e => e.mode === 'player_search');

  // ── HTML zusammenbauen ─────────────────────────────────────
  let html = '';

  if (dmConvs.length) {
    html += `<div class="inbox-section-label">👤 Spielpartner</div>`;
    html += dmConvs.map(c => _renderDmRow(c, dmProfiles, uid)).join('');
  }

  if (spielrunden.length) {
    html += `<div class="inbox-section-label">🏓 Spielrunden</div>`;
    html += spielrunden.map(e => _renderEventRow(e)).join('');
  }

  if (mitgesuch.length) {
    html += `<div class="inbox-section-label">🔍 Mitspieler gesucht</div>`;
    html += mitgesuch.map(e => _renderEventRow(e)).join('');
  }

  el.innerHTML = html || _inboxEmpty('💬', 'Noch keine Unterhaltungen.<br>Schreib einem Spielpartner!');
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
  // Events bei denen der Nutzer teilnimmt oder die er erstellt hat
  let eventIds = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/event_participants?select=event_id&user_id=eq.${uid}`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) eventIds = data.map(r => r.event_id).filter(Boolean);
  } catch(e) {}

  // Eigene Mitspieler-Gesuche ergänzen (Creator, auch ohne Teilnahme-Eintrag)
  try {
    const url = `${SUPABASE_URL}/rest/v1/events?select=id&creator_id=eq.${uid}&mode=eq.player_search`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) {
      data.forEach(r => { if (!eventIds.includes(r.id)) eventIds.push(r.id); });
    }
  } catch(e) {}

  if (!eventIds.length) return [];

  // Events laden
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
    if (Array.isArray(data)) {
      data.forEach(m => {
        if (!lastMsgs[m.event_id]) lastMsgs[m.event_id] = m;
      });
    }
  } catch(e) {}

  // Ungelesene Event-Nachrichten aus pendingNotifs
  const unreadByEvent = {};
  const notifs = typeof pendingNotifs !== 'undefined' ? pendingNotifs : [];
  notifs.forEach(m => {
    unreadByEvent[m.event_id] = (unreadByEvent[m.event_id] || 0) + 1;
  });

  // Events mit Metadaten anreichern, nach letzter Nachricht sortieren
  return events
    .map(e => ({
      ...e,
      lastMsg:  lastMsgs[e.id] || null,
      unread:   unreadByEvent[e.id] || 0
    }))
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
  return Object.values(convMap).sort(
    (a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at)
  );
}

function _renderDmRow(c, profiles, uid) {
  const p       = profiles[c.partnerId] || { id: c.partnerId, username: 'Spieler' };
  const av      = getAvatarHtml(p, { size: 56 });
  const nm      = escHtml(p.username || 'Spieler');
  const pid     = escAttr(c.partnerId);
  const pnm     = escAttr(p.username || 'Spieler');
  const pem     = escAttr(p.avatar_emoji || '');
  const isMine  = c.lastMsg.sender_id === uid;
  const preview = c.lastMsg.message.length > 60
    ? c.lastMsg.message.slice(0, 60) + '…' : c.lastMsg.message;
  const time    = _dmTime(c.lastMsg.created_at);
  const hasNew  = c.unread > 0;
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
            ${isMine ? '<span class="inbox-conv-mine">Du: </span>' : ''}${escHtml(preview)}
          </div>
          ${hasNew ? `<span class="inbox-conv-badge">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _renderEventRow(e) {
  const last    = e.lastMsg;
  const sender  = last?.profiles?.username || '';
  const preview = last
    ? (sender ? sender + ': ' : '') + (last.message.length > 55 ? last.message.slice(0, 55) + '…' : last.message)
    : 'Noch keine Nachrichten';
  const time    = last ? _dmTime(last.created_at) : '';
  const hasNew  = e.unread > 0;
  const avHtml  = last?.profiles
    ? getAvatarHtml(last.profiles, { size: 56 })
    : `<div class="inbox-event-av">${e.mode === 'player_search' ? '🔍' : '🏓'}</div>`;
  return `
    <div class="inbox-conv-row" onclick="closeAllSheets();openNotifEvent(${e.id})">
      <div class="inbox-conv-av">${avHtml}</div>
      <div class="inbox-conv-body">
        <div class="inbox-conv-top">
          <div class="inbox-conv-name${hasNew ? ' inbox-conv-name-bold' : ''}">${escHtml(e.title || 'Spielrunde')}</div>
          <div class="inbox-conv-time${hasNew ? ' inbox-conv-time-bold' : ''}">${time}</div>
        </div>
        <div class="inbox-conv-bottom">
          <div class="inbox-conv-preview${hasNew ? ' inbox-conv-preview-bold' : ''}">${escHtml(preview)}</div>
          ${hasNew ? `<span class="inbox-conv-badge">${e.unread > 9 ? '9+' : e.unread}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _inboxEmpty(icon, text, dim) {
  return `<div class="inbox-empty${dim ? ' inbox-empty-dim' : ''}">
    <div class="inbox-empty-icon">${icon}</div>
    <div>${text}</div>
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
  const uid = sb.getUserId();
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Nachrichten – schreib als Erster! 💬</div>';
    return;
  }
  let lastDate = '';
  el.innerHTML = messages.map(m => {
    const isMine  = m.sender_id === uid;
    const msgDate = new Date(m.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const time    = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    let sep = '';
    if (msgDate !== lastDate) {
      sep      = `<div class="dm-date-sep"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }
    return `${sep}<div class="dm-msg ${isMine ? 'dm-mine' : 'dm-theirs'}">
      <div class="dm-bubble">${escHtml(m.message)}</div>
      <div class="dm-meta">${time}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
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
  const d = new Date(isoStr);
  const today = new Date();
  if (d.getFullYear() === today.getFullYear())
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function onDmInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
}
