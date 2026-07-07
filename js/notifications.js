// ╔══════════════════════════════════════════════════════════════╗
// ║           NOTIFICATIONS (Spiel-Chat Badge & Sheet)           ║
// ╚══════════════════════════════════════════════════════════════╝
let notifPollTimer       = null;
let pendingNotifs        = [];   // ungelesene message-Objekte
let _reportNotifs        = [];   // ungelesene report_resolved Notifications
let _suggestionNotifs    = [];   // ungelesene suggestion_approved Notifications

// ── Prüfung auf ungelesene Nachrichten ──────────────────────────
async function checkNotifications() {
  if(!sb.isLoggedIn()) {
    hideNotifBadge();
    pendingNotifs = [];
    return;
  }
  if (localStorage.getItem('tt_notifs_enabled') === '0') {
    hideNotifBadge();
    return;
  }
  const userId = sb.getUserId();

  // 1. Events wo User Creator ist
  const creatorIds = allEvents.filter(e => e.creatorId === userId).map(e => e.id);

  // 2. Gesuche die der User erstellt hat
  const psCreatorIds = allPlayerSearches.filter(ps => ps.userId === userId).map(ps => ps.id);

  // 3. Parallel: Event-Teilnahmen + Gesuche wo User geantwortet hat
  let participantIds   = [];
  let psParticipantIds = [];
  const allPsIds = allPlayerSearches.map(ps => ps.id);

  await Promise.all([
    // Events via event_participants
    (async () => {
      try {
        const qb = new QueryBuilder('event_participants');
        qb._select = 'event_id';
        qb.eq('user_id', userId);
        const {data} = await qb.execute();
        if (data) participantIds = data.map(p => p.event_id);
      } catch(e) { console.warn('notif: participant query failed', e); }
    })(),
    // Gesuche wo der User mindestens eine Antwort geschrieben hat
    allPsIds.length ? (async () => {
      try {
        const url = `${SUPABASE_URL}/rest/v1/event_messages?select=event_id&user_id=eq.${userId}&event_id=in.(${allPsIds.join(',')})`;
        const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
        if (Array.isArray(data)) psParticipantIds = [...new Set(data.map(m => m.event_id))];
      } catch(e) {}
    })() : Promise.resolve()
  ]);

  const myEventIds = [...new Set([...creatorIds, ...participantIds, ...psCreatorIds, ...psParticipantIds])];

  // 4. Nachrichten aus meinen Events — server-seitig gefiltert, kein globales Limit-Problem
  if (myEventIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/event_messages?select=id,message,created_at,user_id,event_id,profiles(username,avatar_emoji,avatar_url)&event_id=in.(${myEventIds.join(',')})&order=created_at.desc&limit=200`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      const messages = Array.isArray(data) ? data : [];
      pendingNotifs = messages.filter(m => {
        if (m.user_id === userId) return false;
        const seenTs = localStorage.getItem('seen_chat_' + m.event_id) || '1970-01-01T00:00:00Z';
        return m.created_at > seenTs;
      });
    } catch(e) {
      console.warn('notif: message query failed', e);
    }
  } else {
    pendingNotifs = [];
  }

  if (typeof checkConnectionNotifications === 'function') await checkConnectionNotifications();
  if (typeof _pollAdminCounts === 'function') await _pollAdminCounts();

  // 5. System-Notifications (report_resolved + suggestion_approved)
  _reportNotifs     = [];
  _suggestionNotifs = [];
  try {
    const rurl = `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${userId}&read_at=is.null&type=in.(report_resolved,suggestion_approved)&order=created_at.desc&limit=20`;
    const { data: rn } = await fetchWithRefresh(rurl, { headers: dbHeaders() });
    (rn || []).forEach(n => {
      if (n.type === 'suggestion_approved') _suggestionNotifs.push(n);
      else                                  _reportNotifs.push(n);
    });
  } catch(e) {}

  const totalBadge = pendingNotifs.length + (pendingConnectionRequests?.length || 0) + _reportNotifs.length + _suggestionNotifs.length;
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

// ── Benachrichtigungen ein/ausschalten ───────────────────────────
function toggleNotifications(enabled) {
  localStorage.setItem('tt_notifs_enabled', enabled ? '1' : '0');
  if (!enabled) {
    pendingNotifs = [];
    hideNotifBadge();
  } else {
    checkNotifications();
  }
}

// ── Als gesehen markieren ────────────────────────────────────────
function markEventSeen(eventId) {
  if(!eventId) return;
  localStorage.setItem('seen_chat_' + eventId, new Date().toISOString());
  pendingNotifs = pendingNotifs.filter(m => m.event_id !== eventId);
  _updateBadgeCount();
}

function markAllSeen() {
  [...new Set(pendingNotifs.map(m => m.event_id))].forEach(id =>
    localStorage.setItem('seen_chat_' + id, new Date().toISOString())
  );
  pendingNotifs = [];
  _updateBadgeCount();
}

function _updateBadgeCount() {
  const total = pendingNotifs.length + (_reportNotifs?.length || 0) + (pendingConnectionRequests?.length || 0);
  total > 0 ? showNotifBadge(total) : hideNotifBadge();
}

// ── Notification-Sheet öffnen und rendern ────────────────────────
function openNotifSheet() {
  renderNotifSheet();
  openSheet('notif-sheet');
  setTimeout(markAllSeen, 1200);
  setTimeout(_markSystemNotifsRead, 1200);
}

async function _markSystemNotifsRead() {
  const all = [..._reportNotifs, ..._suggestionNotifs];
  if (!all.length) return;
  const ids = all.map(n => encodeURIComponent(n.id)).join(',');
  _reportNotifs     = [];
  _suggestionNotifs = [];
  try {
    await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/notifications?id=in.(${ids})`,
      {
        method:  'PATCH',
        headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ read_at: new Date().toISOString() })
      }
    );
  } catch(e) {}
  checkNotifications();
}

