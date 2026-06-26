// ╔══════════════════════════════════════════════════════════════╗
// ║           MITSPIELER-GESUCH DETAIL + CHAT                   ║
// ╚══════════════════════════════════════════════════════════════╝
let currentPsEventId = null;
let psChatPollTimer  = null;

function showPlayerSearchDetail(psId) {
  const allSrc = allPlayerSearches.length ? allPlayerSearches : FALLBACK_PLAYER_SEARCHES;
  const ps = allSrc.find(p => p.id === psId);
  if(!ps) return;
  currentPsEventId = psId;

  const pClick = ps.userId
    ? `event.stopPropagation();showPlayerProfile('${escAttr(ps.userId)}','${escAttr(ps.username||'')}','${escAttr(ps.avatarEmoji||'')}')`
    : '';

  // Avatar
  const avHtml = ps.avatarEmoji
    ? `<div class="${pClick?'pp-clickable':''}" style="width:52px;height:52px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0;border:2px solid var(--border);cursor:${pClick?'pointer':'default'};" ${pClick?`onclick="${pClick}"`:''}>${ps.avatarEmoji}</div>`
    : `<div class="${pClick?'pp-clickable':''}" style="flex-shrink:0;" ${pClick?`onclick="${pClick}"`:''}>${initAvatar(ps.username || '?', 52)}</div>`;

  const spielartMap = {casual:'Just 4 Fun', training:'Training', ranked:'Punktspiel', punktspiel:'Punktspiel'};
  const spielartLabel = spielartMap[ps.spielart] || 'Mitspieler';

  const metaParts = [];
  if(ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`${ic('pin',13)} ${ps.umkreis} Umkreis`);
  if(ps.wann    && ps.wann    !== 'Egal') metaParts.push(`${ic('clock',13)} ${escHtml(ps.wann)}`);

  document.getElementById('psd-hero').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;padding:16px 20px 12px;">
      ${avHtml}
      <div style="flex:1;min-width:0;">
        <div class="${pClick?'pp-clickable':''}" style="font-family:var(--font-head);font-size:1.05rem;font-weight:800;color:var(--text);margin-bottom:5px;cursor:${pClick?'pointer':'default'};width:fit-content;" ${pClick?`onclick="${pClick}"`:''}>${escHtml(ps.username || 'Spieler')}</div>
        <span class="ev-type-pill pill-${ps.spielart || 'casual'}">${spielartLabel} gesucht</span>
        ${metaParts.length ? `<div style="font-size:0.78rem;color:var(--text-dim);margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">${metaParts.join('<span style="margin:0 2px;opacity:.4;">·</span>')}</div>` : ''}
      </div>
    </div>
    ${ps.message ? `<div style="margin:0 20px 14px;padding:10px 14px;background:var(--surface2);border-radius:10px;font-size:0.84rem;color:var(--text-dim);line-height:1.5;font-style:italic;">"${escHtml(ps.message)}"</div>` : ''}`;

  // Mod-Delete-Button
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const modDelEl = document.getElementById('psd-mod-actions');
  if (modDelEl) modDelEl.innerHTML = isMod
    ? `<button class="btn btn-secondary btn-full btn-sm" style="color:#e53935;margin:0 20px 12px;" onclick="deletePlayerSearch(${psId})">🗑 Gesuch löschen</button>`
    : '';

  // Chat state
  const isReal = allPlayerSearches.some(p => p.id === psId);
  const inputRow = document.getElementById('psd-chat-input-row');
  document.getElementById('psd-chat-feed').innerHTML = '<div class="chat-empty">Lade Nachrichten…</div>';

  openSheet('ps-detail-sheet');
  markEventSeen(psId);

  if(isReal) {
    loadPsChat(psId);
    startPsChatPolling(psId);
    inputRow.style.display = sb.isLoggedIn() ? '' : 'none';
  } else {
    document.getElementById('psd-chat-feed').innerHTML = '<div class="chat-empty">Chat nur für echte Gesuche verfügbar.</div>';
    inputRow.style.display = 'none';
  }
}

async function loadPsChat(eventId) {
  const el = document.getElementById('psd-chat-feed');
  if(!el) return;
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('event_id', eventId).order('created_at');
    const {data, error} = await qb.execute();
    if(error) { el.innerHTML = '<div class="chat-empty">Chat nicht verfügbar.</div>'; return; }
    _renderPsChatMessages(data || []);
  } catch(e) {
    el.innerHTML = '<div class="chat-empty">Chat nicht verfügbar.</div>';
  }
}

function _renderPsChatMessages(messages) {
  const el  = document.getElementById('psd-chat-feed');
  if(!el) return;
  const myId = sb.getUserId();
  if(!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Nachrichten – schreib als Erster! 💬</div>';
    return;
  }
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  el.innerHTML = messages.map(m => {
    const isMine = m.user_id === myId;
    const name   = m.profiles?.username || 'Anonym';
    const emoji  = m.profiles?.avatar_emoji || '';
    const uid    = m.user_id || '';
    const time   = new Date(m.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    const avClick = uid ? `onclick="event.stopPropagation();showPlayerProfile('${escAttr(uid)}','${escAttr(name)}','${escAttr(emoji)}')"` : '';
    const avatar  = `<div class="chat-av pp-clickable" ${avClick}>${getAvatarHtml(m.profiles, {size: 32})}</div>`;
    const del     = isMod ? ` <button class="msg-delete-btn" onclick="deleteEventMessage('${escAttr(m.id)}','ps')">🗑</button>` : '';
    const preview = escAttr((m.message || '').slice(0, 80));
    const report  = (!isMod && sb.isLoggedIn() && !isMine)
      ? ` <button class="report-btn" data-type="event_message" data-id="${escAttr(m.id)}" data-preview="${preview}" onclick="openReportFromBtn(this)" title="Melden">🚩</button>`
      : '';
    return `<div class="chat-msg ${isMine?'mine':''}">
      ${avatar}
      <div class="chat-bubble-wrap">
        <div class="chat-bubble">${escHtml(m.message)}</div>
        <div class="chat-msg-meta">${isMine ? 'Du' : escHtml(name)} · ${time}${del}${report}</div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendPsChatMessage() {
  if(!sb.isLoggedIn()) { showToast('Bitte zuerst anmelden','⚠️'); return; }
  const input = document.getElementById('psd-chat-input');
  const msg   = input.value.trim();
  if(!msg || !currentPsEventId) return;
  input.value = '';
  const qb = new QueryBuilder('event_messages');
  const {error} = await qb.insert({
    event_id: currentPsEventId,
    user_id:  sb.getUserId(),
    message:  msg
  });
  if(error) { showToast('Fehler beim Senden','❌'); input.value = msg; return; }
  await loadPsChat(currentPsEventId);
  markEventSeen(currentPsEventId);
}

function startPsChatPolling(eventId) {
  stopPsChatPolling();
  psChatPollTimer = setInterval(() => {
    if(currentPsEventId === eventId) loadPsChat(eventId);
  }, 4000);
}
function stopPsChatPolling() {
  if(psChatPollTimer) { clearInterval(psChatPollTimer); psChatPollTimer = null; }
}
