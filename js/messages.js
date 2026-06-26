// ╔══════════════════════════════════════════════════════════════╗
// ║           INBOX / DIREKTNACHRICHTEN                         ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId    = null;
let _dmPartnerName  = '';
let _dmPartnerEmoji = '';
let _dmPollTimer    = null;
let _dmUnreadCount  = 0;
let _inboxActiveTab = 'chats';   // 'chats' | 'akt'

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
  _activateInboxTab(_inboxActiveTab, false);
  await _loadInboxTab(_inboxActiveTab);
}

function switchInboxTab(tab) {
  _inboxActiveTab = tab;
  _activateInboxTab(tab, true);
  _loadInboxTab(tab);
}

function _activateInboxTab(tab, animate) {
  document.querySelectorAll('.inbox-tab').forEach(t => t.classList.remove('active'));
  const activeBtn = document.getElementById('inbox-tab-' + tab);
  if (activeBtn) activeBtn.classList.add('active');
  document.querySelectorAll('.inbox-panel').forEach(p => {
    p.style.display = 'none';
  });
  const panel = document.getElementById('inbox-panel-' + tab);
  if (panel) panel.style.display = '';
}

async function _loadInboxTab(tab) {
  if (tab === 'chats') await renderInboxChats();
  else await renderInboxAkt();
}

// ── Chats-Tab ─────────────────────────────────────────────────
async function renderInboxChats() {
  const el = document.getElementById('inbox-body');
  if (!el) return;

  if (!sb.isLoggedIn()) {
    el.innerHTML = _inboxEmpty('💬', 'Bitte melde dich an.');
    return;
  }

  el.innerHTML = _inboxEmpty('⏳', 'Lade Chats…', true);

  const uid = sb.getUserId();
  let messages = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id,sender_id,receiver_id,message,created_at,read_at&or=(sender_id.eq.${uid},receiver_id.eq.${uid})&order=created_at.desc&limit=200`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    messages = data || [];
  } catch(e) {
    el.innerHTML = _inboxEmpty('⚠️', 'Fehler beim Laden.');
    return;
  }

  if (!messages.length) {
    el.innerHTML = _inboxEmpty('💬', 'Noch keine Unterhaltungen.<br>Schreib einem Spielpartner!');
    return;
  }

  // Konversationen nach Partner-ID gruppieren
  const convMap = {};
  messages.forEach(m => {
    const partnerId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!convMap[partnerId]) {
      convMap[partnerId] = { partnerId, lastMsg: m, unread: 0 };
    }
    if (m.receiver_id === uid && !m.read_at) convMap[partnerId].unread++;
  });

  const convs = Object.values(convMap).sort(
    (a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at)
  );

  // Profile batch-laden
  const partnerIds = convs.map(c => c.partnerId).filter(Boolean);
  let profiles = {};
  if (partnerIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${partnerIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { profiles[p.id] = p; });
    } catch(e) {}
  }

  // Unread-Dot auf Tab setzen
  const totalUnread = convs.reduce((s, c) => s + c.unread, 0);
  const dot = document.getElementById('inbox-tab-dot-chats');
  if (dot) dot.style.display = totalUnread ? '' : 'none';

  const renderRow = c => {
    const p       = profiles[c.partnerId] || { id: c.partnerId, username: 'Spieler' };
    const av      = getAvatarHtml(p, { size: 56 });
    const nm      = escHtml(p.username || 'Spieler');
    const pid     = escAttr(c.partnerId);
    const pnm     = escAttr(p.username || 'Spieler');
    const pem     = escAttr(p.avatar_emoji || '');
    const isMine  = c.lastMsg.sender_id === uid;
    const preview = c.lastMsg.message.length > 60
      ? c.lastMsg.message.slice(0, 60) + '…'
      : c.lastMsg.message;
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
  };

  // Gruppierung: alle DMs sind aktuell Spielpartner-Chats
  const rowsHtml = convs.map(renderRow).join('');
  el.innerHTML = `<div class="inbox-section-label">👤 Spielpartner</div>${rowsHtml}`;
  // Spielrunden / Mitspieler-Gesucht: werden nicht angezeigt solange leer
}

// ── Aktivitäten-Tab ────────────────────────────────────────────
async function renderInboxAkt() {
  const el = document.getElementById('inbox-akt-body');
  if (!el) return;

  if (!sb.isLoggedIn()) {
    el.innerHTML = _inboxEmpty('🔔', 'Bitte melde dich an.');
    return;
  }

  el.innerHTML = _inboxEmpty('⏳', 'Lade Aktivitäten…', true);

  // Frische Daten sicherstellen
  if (typeof checkNotifications === 'function') await checkNotifications();

  const connReqs   = typeof pendingConnectionRequests !== 'undefined' ? pendingConnectionRequests : [];
  const evNotifs   = typeof pendingNotifs !== 'undefined' ? pendingNotifs : [];

  // Tab-Dot
  const dot = document.getElementById('inbox-tab-dot-akt');
  const total = connReqs.length + evNotifs.length;
  if (dot) dot.style.display = total ? '' : 'none';

  if (!connReqs.length && !evNotifs.length) {
    el.innerHTML = _inboxEmpty('✅', 'Keine neuen Aktivitäten.');
    return;
  }

  // Spielpartner-Anfragen
  const connHtml = typeof renderConnectionRequestNotifs === 'function'
    ? renderConnectionRequestNotifs() : '';

  // Event-Benachrichtigungen
  const evSrc = (typeof allEvents !== 'undefined' && allEvents.length) ? allEvents : (typeof FALLBACK_EVENTS !== 'undefined' ? FALLBACK_EVENTS : []);
  const evMap = {};
  evSrc.forEach(e => { evMap[e.id] = e; });
  if (typeof allPlayerSearches !== 'undefined') {
    allPlayerSearches.forEach(ps => {
      if (!evMap[ps.id]) evMap[ps.id] = { id: ps.id, name: ps.username + ' sucht Mitspieler' };
    });
  }

  const evHtml = evNotifs.slice(0, 20).map(m => {
    const ev      = evMap[m.event_id];
    const evTitle = ev ? ev.name : 'Spiel';
    const sender  = m.profiles?.username || 'Jemand';
    const uid     = m.user_id || '';
    const emoji   = m.profiles?.avatar_emoji || '';
    const avHtml  = getAvatarHtml(m.profiles, { size: 44 });
    const preview = m.message.length > 55 ? m.message.slice(0, 55) + '…' : m.message;
    const time    = _dmTime(m.created_at);
    const avClick = uid
      ? `onclick="event.stopPropagation();closeAllSheets();showPlayerProfile('${escAttr(uid)}','${escAttr(sender)}','${escAttr(emoji)}')"` : '';
    return `
      <div class="inbox-akt-row" onclick="closeAllSheets();openNotifEvent(${m.event_id})">
        <div class="inbox-akt-av pp-clickable" ${avClick}>${avHtml}</div>
        <div class="inbox-akt-body">
          <div class="inbox-akt-title"><b>${escHtml(sender)}</b> in „${escHtml(evTitle)}"</div>
          <div class="inbox-akt-preview">${escHtml(preview)}</div>
        </div>
        <div class="inbox-akt-meta">
          <div class="inbox-akt-time">${time}</div>
          <div class="inbox-akt-dot"></div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = connHtml + evHtml;
}

