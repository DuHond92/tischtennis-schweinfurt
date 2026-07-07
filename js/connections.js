// ╔══════════════════════════════════════════════════════════════╗
// ║           SPIELPARTNER (Verbindungen)                        ║
// ╚══════════════════════════════════════════════════════════════╝

let _myConnections    = null;   // null = noch nicht geladen
let _ppCurrentUserId  = null;   // aktuell geöffnetes Spielerprofil
let _ppCurrentUserName  = '';
let _ppCurrentUserEmoji = '';
let _ppCurrentUserUrl   = null;

// ── Verbindungen laden ────────────────────────────────────────────
async function loadMyConnections() {
  if (!sb.isLoggedIn()) { _myConnections = []; return; }
  const uid = sb.getUserId();

  let asRequester = [];
  try {
    const qb = new QueryBuilder('player_connections');
    qb._select = 'id,requester_id,receiver_id,status,created_at';
    qb.eq('requester_id', uid);
    const { data } = await qb.execute();
    asRequester = data || [];
  } catch(e) {}

  let asReceiver = [];
  try {
    const qb = new QueryBuilder('player_connections');
    qb._select = 'id,requester_id,receiver_id,status,created_at';
    qb.eq('receiver_id', uid);
    const { data } = await qb.execute();
    asReceiver = data || [];
  } catch(e) {}

  _myConnections = [...asRequester, ...asReceiver];
}

function getConnectionWith(otherUserId) {
  if (!_myConnections) return null;
  return _myConnections.find(c =>
    c.requester_id === otherUserId || c.receiver_id === otherUserId
  ) || null;
}

// ── Verbindungs-Button HTML ───────────────────────────────────────
function getConnectionButtonHtml(otherUserId) {
  if (!sb.isLoggedIn() || !otherUserId) return '';
  const myId = sb.getUserId();
  if (otherUserId === myId) return '';
  if (_myConnections === null) {
    return '<button class="btn btn-secondary btn-full" disabled style="opacity:.5">Lade…</button>';
  }

  const conn = getConnectionWith(otherUserId);
  const oid  = escAttr(otherUserId);

  if (!conn) {
    return `<button class="btn btn-primary btn-full" onclick="sendConnectionRequest('${oid}')">${ic('user-plus',16)} Spielpartner anfragen</button>`;
  }

  const cid = escAttr(conn.id);

  if (conn.status === 'pending') {
    if (conn.requester_id === myId) {
      return `<button class="btn btn-secondary btn-full" onclick="cancelConnectionRequest('${cid}','${oid}')">⏳ Anfrage ausstehend <span class="pp-soon">(zurückziehen)</span></button>`;
    } else {
      return `<button class="btn btn-primary btn-full" style="margin-bottom:8px;" onclick="acceptConnectionRequest('${cid}','${oid}')">${ic('check',16)} Anfrage annehmen</button>
<button class="btn btn-secondary btn-full" onclick="rejectConnectionRequest('${cid}','${oid}')">Ablehnen</button>`;
    }
  }

  if (conn.status === 'accepted') {
    const pnm = escAttr(_ppCurrentUserName || '');
    const pem = escAttr(_ppCurrentUserEmoji || '');
    const pur = escAttr(_ppCurrentUserUrl  || '');
    return `<button class="btn btn-primary btn-full" onclick="openDmConversation('${oid}','${pnm}','${pem}','${pur}')">${ic('chat',16)} Nachricht schreiben</button>
<div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);">
  <button class="btn btn-full" style="background:none;border:1px solid var(--red,#EF4444);color:var(--red,#EF4444);" onclick="confirmRemoveConnection('${cid}','${oid}')">Freundschaft beenden</button>
</div>`;
  }

  // rejected oder blocked → erneut anfragen erlaubt
  return `<button class="btn btn-primary btn-full" onclick="sendConnectionRequest('${oid}')">${ic('user-plus',16)} Spielpartner anfragen</button>`;
}

function refreshConnectionButton(otherUserId) {
  if (_ppCurrentUserId === otherUserId) {
    const el = document.getElementById('pp-connection-btn');
    if (el) el.innerHTML = getConnectionButtonHtml(otherUserId);
  }
  // Badge und Inbox aktualisieren
  if (typeof _updateRequestsBadge === 'function') _updateRequestsBadge();
  const ib = document.getElementById('inbox-sheet');
  if (ib && ib.classList.contains('open')) {
    if (typeof _inboxMode !== 'undefined' && _inboxMode === 'requests' && typeof inboxShowRequests === 'function') {
      inboxShowRequests();
    } else if (typeof renderInboxChats === 'function') {
      renderInboxChats();
    }
  }
}

