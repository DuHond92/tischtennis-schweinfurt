// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENT DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentEventId           = null;
let chatPollTimer            = null;
let _chatLoadPending         = false;
let _participantsLoadPending = false;
let _chatFailed              = false;
let _participantsFailed      = false;
let _edsMapInstance          = null;
let _eventDetailReturn       = null;
let _edsResumeListenerAdded  = false;

function _closeEventDetail() {
  const ret = _eventDetailReturn;
  _eventDetailReturn = null;
  if (ret) {
    openSheet(ret);
  } else {
    closeAllSheets();
  }
}

const EVENT_FALLBACK = 'images/placeholders/game_fun.webp';

// ── Standort-Karte ────────────────────────────────────────────────
function _destroyEdsMap() {
  if (_edsMapInstance) {
    _edsMapInstance.remove();
    _edsMapInstance = null;
  }
}

async function _initEdsMapPreview(lat, lng) {
  _destroyEdsMap();
  const container = document.getElementById('eds-map-preview');
  if (!container) return;

  if (typeof _loadMapLibraries === 'function') await _loadMapLibraries();

  _edsMapInstance = L.map(container, {
    center: [lat, lng],
    zoom: 15,
    scrollWheelZoom: false,
    dragging: false,
    zoomControl: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    attributionControl: true
  });

  L.maplibreGL({
    style: document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/liberty',
    attribution: '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(_edsMapInstance);

  L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: '#3b7cf4',
    color: '#fff',
    weight: 2.5,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(_edsMapInstance);

  // Leaflet braucht sichtbaren Container — nach Sheet-Animation invalidieren
  setTimeout(() => { if (_edsMapInstance) _edsMapInstance.invalidateSize(); }, 400);
}

function _buildLocationInfoHtml(ev) {
  const tbl       = tables.find(t => t.id === ev.tid) || {};
  const placeName = (ev.tname && ev.tname !== '?') ? ev.tname : (tbl.name || '');
  const addr      = tbl.addr || ev.colLocationLabel || '';
  return `
    ${placeName ? `<div class="eds-loc-name">${ev.tid
      ? `<span class="eds-loc-link" onclick="closeAllSheets();focusTableOnMap(${ev.tid})">${icPlate(15)} ${escHtml(placeName)}</span>`
      : `${icPlate(15)} ${escHtml(placeName)}`}</div>` : ''}
    ${addr      ? `<div class="eds-loc-addr">${escHtml(addr)}</div>` : ''}
  `;
}

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
        <div class="ds-no-img-hint"><span class="nimg-icon"><svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='9' cy='10' r='6'/><path d='M13.5 14.5 19 20'/><path d='M17.5 18.5a2 2 0 1 0 2.83-2.83'/><circle cx='21' cy='4' r='2'/></svg></span>Kein Bild vorhanden</div>
      </div>`;

  const thumbs = hasImgs
    ? images.map((src, i) =>
        `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
          <img src="${escAttr(src)}" onerror="this.src='${f}'" loading="lazy">
        </div>`
      ).join('')
    : '';

  const navHtml = hasImgs && images.length > 1 ? `
    <button class="ds-nav ds-prev" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),-1)">‹</button>
    <button class="ds-nav ds-next" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),1)">${ic('chevron-right', 16)}</button>` : '';

  return `
    <div class="detail-slider" data-idx="0" data-count="${hasImgs ? images.length : 1}">
      <div class="ds-main">
        <div class="ds-slides-wrap">${slides}</div>
        ${hasImgs && images.length > 1 ? `<div class="ds-counter">1/${images.length}</div>` : ''}
        ${navHtml}
      </div>
      <div class="ds-thumbs">
        ${thumbs}
        <div class="ds-thumb-add" onclick="openEventDetailPhotoLibrary()">+</div>
      </div>
    </div>
    <input type="file" id="ev-file-input" accept="image/*" style="display:none" onchange="handleDetailImageUpload(this)">`;
}