function renderNotifSheet() {
  const body = document.getElementById('notif-body');
  if(!body) return;

  if(!sb.isLoggedIn()) {
    body.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">${ic('bell', 36)}</div>
        <div>Melde dich an, um Benachrichtigungen zu sehen.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px;"
          onclick="closeAllSheets();openSheet('auth-sheet')">Anmelden</button>
      </div>`;
    return;
  }

  if(!pendingNotifs.length && !(pendingConnectionRequests?.length) && !_reportNotifs.length && !_suggestionNotifs.length) {
    body.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">${ic('check-circle', 36)}</div>
        <div>Keine neuen Benachrichtigungen</div>
      </div>`;
    return;
  }

  const evSrc = allEvents;
  const evMap = {};
  evSrc.forEach(e => { evMap[e.id] = e; });
  // Mitspieler-Gesuche auch in Map aufnehmen
  allPlayerSearches.forEach(ps => {
    if(!evMap[ps.id]) evMap[ps.id] = { id: ps.id, name: ps.username + ' sucht Mitspieler' };
  });

  const reportHtml = _reportNotifs.map(n => {
    const time = _notifTime(n.created_at);
    return `<div class="notif-item notif-item--report">
      <div class="notif-report-icon">${ic('bell', 20)}</div>
      <div class="notif-content">
        <div class="notif-title"><b>${escHtml(n.title || 'Meldung geprüft')}</b></div>
        <div class="notif-preview">${escHtml(n.body || '')}</div>
        <div class="notif-time">${time}</div>
      </div>
      <div class="notif-dot"></div>
    </div>`;
  }).join('');

  const suggestionHtml = _suggestionNotifs.map(n => {
    const time = _notifTime(n.created_at);
    return `<div class="notif-item notif-item--suggestion">
      <div class="notif-report-icon">${ic('table-tennis', 20)}</div>
      <div class="notif-content">
        <div class="notif-title"><b>${escHtml(n.title || 'Platte freigegeben!')}</b></div>
        <div class="notif-preview">${escHtml(n.body || '')}</div>
        <div class="notif-time">${time}</div>
      </div>
      <div class="notif-dot"></div>
    </div>`;
  }).join('');

  const connHtml = typeof renderConnectionRequestNotifs === 'function' ? renderConnectionRequestNotifs() : '';
  body.innerHTML = suggestionHtml + reportHtml + connHtml + pendingNotifs.slice(0, 20).map(m => {
    const ev      = evMap[m.event_id];
    const evTitle = ev ? ev.name : 'Mitspieler-Gesuch';
    const isPs    = allPlayerSearches.some(ps => ps.id === m.event_id);
    const verb    = isPs ? 'hat geantwortet' : 'hat kommentiert';
    const sender  = m.profiles?.username || 'Jemand';
    const emoji   = m.profiles?.avatar_emoji || '';
    const avUrl   = m.profiles?.avatar_url   || '';
    const uid     = m.user_id || '';
    const avClick = uid ? `onclick="event.stopPropagation();showPlayerProfile('${escAttr(uid)}','${escAttr(sender)}','${escAttr(emoji)}',null,'${escAttr(avUrl)}')"` : '';
    const avHtml  = getAvatarHtml(m.profiles, {size: 38});
    const preview = m.message.length > 60 ? m.message.slice(0, 60) + '…' : m.message;
    const time    = _notifTime(m.created_at);
    return `
      <div class="notif-item" onclick="openNotifEvent(${m.event_id})">
        <div class="notif-av pp-clickable" ${avClick}>${avHtml}</div>
        <div class="notif-content">
          <div class="notif-title"><b>${escHtml(sender)}</b> ${verb} in „${escHtml(evTitle)}"</div>
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