// ── Aktionen ──────────────────────────────────────────────────────
async function sendConnectionRequest(otherUserId) {
  if (!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  const qb = new QueryBuilder('player_connections');
  const { error } = await qb.insert({
    requester_id: sb.getUserId(),
    receiver_id:  otherUserId,
    status:       'pending'
  });
  if (error) { showToast('Fehler beim Senden der Anfrage', 'error'); return; }
  _myConnections = null;
  await loadMyConnections();
  PTAnalytics.track('friend_request_sent');
  showToast('Spielpartner-Anfrage gesendet!');
  refreshConnectionButton(otherUserId);
}

async function cancelConnectionRequest(connectionId, otherUserId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Anfrage zurückgezogen');
  refreshConnectionButton(otherUserId);
}

async function acceptConnectionRequest(connectionId, otherUserId) {
  const qb = new QueryBuilder('player_connections');
  qb.eq('id', connectionId);
  const { error } = await qb.update({ status: 'accepted', updated_at: new Date().toISOString() });
  if (error) { showToast('Fehler beim Annehmen', 'error'); return; }
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner hinzugefügt!');
  refreshConnectionButton(otherUserId);
  checkConnectionNotifications();
}

async function rejectConnectionRequest(connectionId, otherUserId) {
  const qb = new QueryBuilder('player_connections');
  qb.eq('id', connectionId);
  const { error } = await qb.update({ status: 'rejected', updated_at: new Date().toISOString() });
  if (error) { showToast('Fehler beim Ablehnen', 'error'); return; }
  _myConnections = null;
  await loadMyConnections();
  refreshConnectionButton(otherUserId);
  checkConnectionNotifications();
}

async function removeConnection(connectionId, otherUserId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner entfernt');
  refreshConnectionButton(otherUserId);
}

async function removeConnectionFromProfile(connectionId, partnerId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner entfernt');
  renderSpielpartnerSection();
  if (_ppCurrentUserId === partnerId) {
    const el = document.getElementById('pp-connection-btn');
    if (el) el.innerHTML = getConnectionButtonHtml(partnerId);
  }
}

async function _deleteConnection(connectionId) {
  const url = `${SUPABASE_URL}/rest/v1/player_connections?id=eq.${encodeURIComponent(connectionId)}`;
  await fetchWithRefresh(url, {
    method:  'DELETE',
    headers: { ...dbHeaders(), 'Prefer': 'return=minimal' }
  });
}

function confirmRemoveConnection(connectionId, otherUserId) {
  const btn = document.getElementById('confirm-remove-conn-btn');
  if (btn) btn.onclick = () => _executeRemoveConnection(connectionId, otherUserId);
  openSheet('confirm-remove-conn-sheet');
}

async function _executeRemoveConnection(connectionId, otherUserId) {
  closeAllSheets();
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner entfernt');
  refreshConnectionButton(otherUserId);
}

// ── Benachrichtigungen: ausstehende Anfragen ──────────────────────
let pendingConnectionRequests = [];

async function checkConnectionNotifications() {
  if (!sb.isLoggedIn()) { pendingConnectionRequests = []; return; }
  const uid = sb.getUserId();

  let pending = [];
  try {
    const qb = new QueryBuilder('player_connections');
    qb._select = 'id,requester_id,status,created_at';
    qb.eq('receiver_id', uid).eq('status', 'pending');
    const { data } = await qb.execute();
    pending = data || [];
  } catch(e) { pending = []; }

  if (pending.length) {
    const ids = pending.map(r => r.requester_id).join(',');
    let profiles = {};
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${ids})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { profiles[p.id] = p; });
    } catch(e) {}
    pendingConnectionRequests = pending.map(r => ({ ...r, profile: profiles[r.requester_id] || null }));
  } else {
    pendingConnectionRequests = [];
  }
}

// Rendert Verbindungs-Anfragen als HTML für das Notif-Sheet
function renderConnectionRequestNotifs() {
  if (!pendingConnectionRequests.length) return '';
  return pendingConnectionRequests.map(req => {
    const p   = req.profile;
    const av  = p ? getAvatarHtml(p, { size: 40 }) : initAvatar('?', 40);
    const nm  = escHtml(p?.username || 'Spieler');
    const cid = escAttr(req.id);
    const uid = escAttr(req.requester_id);
    const time = typeof _notifTime === 'function' ? _notifTime(req.created_at) : '';
    return `
      <div class="notif-conn-req">
        <div class="notif-conn-header">
          <div class="notif-av">${av}</div>
          <div class="notif-conn-text">
            <div class="notif-conn-title"><b>${nm}</b> möchte dein Spielpartner werden</div>
            ${time ? `<div class="notif-conn-time">${time}</div>` : ''}
          </div>
        </div>
        <div class="notif-conn-actions">
          <button class="btn btn-primary btn-sm" onclick="acceptConnectionRequest('${cid}','${uid}');closeAllSheets()">${ic('check',14)} Annehmen</button>
          <button class="btn btn-secondary btn-sm" onclick="rejectConnectionRequest('${cid}','${uid}');closeAllSheets()">Ablehnen</button>
        </div>
      </div>`;
  }).join('');
}

