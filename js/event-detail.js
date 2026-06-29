// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENT DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentEventId = null;
let chatPollTimer  = null;

const EVENT_FALLBACK = 'images/placeholders/game_fun.png';

function buildEventSlider(images) {
  const hasImgs = images && images.length;
  const f = EVENT_FALLBACK;

  const slides = hasImgs
    ? images.map((src, i) => {
        const s = escAttr(src), l = i === 0 ? 'eager' : 'lazy';
        return `<div class="ds-slide" data-img-url="${s}" style="${i===0?'':'display:none'}">
          <img class="ds-slide-bg" src="${s}" onerror="this.style.display='none'" aria-hidden="true" alt="" loading="${l}">
          <img class="ds-slide-img" src="${s}" onerror="this.src='${f}'" loading="${l}">
        </div>`;
      }).join('')
    : `<div class="ds-slide ds-slide-empty">
        <div class="ds-no-img-hint"><span class="nimg-icon">🏓</span>Kein Bild vorhanden</div>
      </div>`;

  const thumbs = hasImgs
    ? images.map((src, i) =>
        `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
          <img src="${escAttr(src)}" onerror="this.src='${f}'">
        </div>`
      ).join('')
    : '';

  const navHtml = hasImgs && images.length > 1 ? `
    <button class="ds-nav ds-prev" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),-1)">‹</button>
    <button class="ds-nav ds-next" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),1)">›</button>` : '';

  return `
    <div class="detail-slider" data-idx="0" data-count="${hasImgs ? images.length : 1}">
      <div class="ds-main">
        <div class="ds-slides-wrap">${slides}</div>
        ${hasImgs && images.length > 1 ? `<div class="ds-counter">1/${images.length}</div>` : ''}
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
  const ev  = allEvents.find(e => e.id === eventId);
  if(!ev) return;
  currentEventId = eventId;

  // Bild-Slider – Punktspiel-Placeholder wenn kein Foto hochgeladen
  const sliderPhotos = (ev.photos && ev.photos.length)
    ? ev.photos
    : ev.type === 'punktspiel' ? ['images/placeholders/game_tournament.png']
    : ev.type === 'casual'     ? ['images/placeholders/game_fun.png']
    : ev.type === 'training'   ? ['images/placeholders/game_training.png']
    : ['images/placeholders/game_fun.png'];
  document.getElementById('eds-slider').innerHTML = buildEventSlider(sliderPhotos);

  // Titel
  document.getElementById('eds-title').textContent = ev.name;

  // Type pill
  document.getElementById('eds-type-pill').innerHTML =
    `<span class="ev-type-pill pill-${ev.type}" style="margin-bottom:6px;display:inline-block;">${typeLabel(ev.type)}</span>`;

  // Meta
  document.getElementById('eds-meta').innerHTML =
    `${ic('calendar')} ${ev.day}. ${ev.mon} &nbsp;·&nbsp; ${ic('clock')} ${ev.time} Uhr<br>${ic('pin')} ${ev.tname} &nbsp;·&nbsp; ${ic('user')} von ${ev.creatorId ? `<b class="pp-clickable" style="cursor:pointer;" onclick="showPlayerProfile('${escAttr(ev.creatorId)}','${escAttr(ev.creator||'')}','${escAttr(ev.creatorEmoji||'')}',null,'${escAttr(ev.creatorAvatarUrl||'')}')">` : '<b>'}${escHtml(ev.creator||'')}</b><br>${ic('users')} ${ev.p}/${ev.max} Teilnehmer`;

  // Description
  const descSection = document.getElementById('eds-desc-section');
  const descEl = document.getElementById('eds-desc');
  if(ev.desc && descSection && descEl) {
    descEl.textContent = ev.desc;
    descSection.style.display = '';
  } else if(descSection) {
    descSection.style.display = 'none';
  }

  // Actions (host vs. participant)
  const myId    = sb.getUserId();
  const isHost  = myId && ev.creatorId === myId;
  const isMod   = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const actEl   = document.getElementById('eds-actions');
  const delBtn  = isMod ? `<button class="btn btn-secondary" style="flex:0 0 auto;padding:10px 14px;color:#e53935;" onclick="deleteEvent(${ev.id})" title="Event löschen">🗑</button>` : '';
  if(isHost) {
    actEl.innerHTML = `
      <button class="btn btn-secondary" style="flex:1;" onclick="openEditEvent(${ev.id})">✏️ Bearbeiten</button>
      ${delBtn}`;
  } else {
    actEl.innerHTML =
      `<button class="btn btn-primary" style="flex:1;" id="eds-join-btn" onclick="joinEventFromDetail(${ev.id})">Teilnehmen</button>${delBtn}`;
  }

  // Reset participants & chat
  document.getElementById('eds-participants').innerHTML = '<div class="participants-empty">Lade…</div>';
  document.getElementById('eds-chat-feed').innerHTML    = '<div class="chat-empty">Lade Nachrichten…</div>';

  // Show/hide chat input for non-fallback events
  const isFallback = allEvents.length === 0;
  document.getElementById('eds-chat-input-row').style.display = isFallback ? 'none' : '';

  openSheet('event-detail-sheet');
  _initSliderTouch(document.querySelector('#eds-slider .ds-main'));
  const edsShareBtn = document.getElementById('eds-share-btn');
  if (edsShareBtn) edsShareBtn.onclick = () => shareEvent(ev);
  markEventSeen(eventId);

  // Load data (don't block sheet open)
  loadEventParticipants(eventId);
  loadEventImages(eventId);
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
    qb._select = 'user_id,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('event_id', eventId);
    const {data, error} = await qb.execute();
    if(error || !data) { el.innerHTML = '<div class="participants-empty">Keine Teilnehmer gefunden.</div>'; return; }

    const ev  = allEvents.find(e => e.id === eventId);
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
    const isHost  = p.user_id === creatorId;
    const name    = p.profiles?.username || 'Anonym';
    const emoji   = p.profiles?.avatar_emoji || '';
    const avUrl   = p.profiles?.avatar_url   || '';
    const uid     = p.user_id || '';
    const ctx     = isHost ? '👑 Host dieser Spielrunde' : '';
    const click   = `showPlayerProfile('${uid}','${escAttr(name)}','${escAttr(emoji)}','${ctx}','${escAttr(avUrl)}')`;
    const avatarHtml = `<div class="pc-avatar" style="position:relative;">
      ${getAvatarHtml(p.profiles, {size: 46})}
      ${isHost ? '<span class="pc-crown">👑</span>' : ''}
    </div>`;
    return `<div class="participant-chip pp-clickable" onclick="${click}">
      ${avatarHtml}
      <div class="pc-name">${name}</div>
      ${isHost ? '<div class="pc-host-label">👑 Host</div>' : ''}
    </div>`;
  }).join('');
}

async function loadEventChat(eventId) {
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('event_id', eventId).order('created_at');
    const {data, error} = await qb.execute();
    if(error) { renderChatMessages(null); return; }
    renderChatMessages(data || []);
  } catch(e) {
    renderChatMessages(null);
  }
}

function renderChatMessages(messages) {
  const el    = document.getElementById('eds-chat-feed');
  const myId  = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  if (!messages) {
    el.innerHTML = '<div class="chat-empty">Kommentare nicht verfügbar.</div>';
    return;
  }
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Kommentare – schreib als Erster!</div>';
    return;
  }
  el.innerHTML = messages.map(m => _evtCommentItemHtml(m, myId, isMod)).join('');
}

function _evtCommentItemHtml(m, myId, isMod) {
  const isOwn  = m.user_id === myId;
  const name   = m.profiles?.username || 'Anonym';
  const date   = new Date(m.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const av     = getAvatarHtml(m.profiles, { size: 34 });
  const showDot = sb.isLoggedIn() && (isMod || !isOwn);
  const dotBtn = showDot
    ? `<button class="comment-dot-btn"
         aria-label="Kommentaroptionen"
         data-cid="${escAttr(m.id)}"
         data-content-type="event_message"
         data-ctx="event"
         data-own="${isOwn ? '1' : ''}"
         data-preview="${escAttr((m.message || '').slice(0, 80))}"
         onclick="openCommentDotMenu(this)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>`
    : '';
  return `<div class="comment-item">
    <div class="comment-av">${av}</div>
    <div class="comment-body">
      <div class="comment-meta">
        <span class="comment-author">${escHtml(name)}</span>
        <span class="comment-date">· ${date}</span>
        ${dotBtn}
      </div>
      <div class="comment-text">${escHtml(m.message)}</div>
    </div>
  </div>`;
}

