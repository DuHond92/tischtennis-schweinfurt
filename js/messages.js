// ╔══════════════════════════════════════════════════════════════╗
// ║           INBOX / DIREKTNACHRICHTEN                         ║
// ╚══════════════════════════════════════════════════════════════╝

let _dmPartnerId    = null;
let _dmPartnerName  = '';
let _dmPartnerEmoji = '';
let _dmPartnerUrl   = '';
let _dmPollTimer    = null;
let _dmUnreadCount  = 0;

let _inboxExpanded    = {};
let _inboxMode        = 'chats'; // 'chats' | 'requests'
let _inboxSearchTimer = null;
let _inboxSearchQ     = '';

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

const INBOX_PREVIEW = 3;

// ── Badge ──────────────────────────────────────────────────────
function updateDmBadge(n) {
  _dmUnreadCount = n || 0;
  const el = document.getElementById('dm-badge');
  if (!el) return;
  el.textContent   = _dmUnreadCount > 9 ? '9+' : String(_dmUnreadCount);
  el.style.display = _dmUnreadCount > 0 ? '' : 'none';
}

function _updateRequestsBadge() {
  if (!sb.isLoggedIn() || !Array.isArray(_myConnections)) return;
  const uid      = sb.getUserId();
  const incoming = _myConnections.filter(c => c.status === 'pending' && c.receiver_id === uid);
  const outgoing = _myConnections.filter(c => c.status === 'pending' && c.requester_id === uid);
  const total    = incoming.length + outgoing.length;
  const btn      = document.getElementById('inbox-requests-btn');
  const badge    = document.getElementById('inbox-req-badge');
  if (!btn) return;
  btn.style.display = total > 0 ? '' : 'none';
  if (badge) {
    if (incoming.length > 0) {
      badge.textContent  = incoming.length;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
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

// ── Header-Zustand tauschen ────────────────────────────────────
const _backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>`;

function _setInboxView(view) {
  const backBtn    = document.getElementById('inbox-back-btn');
  const titleEl    = document.getElementById('inbox-header-title');
  const reqBtn     = document.getElementById('inbox-requests-btn');
  const searchWrap = document.getElementById('inbox-search-wrap');

  if (view === 'requests') {
    if (backBtn) {
      backBtn.onclick = inboxBackToChats;
      backBtn.innerHTML = `${_backSvg}<span style="font-size:0.85rem;font-weight:700;color:var(--primary);margin-left:2px;">Zurück</span>`;
      backBtn.style.display = 'flex';
      backBtn.style.alignItems = 'center';
      backBtn.style.gap = '2px';
    }
    if (titleEl)    titleEl.textContent = 'Spielpartner-Anfragen';
    if (reqBtn)     reqBtn.style.display = 'none';
    if (searchWrap) searchWrap.style.display = 'none';
  } else {
    if (backBtn) {
      backBtn.onclick = closeAllSheets;
      backBtn.innerHTML = _backSvg;
      backBtn.style.removeProperty('display');
      backBtn.style.removeProperty('align-items');
      backBtn.style.removeProperty('gap');
    }
    if (titleEl)    titleEl.textContent = 'Nachrichten';
    if (searchWrap) searchWrap.style.removeProperty('display');
    // reqBtn-Sichtbarkeit wird durch _updateRequestsBadge gesetzt
  }
}

// ── Inbox öffnen ───────────────────────────────────────────────
async function openInbox() {
  if (!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  _inboxMode = 'chats';
  _clearInboxSearch();
  openSheet('inbox-sheet');
  await renderInboxChats();
}

// ── Inbox rendern — nur Chatliste ─────────────────────────────
async function renderInboxChats() {
  _inboxMode = 'chats';
  _setInboxView('messages');
  const el = document.getElementById('inbox-body');
  if (!el) return;
  if (!sb.isLoggedIn()) { el.innerHTML = _inboxEmpty('💬', 'Bitte melde dich an.'); return; }
  el.innerHTML = _inboxEmpty('⏳', 'Lade…', true);

  const uid = sb.getUserId();

  // Verbindungen für Badge laden
  if (typeof loadMyConnections === 'function' && typeof _myConnections !== 'undefined' && _myConnections === null) {
    await loadMyConnections();
  }
  _updateRequestsBadge();

  // DM-Konversationen laden
  const dmMessages = await _loadDmMessages(uid);
  const dmConvs    = _groupDmsByPartner(dmMessages, uid);

  let dmProfs = {};
  const dmIds = dmConvs.map(c => c.partnerId).filter(Boolean);
  if (dmIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${dmIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { dmProfs[p.id] = p; });
    } catch(e) {}
  }

  updateDmBadge(dmConvs.reduce((s, c) => s + c.unread, 0));

  if (!dmConvs.length) {
    const accepted = Array.isArray(_myConnections) ? _myConnections.filter(c => c.status === 'accepted') : [];
    if (!accepted.length) {
      el.innerHTML = `<div class="inbox-empty-full">
        <div class="inbox-empty-full-icon">${ic('users', 48)}</div>
        <div class="inbox-empty-full-title">Finde deine ersten Spielpartner</div>
        <div class="inbox-empty-full-text">Suche nach Spielern und sende eine Anfrage, um gemeinsam Tischtennis zu spielen.</div>
        <button class="btn btn-primary inbox-empty-cta" onclick="document.getElementById('inbox-search-input').focus()">Spieler suchen</button>
        <div class="inbox-empty-hint">Nach angenommener Anfrage könnt ihr direkt chatten.</div>
      </div>`;
    } else {
      el.innerHTML = _inboxEmpty('💬', 'Noch keine Nachrichten.<br>Suche Spielpartner oben und schreib ihnen!');
    }
    return;
  }

  el.innerHTML = dmConvs.map(c => _renderDmRow(c, dmProfs, uid)).join('');
}

// ── Anfragen-Ansicht (inline im Panel) ─────────────────────────
async function inboxShowRequests() {
  _inboxMode = 'requests';
  _clearInboxSearch();
  _setInboxView('requests');
  const el = document.getElementById('inbox-body');
  if (!el) return;
  el.innerHTML = _inboxEmpty('⏳', 'Lade…', true);

  if (typeof loadMyConnections === 'function' && typeof _myConnections !== 'undefined' && _myConnections === null) {
    await loadMyConnections();
  }
  const uid      = sb.getUserId();
  const myConns  = Array.isArray(_myConnections) ? _myConnections : [];
  const incoming = myConns.filter(c => c.status === 'pending' && c.receiver_id === uid);
  const outgoing = myConns.filter(c => c.status === 'pending' && c.requester_id === uid);

  const allIds = [...new Set([
    ...incoming.map(c => c.requester_id),
    ...outgoing.map(c => c.receiver_id)
  ].filter(Boolean))];

  let profs = {};
  if (allIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url,skill_level&id=in.(${allIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { profs[p.id] = p; });
    } catch(e) {}
  }

  const skillMap = { anfaenger: 'Anfänger', fortgeschritten: 'Fortgeschritten', profi: 'Profi' };

  const reqRow = (p, actionsHtml) => {
    const pid   = escAttr(p.id);
    const pnm   = escAttr(p.username || '');
    const pem   = escAttr(p.avatar_emoji || '');
    const pur   = escAttr(p.avatar_url || '');
    const skill = p.skill_level ? skillMap[p.skill_level] || '' : '';
    return `<div class="inbox-partner-row">
      <div class="inbox-conv-av" onclick="showPlayerProfile('${pid}','${pnm}','${pem}',null,'${pur}')" style="cursor:pointer">${getAvatarHtml(p, { size: 46 })}</div>
      <div class="inbox-conv-body">
        <div class="inbox-conv-name">${escHtml(p.username || 'Spieler')}</div>
        ${skill ? `<div class="inbox-partner-skill">${skill}</div>` : ''}
        ${actionsHtml}
      </div>
    </div>`;
  };

  let html = '';

  if (!incoming.length && !outgoing.length) {
    html += _inboxEmpty('🤝', 'Keine offenen Anfragen');
  } else {
    if (incoming.length) {
      html += `<div class="inbox-section-label">Eingegangene Anfragen</div>`;
      html += incoming.map(c => {
        const p   = profs[c.requester_id] || { id: c.requester_id, username: 'Spieler' };
        const cid = escAttr(c.id);
        const pid = escAttr(c.requester_id);
        return reqRow(p, `<div class="inbox-req-actions" style="margin-top:6px;">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();_reqAccept('${cid}','${pid}')">Annehmen</button>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();_reqReject('${cid}','${pid}')">Ablehnen</button>
        </div>`);
      }).join('');
    }
    if (outgoing.length) {
      html += `<div class="inbox-section-label">Gesendete Anfragen</div>`;
      html += outgoing.map(c => {
        const p   = profs[c.receiver_id] || { id: c.receiver_id, username: 'Spieler' };
        const cid = escAttr(c.id);
        const pid = escAttr(c.receiver_id);
        return reqRow(p, `<button class="btn-withdraw" style="margin-top:6px;" onclick="event.stopPropagation();_reqCancel('${cid}','${pid}')">Zurückziehen</button>`);
      }).join('');
    }
  }

  el.innerHTML = html;
}

async function inboxBackToChats() {
  await renderInboxChats();
}

// ── Request-Action-Wrapper (aktualisieren nach Aktion) ─────────
async function _reqAccept(cid, uid) {
  await acceptConnectionRequest(cid, uid);
  if (_inboxMode === 'requests') inboxShowRequests();
  else renderInboxChats();
}
async function _reqReject(cid, uid) {
  await rejectConnectionRequest(cid, uid);
  if (_inboxMode === 'requests') inboxShowRequests();
  else renderInboxChats();
}
async function _reqCancel(cid, uid) {
  await cancelConnectionRequest(cid, uid);
  if (_inboxMode === 'requests') inboxShowRequests();
  else renderInboxChats();
}

// ── Suchfunktionen ─────────────────────────────────────────────
function _inboxSearch(val) {
  _inboxSearchQ = val.trim();
  const clear = document.getElementById('inbox-search-clear');
  if (clear) clear.style.display = val ? '' : 'none';
  clearTimeout(_inboxSearchTimer);
  if (!_inboxSearchQ) {
    if (_inboxMode === 'requests') inboxShowRequests();
    else renderInboxChats();
    return;
  }
  const el = document.getElementById('inbox-body');
  if (el) el.innerHTML = _inboxEmpty('⏳', 'Suche…', true);
  _inboxSearchTimer = setTimeout(() => _runInboxSearch(_inboxSearchQ), 300);
}

function _clearInboxSearch() {
  _inboxSearchQ = '';
  clearTimeout(_inboxSearchTimer);
  const inp   = document.getElementById('inbox-search-input');
  const clear = document.getElementById('inbox-search-clear');
  if (inp)   inp.value = '';
  if (clear) clear.style.display = 'none';
}

async function _runInboxSearch(q) {
  if (q !== _inboxSearchQ) return;

  if (typeof loadMyConnections === 'function' && typeof _myConnections !== 'undefined' && _myConnections === null) {
    await loadMyConnections();
  }
  const uid     = sb.getUserId();
  const myConns = Array.isArray(_myConnections) ? _myConnections : [];

  const connMap = {};
  myConns.forEach(c => {
    const other = c.requester_id === uid ? c.receiver_id : c.requester_id;
    connMap[other] = c;
  });

  let results = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url,skill_level&username=ilike.*${encodeURIComponent(q)}*&limit=12`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (Array.isArray(data)) results = data.filter(p => p.id !== uid);
  } catch(e) {}

  if (q !== _inboxSearchQ) return;

  const el = document.getElementById('inbox-body');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = `<div class="inbox-empty">
      <div class="inbox-empty-icon">🔍</div>
      <div style="font-weight:700;color:var(--text);">Keine Spieler gefunden</div>
      <div style="color:var(--text-dim);font-size:0.82rem;margin-top:4px;">Versuche einen anderen Namen oder Spielernamen.</div>
    </div>`;
    return;
  }

  const skillMap = { anfaenger: 'Anfänger', fortgeschritten: 'Fortgeschritten', profi: 'Profi' };

  const rows = results.map(p => {
    const pid   = escAttr(p.id);
    const pnm   = escAttr(p.username || '');
    const pem   = escAttr(p.avatar_emoji || '');
    const pur   = escAttr(p.avatar_url || '');
    const skill = p.skill_level ? skillMap[p.skill_level] || '' : '';
    const conn  = connMap[p.id];

    let actionHtml = '';
    if (!conn) {
      actionHtml = `<button class="btn-sm-ghost" onclick="event.stopPropagation();_inboxSendRequest('${pid}',this)">Anfrage senden</button>`;
    } else if (conn.status === 'accepted') {
      actionHtml = `<button class="btn-sm-primary" onclick="event.stopPropagation();openDmConversation('${pid}','${pnm}','${pem}','${pur}')">${ic('chat',13)} Nachricht</button>`;
    } else if (conn.status === 'pending' && conn.requester_id === uid) {
      actionHtml = `<span class="inbox-search-status">Anfrage gesendet</span>`;
    } else if (conn.status === 'pending' && conn.receiver_id === uid) {
      const cid = escAttr(conn.id);
      actionHtml = `<div class="inbox-req-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();_reqAccept('${cid}','${pid}')">Annehmen</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();_reqReject('${cid}','${pid}')">Ablehnen</button>
      </div>`;
    }

    return `<div class="inbox-partner-row" onclick="showPlayerProfile('${pid}','${pnm}','${pem}',null,'${pur}')" style="cursor:pointer">
      <div class="inbox-conv-av" onclick="event.stopPropagation();showPlayerProfile('${pid}','${pnm}','${pem}',null,'${pur}')">${getAvatarHtml(p, { size: 46 })}</div>
      <div class="inbox-conv-body">
        <div class="inbox-conv-name">${escHtml(p.username || 'Spieler')}</div>
        ${skill ? `<div class="inbox-partner-skill">${skill}</div>` : ''}
      </div>
      <div class="inbox-search-action-wrap" onclick="event.stopPropagation()">${actionHtml}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="inbox-section-label">Suchergebnisse</div>${rows}`;
}

async function _inboxSendRequest(otherId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  await sendConnectionRequest(otherId);
  if (btn) { btn.disabled = false; btn.textContent = 'Gesendet'; }
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

    const btnLabel = expanded ? 'Weniger anzeigen ↑' : `+ ${hidden.length} weitere`;
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
  const pur    = escAttr(p.avatar_url || '');
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
