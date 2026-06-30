// ╔══════════════════════════════════════════════════════════════╗
// ║           INBOX / DIREKTNACHRICHTEN                         ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId    = null;
let _dmPartnerName  = '';
let _dmPartnerEmoji = '';
let _dmPartnerUrl   = '';
let _dmPollTimer    = null;
let _dmUnreadCount  = 0;

// Expand-Zustand pro Kategorie (bleibt innerhalb einer Session erhalten)
let _inboxExpanded  = {};

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

  el.innerHTML = _inboxEmpty('⏳', 'Lade Nachrichten…', true);

  const uid = sb.getUserId();
  const dmMessages = await _loadDmMessages(uid);
  const dmConvs    = _groupDmsByPartner(dmMessages, uid);

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

  const renderDm = c => _renderDmRow(c, dmProfiles, uid);
  const html = _renderSection('spielpartner', '👤 Spielpartner', dmConvs, renderDm)
    || _inboxEmpty('💬', 'Noch keine Nachrichten.<br>Schreib einem Mitspieler!');

  el.innerHTML = html;
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

// ── Datenlader ────────────────────────────────────────────────

async function _loadDmMessages(uid) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/direct_messages?select=id,sender_id,receiver_id,message,created_at,read_at&or=(sender_id.eq.${uid},receiver_id.eq.${uid})&order=created_at.desc&limit=200`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    return data || [];
  } catch(e) { return []; }
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
  const pur = escAttr(p.avatar_url || '');
  return `
    <div class="inbox-conv-row" onclick="openDmFromInbox('${pid}','${pnm}','${pem}','${pur}')">
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

function _inboxEmpty(icon, text, dim) {
  return `<div class="inbox-empty${dim ? ' inbox-empty-dim' : ''}">
    <div class="inbox-empty-icon">${icon}</div><div>${text}</div>
  </div>`;
}

// ── DM Konversation ────────────────────────────────────────────

async function openDmFromInbox(partnerId, partnerName, partnerEmoji, partnerUrl) {
  await openDmConversation(partnerId, partnerName, partnerEmoji, partnerUrl);
}

async function openDmFromProfile() {
  if (!_dmPartnerId) return;
  closeAllSheets();
  await openDmConversation(_dmPartnerId, _dmPartnerName, _dmPartnerEmoji, _dmPartnerUrl);
}

async function openDmConversation(partnerId, partnerName, partnerEmoji, partnerUrl) {
  if (!sb.isLoggedIn()) { openSheet('auth-sheet'); return; }
  _dmPartnerId    = partnerId;
  _dmPartnerName  = partnerName  || 'Spieler';
  _dmPartnerEmoji = partnerEmoji || '';
  _dmPartnerUrl   = partnerUrl   || '';

  const headerEl = document.getElementById('dm-partner-name');
  const avEl     = document.getElementById('dm-partner-av');
  if (headerEl) headerEl.textContent = _dmPartnerName;
  if (avEl) avEl.innerHTML = getAvatarHtml(
    { avatar_url: _dmPartnerUrl || null, avatar_emoji: _dmPartnerEmoji, username: _dmPartnerName }, { size: 34 }
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
