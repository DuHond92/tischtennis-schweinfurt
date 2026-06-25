// ╔══════════════════════════════════════════════════════════════╗
// ║           SPIELPARTNER (Verbindungen)                        ║
// ╚══════════════════════════════════════════════════════════════╝

let _myConnections   = null;   // null = noch nicht geladen
let _ppCurrentUserId = null;   // aktuell geöffnetes Spielerprofil

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
    return `<button class="btn btn-primary btn-full" onclick="sendConnectionRequest('${oid}')">🤝 Spielpartner anfragen</button>`;
  }

  const cid = escAttr(conn.id);

  if (conn.status === 'pending') {
    if (conn.requester_id === myId) {
      return `<button class="btn btn-secondary btn-full" onclick="cancelConnectionRequest('${cid}','${oid}')">⏳ Anfrage ausstehend <span class="pp-soon">(zurückziehen)</span></button>`;
    } else {
      return `<button class="btn btn-primary btn-full" style="margin-bottom:8px;" onclick="acceptConnectionRequest('${cid}','${oid}')">✅ Anfrage annehmen</button>
<button class="btn btn-secondary btn-full" onclick="rejectConnectionRequest('${cid}','${oid}')">❌ Ablehnen</button>`;
    }
  }

  if (conn.status === 'accepted') {
    return `<button class="btn btn-secondary btn-full conn-accepted" onclick="removeConnection('${cid}','${oid}')">🤝 Spielpartner ✓ <span class="pp-soon">(entfernen)</span></button>`;
  }

  // rejected oder blocked → erneut anfragen erlaubt
  return `<button class="btn btn-primary btn-full" onclick="sendConnectionRequest('${oid}')">🤝 Spielpartner anfragen</button>`;
}

function refreshConnectionButton(otherUserId) {
  if (_ppCurrentUserId === otherUserId) {
    const el = document.getElementById('pp-connection-btn');
    if (el) el.innerHTML = getConnectionButtonHtml(otherUserId);
  }
  if (currentPage === 'profile') renderSpielpartnerSection();
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
  if (error) { showToast('Fehler beim Senden der Anfrage', '❌'); return; }
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner-Anfrage gesendet!', '🤝');
  refreshConnectionButton(otherUserId);
}

async function cancelConnectionRequest(connectionId, otherUserId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Anfrage zurückgezogen', '↩️');
  refreshConnectionButton(otherUserId);
}

async function acceptConnectionRequest(connectionId, otherUserId) {
  const qb = new QueryBuilder('player_connections');
  qb.eq('id', connectionId);
  const { error } = await qb.update({ status: 'accepted', updated_at: new Date().toISOString() });
  if (error) { showToast('Fehler beim Annehmen', '❌'); return; }
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner hinzugefügt! 🎉', '✅');
  refreshConnectionButton(otherUserId);
  checkConnectionNotifications();
}

async function rejectConnectionRequest(connectionId, otherUserId) {
  const qb = new QueryBuilder('player_connections');
  qb.eq('id', connectionId);
  const { error } = await qb.update({ status: 'rejected', updated_at: new Date().toISOString() });
  if (error) { showToast('Fehler beim Ablehnen', '❌'); return; }
  _myConnections = null;
  await loadMyConnections();
  refreshConnectionButton(otherUserId);
  checkConnectionNotifications();
}

async function removeConnection(connectionId, otherUserId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner entfernt', '👋');
  refreshConnectionButton(otherUserId);
}

async function removeConnectionFromProfile(connectionId, partnerId) {
  await _deleteConnection(connectionId);
  _myConnections = null;
  await loadMyConnections();
  showToast('Spielpartner entfernt', '👋');
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
          <button class="btn btn-primary btn-sm" onclick="acceptConnectionRequest('${cid}','${uid}');closeAllSheets()">✅ Annehmen</button>
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

  if (!accepted.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px 12px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Spielpartner.<br>Besuche Profile anderer Spieler um anzufragen.</div>`;
    return;
  }

  const partnerIds = accepted.map(c => c.requester_id === myId ? c.receiver_id : c.requester_id);
  let partnerProfiles = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url,skill_level&id=in.(${partnerIds.join(',')})`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    partnerProfiles = Array.isArray(data) ? data : [];
  } catch(e) {}

  const skillMap = { anfaenger: '🐣 Anfänger', fortgeschritten: '🏓 Fortgeschritten', profi: '⚡ Profi' };
  el.innerHTML = partnerProfiles.map(p => {
    const conn = accepted.find(c => c.requester_id === p.id || c.receiver_id === p.id);
    const cid  = escAttr(conn?.id || '');
    return `<div class="spielpartner-row" onclick="showPlayerProfile('${escAttr(p.id)}','${escAttr(p.username)}','${escAttr(p.avatar_emoji || '')}')">
      <div class="sp-av">${getAvatarHtml(p, { size: 44 })}</div>
      <div class="sp-info">
        <div class="sp-name">${escHtml(p.username)}</div>
        ${p.skill_level ? `<div class="sp-sub">${skillMap[p.skill_level] || ''}</div>` : ''}
      </div>
      <button class="btn-icon-sm" title="Entfernen" onclick="event.stopPropagation();removeConnectionFromProfile('${cid}','${escAttr(p.id)}')">✕</button>
    </div>`;
  }).join('');
}