function isEventCompleted(ev) {
  if (!ev || !ev.dateStr) return false;
  // 1. Expliziter DB-Status
  if (ev.status === 'completed') return true;
  if (ev.status === 'cancelled') return false; // Abgesagt ≠ Abgeschlossen
  const timeStr = ev.time || '00:00';
  const start   = new Date(`${ev.dateStr}T${timeStr}`);
  if (isNaN(start.getTime())) return false;
  const now = Date.now();
  // 2. Eingetragene Endzeit
  if (ev.endTime) {
    const end = new Date(`${ev.dateStr}T${ev.endTime}`);
    if (!isNaN(end.getTime())) return now > end.getTime();
  }
  // 3. Fallback: 3 Stunden nach Startzeit
  return now > start.getTime() + 3 * 60 * 60 * 1000;
}

function showEventDetail(eventId) {
  const ev  = allEvents.find(e => e.id === eventId);
  if(!ev) return;
  currentEventId = eventId;
  const isCompleted = isEventCompleted(ev);

  // Eigenes Eventbild > Plattenbild > kein Headerbild.
  const sliderPhotos = Array.isArray(ev.photos) ? ev.photos.filter(Boolean) : [];
  const sliderEl = document.getElementById('eds-slider');
  sliderEl.innerHTML = buildEventSlider(sliderPhotos);
  sliderEl.style.display = sliderPhotos.length ? '' : 'none';

  // Titel
  document.getElementById('eds-title').textContent = ev.name;

  // Type pill
  document.getElementById('eds-type-pill').innerHTML = gameTypePill(ev.type)
    + (isCompleted ? '<span class="ev-type-pill" style="background:var(--bg-card);color:var(--text-dim);border:1.5px solid var(--border);">Abgeschlossen</span>' : '');

  // Meta
  document.getElementById('eds-meta').innerHTML = _eventMetaHtml(ev);

  // Description
  const descSection = document.getElementById('eds-desc-section');
  const descEl = document.getElementById('eds-desc');
  if(ev.desc && ev.desc.trim() && descSection && descEl) {
    descEl.innerHTML = _descHtml(ev.desc);
    descSection.style.display = '';
  } else if(descSection) {
    descSection.style.display = 'none';
  }

  // Standort-Sektion
  const tbl        = tables.find(t => t.id === ev.tid) || {};
  const mapLat     = ev.colLat ?? tbl.lat ?? null;
  const mapLng     = ev.colLng ?? tbl.lng ?? null;
  const hasPlace   = !!(ev.tname && ev.tname !== '?') || !!(tbl.name) || !!(ev.colLocationLabel);
  const locSection = document.getElementById('eds-location-section');
  const locInfo    = document.getElementById('eds-location-info');
  const mapEl      = document.getElementById('eds-map-preview');
  _destroyEdsMap();
  if (locSection && locInfo) {
    if (hasPlace || (mapLat != null && mapLng != null)) {
      locInfo.innerHTML = _buildLocationInfoHtml(ev);
      locSection.style.display = '';
      if (mapEl) mapEl.style.display = (mapLat != null && mapLng != null) ? '' : 'none';
    } else {
      locSection.style.display = 'none';
    }
  }

  // Floating CTA (host / bereits dabei / teilnehmen)
  const myId        = sb.getUserId();
  const isHost      = myId && ev.creatorId === myId;
  const isAlreadyIn = !isHost && myId && ev.participants.some(p => p.id === myId);
  const isFull      = ev.p >= ev.max && !isHost && !isAlreadyIn;
  const isMod       = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const actEl       = document.getElementById('eds-actions');
  const delBtn      = isMod ? `<button class="btn btn-error" style="flex:0 0 auto;padding:10px 14px;" onclick="deleteEvent(${ev.id})" title="Event löschen"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>` : '';
  if (isCompleted && !isHost) {
    actEl.innerHTML = `<div style="flex:1;padding:12px 0;text-align:center;font-size:var(--text-ui);color:var(--text-dim);">Diese Spielrunde ist bereits beendet.</div>${delBtn}`;
  } else if (isHost) {
    actEl.innerHTML = `<button class="btn btn-secondary" style="flex:1;" onclick="openEditEvent(${ev.id})">Bearbeiten</button>${delBtn}`;
  } else if (isAlreadyIn) {
    actEl.innerHTML = `<button class="btn btn-primary" style="flex:1;" onclick="leaveEventFromDetail(${ev.id})">Dabei</button>${delBtn}`;
  } else if (isFull) {
    actEl.innerHTML = `<button class="btn btn-secondary" style="flex:1;" disabled>Ausgebucht</button>${delBtn}`;
  } else {
    actEl.innerHTML = `<button class="btn btn-primary" style="flex:1;" id="eds-join-btn" onclick="joinEventFromDetail(${ev.id})">Teilnehmen</button>${delBtn}`;
  }

  // Reset participants & chat
  _chatLoadPending         = false;
  _participantsLoadPending = false;
  _chatFailed              = false;
  _participantsFailed      = false;
  document.getElementById('eds-participants').innerHTML = '<div style="display:flex;gap:6px;" aria-hidden="true"><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div></div>';
  document.getElementById('eds-chat-feed').innerHTML    = skeletonList('comment', 3);

  // Show/hide chat input for non-fallback events
  const isFallback = allEvents.length === 0;
  document.getElementById('eds-chat-input-row').style.display = isFallback ? 'none' : '';

  // Map-Wrapper klickbar machen (ruft openMapsDirections() aus tables.js)
  const mapWrap  = document.getElementById('eds-map-wrap');
  if (mapWrap) {
    const locName  = tbl.name || ev.tname || '';
    const locAddr  = tbl.addr || ev.colLocationLabel || '';
    const hasAction = (mapLat != null && mapLng != null) || !!locName || !!locAddr;
    if (hasAction) {
      mapWrap.classList.add('is-clickable');
      mapWrap.setAttribute('role', 'button');
      mapWrap.setAttribute('tabindex', '0');
      mapWrap.setAttribute('aria-label', 'Standort in Karten öffnen');
      mapWrap.onclick = () => openMapsDirections(
        mapLat != null ? String(mapLat) : '',
        mapLng != null ? String(mapLng) : '',
        locName,
        locAddr
      );
      mapWrap.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') mapWrap.onclick(); };
    } else {
      mapWrap.classList.remove('is-clickable');
      mapWrap.removeAttribute('role');
      mapWrap.removeAttribute('tabindex');
      mapWrap.removeAttribute('aria-label');
      mapWrap.onclick = null;
      mapWrap.onkeydown = null;
    }
  }

  // Return-Ziel: zurück zum Table-Detail falls von dort geöffnet
  _eventDetailReturn = null;
  const _tdsEl = document.getElementById('table-detail-sheet');
  if (_tdsEl && _tdsEl.classList.contains('open')) {
    _eventDetailReturn = 'table-detail-sheet';
  }
  openSheet('event-detail-sheet');

  // Map-Init nach Sheet-Animation
  if (mapLat != null && mapLng != null) {
    setTimeout(() => _initEdsMapPreview(mapLat, mapLng), 420);
  }
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
    document.getElementById('eds-chat-feed').innerHTML = '<div class="chat-empty">Noch keine Kommentare – schreib als Erster!</div>';
  }
}

