// ╔══════════════════════════════════════════════════════════════╗
// ║           DIREKTNACHRICHTEN (Inbox / DM)                    ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId   = null;
let _dmPartnerName = '';
let _dmPartnerEmoji = '';
let _dmPollTimer   = null;
let _dmUnreadCount = 0;

// ── Badge ─────────────────────────────────────────────────────
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
  } catch(e) { /* ignore */ }
}

// ── Inbox Sheet ───────────────────────────────────────────────
async function openInbox() {
  if (!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  openSheet('inbox-sheet');
  await renderInbox();
}

async function renderInbox() {
  const el = document.getElementById('inbox-body');
  if (!el) return;
  if (!sb.isLoggedIn()) {
    el.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">💬</div><div>Bitte anmelden</div></div>';
    return;
  }
  el.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon" style="font-size:1.6rem;">⏳</div><div>Lade…</div></div>';

  const uid = sb.getUserId();

  // Alle DMs laden (letzte 200)
  let messages = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id,sender_id,receiver_id,message,created_at,read_at&or=(sender_id.eq.${uid},receiver_id.eq.${uid})&order=created_at.desc&limit=200`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    messages = data || [];
  } catch(e) {
    el.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">⚠️</div><div>Fehler beim Laden</div></div>';
    return;
  }

  if (!messages.length) {
    el.innerHTML = `<div class="notif-empty">
      <div class="notif-empty-icon">💬</div>
      <div>Keine Nachrichten.<br>Schreib einem Spielpartner!</div>
    </div>`;
    return;
  }

  // Konversationen gruppieren (nach Partner-ID)
  const convMap = {};
  messages.forEach(m => {
    const partnerId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!convMap[partnerId]) {
      convMap[partnerId] = { partnerId, lastMsg: m, unread: 0 };
    }
    if (m.receiver_id === uid && !m.read_at) convMap[partnerId].unread++;
  });

  const convs = Object.values(convMap).sort((a, b) =>
    new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at)
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

  el.innerHTML = convs.map(c => {
    const p    = profiles[c.partnerId] || { id: c.partnerId, username: 'Spieler' };
    const av   = getAvatarHtml(p, { size: 44 });
    const nm   = escHtml(p.username || 'Spieler');
    const pid  = escAttr(c.partnerId);
    const pnm  = escAttr(p.username || 'Spieler');
    const pem  = escAttr(p.avatar_emoji || '');
    const preview = c.lastMsg.message.length > 50
      ? c.lastMsg.message.slice(0, 50) + '…'
      : c.lastMsg.message;
    const isMine = c.lastMsg.sender_id === uid;
    const time   = _dmTime(c.lastMsg.created_at);
    return `
      <div class="inbox-row" onclick="openDmConversation('${pid}','${pnm}','${pem}')">
        <div class="inbox-av">${av}</div>
        <div class="inbox-info">
          <div class="inbox-name">${nm}${c.unread ? `<span class="inbox-unread-badge">${c.unread}</span>` : ''}</div>
          <div class="inbox-preview${c.unread ? ' inbox-preview-bold' : ''}">${isMine ? 'Du: ' : ''}${escHtml(preview)}</div>
        </div>
        <div class="inbox-time">${time}</div>
      </div>`;
  }).join('');
}

// ── DM Konversation ───────────────────────────────────────────
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

  // DM-Header befüllen
  const headerEl = document.getElementById('dm-partner-name');
  const avEl     = document.getElementById('dm-partner-av');
  if (headerEl) headerEl.textContent = _dmPartnerName;
  if (avEl)     avEl.innerHTML = getAvatarHtml(
    { avatar_emoji: _dmPartnerEmoji, username: _dmPartnerName },
    { size: 32 }
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
  const el   = document.getElementById('dm-feed');
  if (!el) return;
  const uid  = sb.getUserId();
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Nachrichten – schreib als Erster! 💬</div>';
    return;
  }
  el.innerHTML = messages.map(m => {
    const isMine = m.sender_id === uid;
    const time   = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `<div class="chat-msg ${isMine ? 'mine' : ''}">
      <div class="chat-bubble-wrap">
        <div class="chat-bubble">${escHtml(m.message)}</div>
        <div class="chat-msg-meta">${isMine ? 'Du' : escHtml(_dmPartnerName)} · ${time}</div>
      </div>
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
    if (_dmPartnerId) {
      await loadDmMessages();
      await markDmRead();
    }
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
  return new Date(isoStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

// Enter-Taste im DM-Eingabefeld
function onDmInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
}