// ── Profil-Seite: Spielpartner-Liste ─────────────────────────────
async function renderSpielpartnerSection() {
  const el = document.getElementById('profile-spielpartner');
  if (!el) return;
  if (!sb.isLoggedIn()) { el.innerHTML = ''; return; }
  if (_myConnections === null) await loadMyConnections();

  const myId    = sb.getUserId();
  const accepted = _myConnections.filter(c => c.status === 'accepted');
  const incoming = _myConnections.filter(c => c.status === 'pending' && c.receiver_id === myId);
  const outgoing = _myConnections.filter(c => c.status === 'pending' && c.requester_id === myId);

  if (!accepted.length && !incoming.length && !outgoing.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px 12px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Spielpartner.<br>Besuche Profile anderer Spieler um anzufragen.</div>`;
    return;
  }

  // Alle benötigten Profil-IDs in einem Batch laden
  const profileIds = [...new Set([
    ...accepted.map(c => c.requester_id === myId ? c.receiver_id : c.requester_id),
    ...incoming.map(c => c.requester_id),
    ...outgoing.map(c => c.receiver_id)
  ].filter(Boolean))];

  let profiles = {};
  if (profileIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url,skill_level&id=in.(${profileIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { profiles[p.id] = p; });
    } catch(e) {}
  }

  const skillMap = { anfaenger: 'Anfänger', fortgeschritten: 'Fortgeschritten', profi: 'Profi' };

  function profileRow(conn, otherId, actionHtml) {
    const p   = profiles[otherId] || { id: otherId, username: 'Spieler', avatar_emoji: '', skill_level: '' };
    const pid = escAttr(p.id);
    const pClick = `showPlayerProfile('${pid}','${escAttr(p.username || '')}','${escAttr(p.avatar_emoji || '')}',null,'${escAttr(p.avatar_url || '')}')`;
    return `<div class="spielpartner-row">
      <div class="sp-av pp-clickable" onclick="${pClick}">${getAvatarHtml(p, { size: 44 })}</div>
      <div class="sp-info">
        <div class="sp-name pp-clickable" onclick="${pClick}">${escHtml(p.username || 'Spieler')}</div>
        ${p.skill_level ? `<div class="sp-sub">${skillMap[p.skill_level] || ''}</div>` : ''}
      </div>
      ${actionHtml}
    </div>`;
  }

  let html = '';

  // 1. Meine Spielpartner (accepted)
  if (accepted.length) {
    html += `<div class="sp-section-title">Meine Spielpartner</div>`;
    html += accepted.map(c => {
      const otherId = c.requester_id === myId ? c.receiver_id : c.requester_id;
      const p = profiles[otherId] || {};
      const pnm = escAttr(p.username || '');
      const pem = escAttr(p.avatar_emoji || '');
      const pur = escAttr(p.avatar_url  || '');
      const oid = escAttr(otherId);
      return profileRow(c, otherId,
        `<button class="btn-icon-sm" title="Nachricht" onclick="event.stopPropagation();openDmConversation('${oid}','${pnm}','${pem}','${pur}')">${ic('chat',15)}</button>`
      );
    }).join('');
  }

  // 2. Eingegangene Anfragen (pending, ich bin receiver)
  if (incoming.length) {
    html += `<div class="sp-section-title">Eingegangene Anfragen</div>`;
    html += incoming.map(c => profileRow(c, c.requester_id,
      `<div class="sp-req-actions">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();acceptConnectionRequest('${escAttr(c.id)}','${escAttr(c.requester_id)}')" aria-label="Annehmen">${ic('check',14)}</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();rejectConnectionRequest('${escAttr(c.id)}','${escAttr(c.requester_id)}')" aria-label="Ablehnen">${ic('x',14)}</button>
      </div>`
    )).join('');
  }

  // 3. Gesendete Anfragen (pending, ich bin requester)
  if (outgoing.length) {
    html += `<div class="sp-section-title">Gesendete Anfragen</div>`;
    html += outgoing.map(c => profileRow(c, c.receiver_id,
      `<button class="btn-icon-sm sp-withdraw" title="Zurückziehen" onclick="event.stopPropagation();cancelConnectionRequest('${escAttr(c.id)}','${escAttr(c.receiver_id)}')">↩</button>`
    )).join('');
  }

  el.innerHTML = html;
}