function _inboxEmpty(icon, text, dim) {
  return `<div class="inbox-empty${dim ? ' inbox-empty-dim' : ''}">
    <div class="inbox-empty-icon">${icon}</div>
    <div>${text}</div>
  </div>`;
}

// ── DM Konversation ────────────────────────────────────────────

// Öffnet DM aus der Inbox heraus — Inbox bleibt im Hintergrund offen
async function openDmFromInbox(partnerId, partnerName, partnerEmoji) {
  await openDmConversation(partnerId, partnerName, partnerEmoji);
  // Inbox bleibt offen (dm-overlay deckt sie ab)
  // closeDmSheet() enthüllt sie wieder automatisch
}

// Öffnet DM vom Spielerprofil aus — schließt erst alle Sheets
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
    { avatar_emoji: _dmPartnerEmoji, username: _dmPartnerName },
    { size: 34 }
  );

  document.getElementById('dm-feed').innerHTML =
    '<div class="chat-empty">Lade Nachrichten…</div>';
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
  // Inbox re-erscheint automatisch falls sie noch offen ist
  // (dm-overlay hatte sie nur visuell überdeckt)
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

  // Datum-Trenner zwischen Tagen
  let lastDate = '';
  el.innerHTML = messages.map(m => {
    const isMine   = m.sender_id === uid;
    const msgDate  = new Date(m.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const time     = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    let separator  = '';
    if (msgDate !== lastDate) {
      separator  = `<div class="dm-date-sep"><span>${msgDate}</span></div>`;
      lastDate   = msgDate;
    }
    return `${separator}<div class="dm-msg ${isMine ? 'dm-mine' : 'dm-theirs'}">
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
  const url = `${SUPABASE_URL}/rest/v1/direct_messages`;
  const { ok } = await fetchWithRefresh(url, {
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
  const url = `${SUPABASE_URL}/rest/v1/direct_messages?receiver_id=eq.${uid}&sender_id=eq.${encodeURIComponent(_dmPartnerId)}&read_at=is.null`;
  try {
    await fetchWithRefresh(url, {
      method:  'PATCH',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ read_at: new Date().toISOString() })
    });
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
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
}

function onDmInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
}