async function loadEventParticipants(eventId) {
  if (_participantsLoadPending) return;
  _participantsLoadPending = true;
  if (typeof ptLog === 'function') ptLog('participants', 'loadEventParticipants START', { eventId });
  const el = document.getElementById('eds-participants');
  try {
    const qb = new QueryBuilder('event_participants');
    qb._select = 'user_id';
    qb.eq('event_id', eventId);
    const {data: pData, error} = await qb.execute();
    if (error || !pData || !pData.length) {
      if (typeof ptLog === 'function') ptLog('participants', error ? 'HTTP error — empty' : 'empty');
      _participantsFailed = false;
      el.innerHTML = '<div class="participants-empty">Noch keine Spieler</div>';
      return;
    }
    const userIds = pData.map(p => p.user_id).filter(Boolean);
    const profMap = {};
    if (userIds.length) {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${userIds.join(',')})`;
      const {ok, data: profs} = await fetchWithRefresh(url, {headers: dbHeaders()});
      if (ok && Array.isArray(profs)) profs.forEach(p => { profMap[p.id] = p; });
    }
    if (typeof ptLog === 'function') ptLog('participants', 'loadEventParticipants DONE', { count: pData.length });
    _participantsFailed = false;
    const ev = allEvents.find(e => e.id === eventId);
    renderParticipantChips(pData.map(p => ({user_id: p.user_id, profiles: profMap[p.user_id] || null})), ev?.creatorId);
  } catch(e) {
    if (typeof ptLogError === 'function') ptLogError('participants', 'loadEventParticipants FINAL ERROR — zeige Fehlerzustand', e);
    _participantsFailed = true;
    if (el) el.innerHTML = '<div class="participants-empty">Spieler konnten nicht geladen werden. <button class="pt-retry-btn" onclick="reloadEventParticipants()">Erneut versuchen</button></div>';
  } finally {
    _participantsLoadPending = false;
  }
}

function reloadEventParticipants() {
  if (typeof ptLog === 'function') ptLog('participants', 'RETRY durch Nutzer', { eventId: currentEventId });
  if (!currentEventId) return;
  const el = document.getElementById('eds-participants');
  if (el) el.innerHTML = '<div style="display:flex;gap:6px;" aria-hidden="true"><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div><div class="skeleton skeleton-avatar" style="width:28px;height:28px;"></div></div>';
  _participantsFailed      = false;
  _participantsLoadPending = false;
  loadEventParticipants(currentEventId);
}

function renderParticipantChips(participants, creatorId) {
  const el = document.getElementById('eds-participants');
  if(!participants.length) {
    el.innerHTML = '<div class="participants-empty">Noch keine Spieler</div>';
    return;
  }
  el.innerHTML = participants.map(p => {
    const isHost  = p.user_id === creatorId;
    const name    = p.profiles?.username || 'Anonym';
    const emoji   = p.profiles?.avatar_emoji || '';
    const avUrl   = p.profiles?.avatar_url   || '';
    const uid     = p.user_id || '';
    const ctx     = isHost ? 'Host dieser Spielrunde' : '';
    const click   = `showPlayerProfile('${uid}','${escAttr(name)}','${escAttr(emoji)}','${ctx}','${escAttr(avUrl)}')`;
    const avatarHtml = `<div class="pc-avatar" style="position:relative;">
      ${getAvatarHtml(p.profiles, {size: 46})}
      ${isHost ? '' : ''}
    </div>`;
    return `<div class="participant-chip pp-clickable" onclick="${click}">
      ${avatarHtml}
      <div class="pc-name">${name}</div>
      ${isHost ? '<div class="pc-host-label">Host</div>' : ''}
    </div>`;
  }).join('');
}

async function loadEventChat(eventId) {
  if (_chatLoadPending) return;
  _chatLoadPending = true;
  if (typeof ptLog === 'function') ptLog('chat', 'loadEventChat START', { eventId });
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id';
    qb.eq('event_id', eventId).order('created_at');
    const {data: msgs, error} = await qb.execute();
    if (error) {
      if (typeof ptLog === 'function') ptLog('chat', 'HTTP error');
      _chatFailed = false;
      renderChatMessages(null);
      return;
    }
    if (!msgs || !msgs.length) {
      if (typeof ptLog === 'function') ptLog('chat', 'empty');
      _chatFailed = false;
      renderChatMessages([]);
      return;
    }
    const userIds = [...new Set(msgs.map(m => m.user_id).filter(Boolean))];
    const profMap = {};
    if (userIds.length) {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${userIds.join(',')})`;
      const {ok, data: profs} = await fetchWithRefresh(url, {headers: dbHeaders()});
      if (ok && Array.isArray(profs)) profs.forEach(p => { profMap[p.id] = p; });
    }
    if (typeof ptLog === 'function') ptLog('chat', 'loadEventChat DONE', { count: msgs.length });
    _chatFailed = false;
    renderChatMessages(msgs.map(m => ({...m, profiles: profMap[m.user_id] || null})));
  } catch(e) {
    if (typeof ptLogError === 'function') ptLogError('chat', 'loadEventChat FINAL ERROR — zeige Fehlerzustand', e);
    _chatFailed = true;
    _renderChatError();
  } finally {
    _chatLoadPending = false;
  }
}

