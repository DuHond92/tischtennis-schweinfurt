// ╔══════════════════════════════════════════════════════════════╗
// ║           NOTIFICATIONS (Spiel-Chat Badge & Sheet)           ║
// ╚══════════════════════════════════════════════════════════════╝
let notifPollTimer  = null;
let pendingNotifs   = [];   // ungelesene message-Objekte

// ── Prüfung auf ungelesene Nachrichten ──────────────────────────
async function checkNotifications() {
  if(!sb.isLoggedIn()) {
    hideNotifBadge();
    pendingNotifs = [];
    return;
  }
  const userId = sb.getUserId();

  // 1. Events wo User Creator ist (bereits in allEvents)
  const creatorIds = allEvents
    .filter(e => e.creatorId === userId)
    .map(e => e.id);

  // 2. Events wo User Teilnehmer ist
  let participantIds = [];
  try {
    const qb = new QueryBuilder('event_participants');
    qb._select  = 'event_id';
    qb.eq('user_id', userId);
    const {data} = await qb.execute();
    if(data) participantIds = data.map(p => p.event_id);
  } catch(e) { console.warn('notif: participant query failed', e); }

  // 3. Player-Search-Gesuche die der User erstellt hat
  const psCreatorIds = allPlayerSearches
    .filter(ps => ps.userId === userId)
    .map(ps => ps.id);

  const myEventIds = [...new Set([...creatorIds, ...participantIds, ...psCreatorIds])];
  if(!myEventIds.length) { hideNotifBadge(); return; }

  // 3. Letzte 50 Nachrichten (mit Profil-Join)
  let messages = [];
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id,event_id,profiles(username,avatar_emoji,avatar_url)';
    qb.order('created_at', true).limit(50);
    const {data} = await qb.execute();
    messages = data || [];
  } catch(e) { console.warn('notif: message query failed', e); return; }

  // 4. Filtern: meine Events, nicht eigene Nachrichten, neuer als zuletzt gesehen
  pendingNotifs = messages.filter(m => {
    if(!myEventIds.includes(m.event_id)) return false;
    if(m.user_id === userId)             return false;
    const seenTs = localStorage.getItem('seen_chat_' + m.event_id) || '1970-01-01T00:00:00Z';
    return m.created_at > seenTs;
  });

  if (typeof checkConnectionNotifications === 'function') await checkConnectionNotifications();
  if (typeof _pollAdminCounts === 'function') await _pollAdminCounts();
  const totalBadge = pendingNotifs.length + (pendingConnectionRequests?.length || 0);
  totalBadge ? showNotifBadge(totalBadge) : hideNotifBadge();
}

// ── Badge anzeigen / verstecken ──────────────────────────────────
function showNotifBadge(count) {
  const dot = document.getElementById('notif-badge');
  if(!dot) return;
  dot.textContent = count > 9 ? '9+' : String(count);
  dot.style.display = '';
}
function hideNotifBadge() {
  const dot = document.getElementById('notif-badge');
  if(dot) dot.style.display = 'none';
}

// ── Als gesehen markieren ────────────────────────────────────────
function markEventSeen(eventId) {
  if(!eventId) return;
  localStorage.setItem('seen_chat_' + eventId, new Date().toISOString());
  pendingNotifs = pendingNotifs.filter(m => m.event_id !== eventId);
  pendingNotifs.length ? showNotifBadge(pendingNotifs.length) : hideNotifBadge();
}

function markAllSeen() {
  [...new Set(pendingNotifs.map(m => m.event_id))].forEach(id =>
    localStorage.setItem('seen_chat_' + id, new Date().toISOString())
  );
  pendingNotifs = [];
  hideNotifBadge();
}

// ── Notification-Sheet öffnen und rendern ────────────────────────
function openNotifSheet() {
  renderNotifSheet();
  openSheet('notif-sheet');
  setTimeout(markAllSeen, 1200);  // Badge erst nach kurzem Moment löschen
}

function renderNotifSheet() {
  const body = document.getElementById('notif-body');
  if(!body) return;

  if(!sb.isLoggedIn()) {
    body.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">🔔</div>
        <div>Melde dich an, um Benachrichtigungen zu sehen.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px;"
          onclick="closeAllSheets();openSheet('auth-sheet')">Anmelden</button>
      </div>`;
    return;
  }

  if(!pendingNotifs.length && !(pendingConnectionRequests?.length)) {
    body.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">✅</div>
        <div>Keine neuen Benachrichtigungen</div>
      </div>`;
    return;
  }

  const evSrc = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const evMap = {};
  evSrc.forEach(e => { evMap[e.id] = e; });
  // Mitspieler-Gesuche auch in Map aufnehmen
  allPlayerSearches.forEach(ps => {
    if(!evMap[ps.id]) evMap[ps.id] = { id: ps.id, name: ps.username + ' sucht Mitspieler' };
  });

  const connHtml = typeof renderConnectionRequestNotifs === 'function' ? renderConnectionRequestNotifs() : '';
  body.innerHTML = connHtml + pendingNotifs.slice(0, 20).map(m => {
    const ev      = evMap[m.event_id];
    const evTitle = ev ? ev.name : 'Mitspieler-Gesuch';
    const sender  = m.profiles?.username || 'Jemand';
    const emoji   = m.profiles?.avatar_emoji || '';
    const uid     = m.user_id || '';
    const avClick = uid ? `onclick="event.stopPropagation();showPlayerProfile('${escAttr(uid)}','${escAttr(sender)}','${escAttr(emoji)}')"` : '';
    const avHtml  = getAvatarHtml(m.profiles, {size: 38});
    const preview = m.message.length > 60 ? m.message.slice(0, 60) + '…' : m.message;
    const time    = _notifTime(m.created_at);
    return `
      <div class="notif-item" onclick="openNotifEvent(${m.event_id})">
        <div class="notif-av pp-clickable" ${avClick}>${avHtml}</div>
        <div class="notif-content">
          <div class="notif-title"><b>${escHtml(sender)}</b> in „${escHtml(evTitle)}"</div>
          <div class="notif-preview">${escHtml(preview)}</div>
          <div class="notif-time">${time}</div>
        </div>
        <div class="notif-dot"></div>
      </div>`;
  }).join('');
}

function _notifTime(isoStr) {
  if(!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if(diff < 60)    return 'Gerade eben';
  if(diff < 3600)  return `Vor ${Math.floor(diff / 60)} Min.`;
  if(diff < 86400) return `Vor ${Math.floor(diff / 3600)} Std.`;
  return new Date(isoStr).toLocaleDateString('de-DE', {day:'numeric', month:'short'});
}

// ── Klick auf Benachrichtigung → Event öffnen ────────────────────
function openNotifEvent(eventId) {
  markEventSeen(eventId);
  closeAllSheets();
  if(allPlayerSearches.some(ps => ps.id === eventId)) {
    showPlayerSearchDetail(eventId);
  } else {
    showEventDetail(eventId);
  }
}

// ── Polling alle 60 Sekunden ─────────────────────────────────────
function startNotifPolling() {
  if(notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(checkNotifications, 60 * 1000);
}
