// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENT DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentEventId = null;
let chatPollTimer  = null;

const EVENT_TEST_IMAGES = [
  'images/events/event1.webp',
  'images/events/event2.webp',
  'images/events/event3.webp',
];
const EVENT_FALLBACK = 'images/placeholders/placeholder-plate.webp';

function buildEventSlider(images) {
  const imgs = (images && images.length) ? images : EVENT_TEST_IMAGES;

  const slides = imgs.map((src, i) =>
    `<div class="ds-slide" style="${i===0?'':'display:none'}">
      <img src="${src}" onerror="this.src='${EVENT_FALLBACK}'" loading="${i===0?'eager':'lazy'}">
    </div>`
  ).join('');

  const thumbs = imgs.map((src, i) =>
    `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
      <img src="${src}" onerror="this.src='${EVENT_FALLBACK}'">
    </div>`
  ).join('');

  const navHtml = imgs.length > 1 ? `
    <button class="ds-nav ds-prev" onclick="detailSliderStep(this.closest('.detail-slider'),-1)">‹</button>
    <button class="ds-nav ds-next" onclick="detailSliderStep(this.closest('.detail-slider'),1)">›</button>` : '';

  return `
    <div class="detail-slider" data-idx="0" data-count="${imgs.length}">
      <div class="ds-main">
        <div class="ds-slides-wrap">${slides}</div>
        <button class="ds-close" onclick="closeAllSheets()">×</button>
        ${imgs.length > 1 ? `<div class="ds-counter">1/${imgs.length}</div>` : ''}
        ${navHtml}
      </div>
      <div class="ds-thumbs">
        ${thumbs}
        <div class="ds-thumb-add" onclick="document.getElementById('ev-file-input').click()">+</div>
      </div>
    </div>
    <input type="file" id="ev-file-input" accept="image/*" style="display:none" onchange="handleDetailImageUpload(this)">`;
}

function showEventDetail(eventId) {
  const src = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const ev  = src.find(e => e.id === eventId);
  if(!ev) return;
  currentEventId = eventId;

  // Bild-Slider
  document.getElementById('eds-slider').innerHTML = buildEventSlider(ev.images || null);

  // Titel
  document.getElementById('eds-title').textContent = ev.name;

  // Type pill
  const typeLabel = ev.type==='casual' ? 'Just 4 Fun' : ev.type==='ranked' ? 'Wertungsspiel' : ev.type==='training' ? 'Training' : 'Spiel';
  document.getElementById('eds-type-pill').innerHTML =
    `<span class="ev-type-pill pill-${ev.type}" style="margin-bottom:6px;display:inline-block;">${typeLabel}</span>`;

  // Meta
  document.getElementById('eds-meta').innerHTML =
    `${ic('calendar')} ${ev.day}. ${ev.mon} &nbsp;·&nbsp; ${ic('clock')} ${ev.time} Uhr<br>${ic('pin')} ${ev.tname} &nbsp;·&nbsp; ${ic('user')} von <b>${ev.creator}</b><br>${ic('users')} ${ev.p}/${ev.max} Teilnehmer`;

  // Description
  const descEl = document.getElementById('eds-desc');
  if(ev.desc) {
    descEl.textContent = ev.desc;
    descEl.style.display = '';
  } else {
    descEl.style.display = 'none';
  }

  // Actions (host vs. participant)
  const myId    = sb.getUserId();
  const isHost  = myId && ev.creatorId === myId;
  const actEl   = document.getElementById('eds-actions');
  if(isHost) {
    actEl.innerHTML = `
      <button class="btn btn-primary" style="flex:1;" onclick="startGame(${ev.id})">🏓 Spiel starten</button>
      <button class="btn btn-secondary" style="flex:0 0 auto;padding:10px 14px;" onclick="openEditEvent(${ev.id})">✏️</button>`;
  } else {
    actEl.innerHTML =
      `<button class="btn btn-primary btn-full" id="eds-join-btn" onclick="joinEventFromDetail(${ev.id})">Teilnehmen</button>`;
  }

  // Reset participants & chat
  document.getElementById('eds-participants').innerHTML = '<div class="participants-empty">Lade…</div>';
  document.getElementById('eds-chat-feed').innerHTML    = '<div class="chat-empty">Lade Nachrichten…</div>';

  // Show/hide chat input for non-fallback events
  const isFallback = eventId >= 101;
  document.getElementById('eds-chat-input-row').style.display = (isFallback || !sb.isLoggedIn()) ? 'none' : '';

  openSheet('event-detail-sheet');

  // Load data (don't block sheet open)
  loadEventParticipants(eventId);
  if(!isFallback) {
    loadEventChat(eventId);
    startChatPolling(eventId);
  } else {
    document.getElementById('eds-chat-feed').innerHTML = '<div class="chat-empty">Chat für Demo-Events nicht verfügbar.</div>';
  }
}

async function loadEventParticipants(eventId) {
  const el = document.getElementById('eds-participants');
  try {
    const qb = new QueryBuilder('event_participants');
    qb._select = 'user_id,profiles(username,avatar_emoji)';
    qb.eq('event_id', eventId);
    const {data, error} = await qb.execute();
    if(error || !data) { el.innerHTML = '<div class="participants-empty">Keine Teilnehmer gefunden.</div>'; return; }

    const src = allEvents.length ? allEvents : FALLBACK_EVENTS;
    const ev  = src.find(e => e.id === eventId);
    renderParticipantChips(data, ev?.creatorId);
  } catch(e) {
    el.innerHTML = '<div class="participants-empty">Teilnehmer konnten nicht geladen werden.</div>';
  }
}