function _renderChatError() {
  const el = document.getElementById('eds-chat-feed');
  if (el) el.innerHTML = '<div class="chat-empty">Kommentare nicht verfügbar. <button class="pt-retry-btn" onclick="reloadEventChat()">Erneut versuchen</button></div>';
}

function reloadEventChat() {
  if (typeof ptLog === 'function') ptLog('chat', 'RETRY durch Nutzer', { eventId: currentEventId });
  if (!currentEventId) return;
  const el = document.getElementById('eds-chat-feed');
  if (el) el.innerHTML = skeletonList('comment', 3);
  _chatFailed      = false;
  _chatLoadPending = false;
  loadEventChat(currentEventId);
}

function renderChatMessages(messages) {
  const el    = document.getElementById('eds-chat-feed');
  const myId  = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  if (!messages) {
    _renderChatError();
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
  const _d     = new Date(m.created_at);
  const date   = _d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  const time   = _d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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
         data-user-id="${escAttr(m.user_id || '')}"
         onclick="openCommentDotMenu(this)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>`
    : '';
  return `<div class="comment-item">
    <div class="comment-av">${av}</div>
    <div class="comment-body">
      <div class="comment-meta">
        <span class="comment-author">${escHtml(name)}</span>
        <span class="comment-date">· ${date} · ${time}</span>
        ${dotBtn}
      </div>
      <div class="comment-text">${escHtml(m.message)}</div>
    </div>
  </div>`;
}

function deleteEventMessage(messageId, context) {
  showConfirmDialog({
    title: 'Nachricht löschen?',
    body: 'Die Nachricht wird dauerhaft entfernt.',
    confirmLabel: 'Löschen',
    danger: true,
    onConfirm: async () => {
      const { ok } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/event_messages?id=eq.${encodeURIComponent(messageId)}`,
        { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
      );
      if (!ok) { showToast('Fehler beim Löschen', 'error'); return; }
      _logModAction('delete_event_message', 'event_message', messageId);
      showToast('Nachricht gelöscht');
      if (context === 'ps') loadPsChat(currentPsEventId);
      else loadEventChat(currentEventId);
    }
  });
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
  if(error) { showToast('Fehler beim Senden','error'); input.value = msg; return; }
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

function _eventMetaHtml(ev) {
  const hostLink = ev.creatorId
    ? `<b class="pp-clickable" style="cursor:pointer;" onclick="showPlayerProfile('${escAttr(ev.creatorId)}','${escAttr(ev.creator||'')}','${escAttr(ev.creatorEmoji||'')}',null,'${escAttr(ev.creatorAvatarUrl||'')}')">` + escHtml(ev.creator || '') + '</b>'
    : '<b>' + escHtml(ev.creator || '') + '</b>';
  return `${ic('calendar')} ${formatEventDateTime(ev.dateStr, ev.time)}<br>${icPlate(13)} ${ev.tname} &nbsp;·&nbsp; ${ic('user')} von ${hostLink}<br>${ic('users')} ${ev.p}/${ev.max} Spieler`;
}

function _patchEventParticipantJoin(eventId) {
  const ev = allEvents.find(e => e.id === eventId);
  if (!ev) return;
  const uid = sb.getUserId();
  if (ev.participants.some(p => p.id === uid)) return;
  const prof = currentUser
    ? { id: uid, username: currentUser.username || '', avatar_emoji: currentUser.avatar_emoji || '', avatar_url: currentUser.avatar_url || null }
    : { id: uid, username: '', avatar_emoji: '', avatar_url: null };
  ev.participants = [...ev.participants, prof];
  ev.p = ev.participants.length;
  // Aktualisiere Meta-Zeile falls Detail noch offen
  const metaEl = document.getElementById('eds-meta');
  if (metaEl && currentEventId === ev.id) metaEl.innerHTML = _eventMetaHtml(ev);
}

function leaveEventFromDetail(eventId) {
  if (!sb.isLoggedIn()) return;
  currentEventId = eventId;
  openSubSheet('leave-event-sheet');
}

function _patchEventParticipantLeave(eventId) {
  const ev = allEvents.find(e => e.id === eventId);
  if (!ev) return;
  const uid = sb.getUserId();
  ev.participants = ev.participants.filter(p => p.id !== uid);
  ev.p = Math.max(0, ev.p - 1);
  const metaEl = document.getElementById('eds-meta');
  if (metaEl && currentEventId === ev.id) metaEl.innerHTML = _eventMetaHtml(ev);
}

async function _confirmLeaveEvent() {
  const eventId = currentEventId;
  if (!eventId || !sb.isLoggedIn()) return;

  const _leavingEv = allEvents.find(e => e.id === eventId);
  if (isEventCompleted(_leavingEv)) {
    showToast('Diese Spielrunde ist bereits beendet.', 'info');
    closeSubSheet();
    return;
  }

  closeSubSheet();

  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/event_participants?event_id=eq.${eventId}&user_id=eq.${encodeURIComponent(sb.getUserId())}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );

  if (!ok) {
    showToast('Teilnahme konnte nicht zurückgezogen werden', 'error');
    return;
  }

  _patchEventParticipantLeave(eventId);
  PTAnalytics.track('game_left');
  showToast('Du nimmst nicht mehr teil');

  // Detail sofort mit aktuellem Stand neu öffnen
  showEventDetail(eventId);

  // Listen aktualisieren
  renderHome();
  renderEvents();

  // Karten-Marker aktualisieren
  if (typeof mapInit !== 'undefined' && mapInit) {
    if (typeof _refreshMarkerIcons === 'function') _refreshMarkerIcons();
    if (typeof _applyMapFilters === 'function') _applyMapFilters();
  }
}

async function joinEventFromDetail(eventId) {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
  const ev = allEvents.find(e => e.id === eventId);
  if (isEventCompleted(ev)) { showToast('Diese Spielrunde ist bereits beendet.', 'info'); return; }
  const btn = document.getElementById('eds-join-btn');
  if(btn) { btn.disabled = true; btn.textContent = '…'; }

  const isFallback = allEvents.length === 0;
  if(isFallback) {
    setTimeout(() => {
      if(btn) btn.textContent = 'Dabei!';
      showToast('Du nimmst am Event teil!');
    }, 400);
    return;
  }

  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });

  if(error && error.code === '23505') {
    if(btn) btn.textContent = 'Dabei!';
    showToast('Du nimmst bereits teil','info');
    return;
  }
  if(error) {
    if(btn) { btn.disabled = false; btn.textContent = 'Teilnehmen'; }
    showToast('Fehler beim Beitreten','error');
    return;
  }

  if(btn) btn.textContent = 'Dabei!';
  showToast('Du nimmst am Event teil!');
  // Sofort in allEvents patchen — kein loadEvents() nötig
  _patchEventParticipantJoin(eventId);
  // Detail: Chips aus DB neu laden
  await loadEventParticipants(eventId);
  // Listen neu rendern (lesen allEvents, das jetzt aktuell ist)
  renderHome();
  renderEvents();
}

function startGame(eventId) {
  showToast('Spiel gestartet! Viel Spaß!');
}

function openEditEvent(eventId) {
  _createEventFromTds = false;
  _createEventReturnToChoice = false;
  closeAllSheets();
  const ev  = allEvents.find(e => e.id === eventId);
  if(!ev) return;
  _editingEventId = eventId;
  document.getElementById('create-event-sheet-title').textContent = 'Spiel bearbeiten';
  const submitBtn = document.getElementById('create-event-submit-btn');
  submitBtn.textContent = 'Änderungen speichern';
  submitBtn.disabled = false;
  document.getElementById('ev-name').value  = ev.name    || '';
  if (typeof _setEventTableSelection === 'function') _setEventTableSelection(ev.tid || null, ev.tname || '');
  const dateInput = document.getElementById('ev-date');
  const timeInput = document.getElementById('ev-time');
  dateInput.value = ev.dateStr || '';
  timeInput.value = ev.time || '';
  dateInput.dataset.editOriginalValue = dateInput.value;
  timeInput.dataset.editOriginalValue = timeInput.value;
  if (typeof _prepareEventDateTimeFields === 'function') _prepareEventDateTimeFields();
  if (typeof _setFieldError === 'function') {
    _setFieldError('ev-name', null);
    _setFieldError('ev-table', null);
    _setFieldError('ev-date', null);
    _setFieldError('ev-time', null);
    _setFieldError('ev-max', null);
  }
  if (typeof _setEventMode === 'function') _setEventMode(ev.type || 'casual');
  const evMax = document.getElementById('ev-max');
  if (evMax) evMax.value = ev.max || 4;
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = ev.desc || '';
  if (typeof _resetCreateEventImage === 'function') _resetCreateEventImage();
  if (typeof _setExistingCreateEventImage === 'function') _setExistingCreateEventImage(ev.eventPhotos?.[0] || '');
  if (typeof _setEventWizardStep === 'function') _setEventWizardStep(1, 'none');
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
  const sliderContainer = document.getElementById('eds-slider');
  const slider = document.querySelector('#eds-slider .detail-slider');
  if (!slider) return;
  if (sliderContainer) sliderContainer.style.display = '';
  const slidesWrap = slider.querySelector('.ds-slides-wrap');
  const thumbsRow  = slider.querySelector('.ds-thumbs');
  const addBtn     = thumbsRow?.querySelector('.ds-thumb-add');
  if (!slidesWrap || !thumbsRow) return;

  const emptySlide = slidesWrap.querySelector('.ds-slide-empty');
  const hadEmpty = !!emptySlide;
  if (emptySlide) emptySlide.remove();

  const existingUrls = new Set(
    [...slidesWrap.querySelectorAll('.ds-slide[data-img-url]')].map(el => el.dataset.imgUrl)
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
    thumb.innerHTML = `<img src="${escAttr(img.image_url)}" onerror="this.src='${EVENT_FALLBACK}'" loading="lazy">`;
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
    next.className = 'ds-nav ds-next'; next.innerHTML = ic('chevron-right', 16);
    next.onclick = () => detailSliderStep(slider, 1);
    main.appendChild(prev); main.appendChild(next);
  }
}

// ── SHARE ─────────────────────────────────────────────────────────
function buildEventShareUrl(ev) {
  const url = new URL(_getShareBase());
  url.searchParams.set('event', ev.id);
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

// ── Beschreibungs-Helper ──────────────────────────────────────────
const _DESC_LIMIT = 280;

function _descHtml(text) {
  if (!text || !text.trim()) return '';
  if (text.length <= _DESC_LIMIT) return escHtml(text);
  const short = escHtml(text.slice(0, _DESC_LIMIT).trimEnd());
  const full  = escHtml(text);
  return `<span class="desc-short">${short}…</span><span class="desc-full" hidden>${full}</span><button class="desc-more-btn" onclick="toggleDescExpand(this)">Mehr anzeigen</button>`;
}

function toggleDescExpand(btn) {
  const container = btn.parentElement;
  const short     = container.querySelector('.desc-short');
  const full      = container.querySelector('.desc-full');
  const expanding = full && full.hidden;
  if (short) short.hidden = expanding;
  if (full)  full.hidden  = !expanding;
  btn.textContent = expanding ? 'Weniger anzeigen' : 'Mehr anzeigen';
}

// ── App-Resume: neu laden wenn Event-Detail mit Fehlerzustand ─────────
// Einmalig registrieren — kein Duplicate-Listener möglich dank Flag.
function _initEventDetailResumeHandler() {
  if (_edsResumeListenerAdded) return;
  _edsResumeListenerAdded = true;
  if (!window.Capacitor?.isNativePlatform?.()) return;
  const { App } = window.Capacitor?.Plugins || {};
  if (!App) return;
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    const sheet = document.getElementById('event-detail-sheet');
    if (!sheet?.classList.contains('open') || !currentEventId) return;
    const needsParticipants = _participantsFailed && !_participantsLoadPending;
    const needsChat         = _chatFailed && !_chatLoadPending;
    if (!needsParticipants && !needsChat) return;
    if (typeof ptLog === 'function') ptLog('resume', 'App-Resume — Event-Detail Reload', { eventId: currentEventId, participantsFailed: _participantsFailed, chatFailed: _chatFailed });
    if (needsParticipants) reloadEventParticipants();
    if (needsChat)         reloadEventChat();
  });
}