async function deleteEventMessage(messageId, context) {
  if (!confirm('Nachricht wirklich löschen?')) return;
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/event_messages?id=eq.${encodeURIComponent(messageId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }
  _logModAction('delete_event_message', 'event_message', messageId);
  showToast('Nachricht gelöscht');
  if (context === 'ps') loadPsChat(currentPsEventId);
  else loadEventChat(currentEventId);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function sendChatMessage() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
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
  markEventSeen(currentEventId);
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
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
  const btn = document.getElementById('eds-join-btn');
  if(btn) { btn.disabled = true; btn.textContent = '…'; }
  const isFallback = allEvents.length === 0;
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
  const ev  = allEvents.find(e => e.id === eventId);
  if(!ev) return;
  _editingEventId = eventId;
  document.querySelector('#create-event-sheet .sheet-title').textContent = '✏️ Event bearbeiten';
  document.querySelector('#create-event-sheet .btn-primary').textContent = '💾 Speichern';
  document.getElementById('ev-name').value  = ev.name    || '';
  document.getElementById('ev-table').value = ev.tid     || '';
  document.getElementById('ev-date').value  = ev.dateStr || '';
  document.getElementById('ev-time').value  = ev.time    || '';
  document.getElementById('ev-mode').value  = ev.type    || 'casual';
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = ev.desc || '';
  openSheet('create-event-sheet');
}

async function loadEventImages(eventId) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/event_images?select=id,image_url,created_at&event_id=eq.${eventId}&status=eq.approved&order=created_at.asc`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (data && data.length) _appendDbImagesToEventSlider(data);
  } catch(e) {}
}

function _appendDbImagesToEventSlider(dbImages) {
  const slider = document.querySelector('#eds-slider .detail-slider');
  if (!slider) return;
  const slidesWrap = slider.querySelector('.ds-slides-wrap');
  const thumbsRow  = slider.querySelector('.ds-thumbs');
  const addBtn     = thumbsRow?.querySelector('.ds-thumb-add');
  if (!slidesWrap || !thumbsRow) return;

  const emptySlide = slidesWrap.querySelector('.ds-slide-empty');
  const hadEmpty = !!emptySlide;
  if (emptySlide) emptySlide.remove();

  const existingUrls = new Set(
    [...slidesWrap.querySelectorAll('.ds-db-slide')].map(el => el.dataset.imgUrl)
  );

  dbImages.forEach((img, idx) => {
    if (existingUrls.has(img.image_url)) return;
    const currentCount = slider.querySelectorAll('.ds-slide').length;
    const slide = document.createElement('div');
    slide.className = 'ds-slide ds-db-slide';
    slide.style.display = (hadEmpty && idx === 0) ? '' : 'none';
    slide.dataset.imgUrl = img.image_url;
    const su = escAttr(img.image_url);
    slide.innerHTML = `<img class="ds-slide-bg" src="${su}" onerror="this.style.display='none'" aria-hidden="true" alt="" loading="lazy">
      <img class="ds-slide-img" src="${su}" onerror="this.src='${EVENT_FALLBACK}'" loading="lazy">`;
    slidesWrap.appendChild(slide);

    const thumb = document.createElement('div');
    thumb.className = 'ds-thumb ds-db-thumb';
    const i = currentCount;
    thumb.onclick = () => detailSliderGo(slider, i);
    thumb.innerHTML = `<img src="${escAttr(img.image_url)}" onerror="this.src='${EVENT_FALLBACK}'">`;
    thumbsRow.insertBefore(thumb, addBtn);
  });

  const total = slider.querySelectorAll('.ds-slide').length;
  slider.dataset.count = total;
  if (total > 1 && !slider.querySelector('.ds-nav')) {
    const main = slider.querySelector('.ds-main');
    const prev = document.createElement('button');
    prev.className = 'ds-nav ds-prev'; prev.textContent = '‹';
    prev.onclick = () => detailSliderStep(slider, -1);
    const next = document.createElement('button');
    next.className = 'ds-nav ds-next'; next.textContent = '›';
    next.onclick = () => detailSliderStep(slider, 1);
    main.appendChild(prev); main.appendChild(next);
  }
}

// ── SHARE ─────────────────────────────────────────────────────────
function buildEventShareUrl(ev) {
  const url = new URL(window.location.href);
  url.searchParams.set('event', ev.id);
  url.searchParams.delete('table');
  url.searchParams.delete('search');
  return url.toString();
}

async function shareEvent(ev) {
  const name = ev.name || 'Spielrunde';
  const url  = buildEventShareUrl(ev);
  if (navigator.share) {
    try {
      await navigator.share({
        title: name,
        text:  `${name} – auf PlattenTreff ansehen`,
        url
      });
    } catch (e) {
      if (e?.name !== 'AbortError') console.warn('Teilen fehlgeschlagen:', e);
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link kopiert');
  } catch (e) {
    showToast('Link konnte nicht kopiert werden');
  }
}