function renderParticipantChips(participants, creatorId) {
  const el = document.getElementById('eds-participants');
  if(!participants.length) {
    el.innerHTML = '<div class="participants-empty">Noch keine Teilnehmer 🏓</div>';
    return;
  }
  el.innerHTML = participants.map(p => {
    const isHost     = p.user_id === creatorId;
    const name       = p.profiles?.username || 'Anonym';
    const avatarHtml = p.profiles?.avatar_emoji
      ? `<div class="pc-avatar pc-avatar-emoji">
           ${p.profiles.avatar_emoji}
           ${isHost ? '<span class="pc-crown">👑</span>' : ''}
         </div>`
      : `<div class="pc-avatar pc-avatar-init">
           ${initAvatar(name, 46)}
           ${isHost ? '<span class="pc-crown">👑</span>' : ''}
         </div>`;
    return `<div class="participant-chip">
      ${avatarHtml}
      <div class="pc-name">${name}</div>
      ${isHost ? '<div class="pc-host-label">👑 Host</div>' : ''}
    </div>`;
  }).join('');
}

async function loadEventChat(eventId) {
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id,profiles(username,avatar_emoji)';
    qb.eq('event_id', eventId).order('created_at');
    const {data, error} = await qb.execute();
    if(error) { renderChatMessages(null); return; }
    renderChatMessages(data || []);
  } catch(e) {
    renderChatMessages(null);
  }
}

function renderChatMessages(messages) {
  const el  = document.getElementById('eds-chat-feed');
  const myId = sb.getUserId();
  if(!messages) {
    el.innerHTML = '<div class="chat-empty">Chat noch nicht verfügbar (Tabelle wird eingerichtet).</div>';
    return;
  }
  if(!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Nachrichten – schreib als Erster! 💬</div>';
    return;
  }
  el.innerHTML = messages.map(m => {
    const isMine  = m.user_id === myId;
    const avatar  = m.profiles?.avatar_emoji || '🏓';
    const name    = m.profiles?.username || 'Anonym';
    const time    = new Date(m.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    return `<div class="chat-msg ${isMine?'mine':''}">
      <div class="chat-msg-avatar">${avatar}</div>
      <div class="chat-bubble-wrap">
        <div class="chat-bubble">${escHtml(m.message)}</div>
        <div class="chat-msg-meta">${isMine?'Du':name} · ${time}</div>
      </div>
    </div>`;
  }).join('');
  // Scroll to bottom
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendChatMessage() {
  if(!sb.isLoggedIn()) { showToast('Bitte zuerst anmelden','⚠️'); return; }
  const input = document.getElementById('eds-chat-input');
  const msg   = input.value.trim();
  if(!msg || !currentEventId) return;
  input.value = '';
  const qb = new QueryBuilder('event_messages');
  const {error} = await qb.insert({
    event_id: currentEventId,
    user_id:  sb.getUserId(),
    message:  msg
  });
  if(error) { showToast('Fehler beim Senden','❌'); input.value = msg; return; }
  await loadEventChat(currentEventId);
}

function startChatPolling(eventId) {
  stopChatPolling();
  chatPollTimer = setInterval(() => {
    if(currentEventId === eventId) loadEventChat(eventId);
  }, 4000);
}

function stopChatPolling() {
  if(chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
}

async function joinEventFromDetail(eventId) {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  const btn = document.getElementById('eds-join-btn');
  if(btn) { btn.disabled = true; btn.textContent = '…'; }
  const isFallback = eventId >= 101;
  if(isFallback) {
    setTimeout(() => {
      if(btn) { btn.textContent = '✅ Dabei!'; btn.style.background = 'var(--green)'; }
      showToast('🏓 Du nimmst am Event teil!');
    }, 400);
    return;
  }
  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });
  if(error && error.code === '23505') {
    if(btn) { btn.textContent = '✅ Dabei!'; btn.style.background = 'var(--green)'; }
    showToast('Du nimmst bereits teil','ℹ️');
  } else if(error) {
    if(btn) { btn.disabled = false; btn.textContent = 'Teilnehmen'; }
    showToast('Fehler beim Beitreten','❌');
  } else {
    if(btn) { btn.textContent = '✅ Dabei!'; btn.style.background = 'var(--green)'; }
    showToast('🏓 Du nimmst am Event teil!');
    await loadEvents();
    loadEventParticipants(eventId);
  }
}

function startGame(eventId) {
  showToast('🏓 Spiel gestartet! Viel Spaß!','🏆');
}

function openEditEvent(eventId) {
  closeAllSheets();
  const src = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const ev  = src.find(e => e.id === eventId);
  if(!ev) return;
  // Prefill create-event sheet as edit form
  document.querySelector('#create-event-sheet .sheet-title').textContent = '✏️ Event bearbeiten';
  document.getElementById('ev-name').value = ev.name;
  document.getElementById('ev-mode').value = ev.type;
  openSheet('create-event-sheet');
}
