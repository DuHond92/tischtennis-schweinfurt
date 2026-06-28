// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENTS                                             ║
// ╚══════════════════════════════════════════════════════════════╝
let _psCollapsed    = false;
let _gamesCollapsed = false;

function _toggleFeedSection(key) {
  if (key === 'ps') _psCollapsed = !_psCollapsed;
  else              _gamesCollapsed = !_gamesCollapsed;
  const collapsed = key === 'ps' ? _psCollapsed : _gamesCollapsed;
  const wrap    = document.getElementById(`feed-${key}-wrap`);
  const chevron = document.getElementById(`feed-${key}-chevron`);
  if (wrap)    wrap.style.display       = collapsed ? 'none' : '';
  if (chevron) chevron.style.transform  = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
}

async function joinEvent(eventId, btn) {
  btn.disabled = true; btn.textContent = '…';
  if (!sb.isLoggedIn()) {
    btn.disabled = false; btn.textContent = 'Teilnehmen';
    showAuthPrompt();
    return;
  }
  // Fallback-Events: kein DB-Eintrag nötig
  const isFallback = allEvents.length === 0;
  if (isFallback) {
    setTimeout(()=>{
      btn.textContent='✅'; btn.style.background='var(--green)';
      showToast('🏓 Du nimmst am Event teil!');
    }, 400);
    return;
  }
  const qb = new QueryBuilder('event_participants');
  const {error} = await qb.insert({ event_id: eventId, user_id: sb.getUserId() });
  if(error && error.code === '23505') {
    showToast('Du nimmst bereits teil','ℹ️');
    btn.textContent='✅'; btn.style.background='var(--green)';
  } else if(error) {
    showToast('Fehler beim Beitreten','❌');
    btn.disabled=false; btn.textContent='Dabei';
  } else {
    btn.textContent='✅'; btn.style.background='var(--green)';
    showToast('🏓 Du nimmst am Event teil!');
    await loadEvents();
  }
}

function renderPlayerSearchCard(ps) {
  const cardClick    = `showPlayerSearchDetail(${ps.id})`;
  const profileClick = `event.stopPropagation();showPlayerProfile('${escAttr(ps.userId||'')}','${escAttr(ps.username||'')}','${escAttr(ps.avatarEmoji||'')}',null,'${escAttr(ps.avatarUrl||'')}')`;
  const avHtml = getAvatarHtml({ avatar_emoji: ps.avatarEmoji, avatar_url: ps.avatarUrl, username: ps.username }, { size: 46 });
  const spielartMap = {casual:'Just 4 Fun gesucht', training:'Training gesucht', punktspiel:'Punktspiel gesucht'};
  const spielartLabel = spielartMap[ps.spielart] || 'Just 4 Fun gesucht';
  const metaParts = [];
  if(ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`${ic('pin',12)} ${ps.umkreis} Umkreis`);
  if(ps.wann    && ps.wann    !== 'Egal') metaParts.push(`${ic('clock',12)} <b style="color:var(--text);font-weight:600;">${ps.wann}</b>`);
  return `
    <div class="player-search-card fade-up" onclick="${cardClick}">
      <div class="psc-profile">
        <div class="pp-clickable" onclick="${profileClick}">${avHtml}</div>
        <div class="psc-identity">
          <div class="psc-name pp-clickable" onclick="${profileClick}">${escHtml(ps.username || 'Spieler')}</div>
          <div class="psc-type-row">
            <span class="ev-type-pill pill-${ps.spielart || 'casual'}">${spielartLabel}</span>
          </div>
        </div>
      </div>
      ${metaParts.length ? `<div class="psc-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>` : ''}
      ${ps.message ? `<div class="psc-message">"${escHtml(ps.message)}"</div>` : ''}
    </div>`;
}

function _sortByDate(a, b) {
  return ((a.dateStr || '') + (a.time || '')).localeCompare((b.dateStr || '') + (b.time || ''));
}

function getSortedEvents(events) {
  if (currentSort === 'dist') {
    return [...events].sort((a, b) => {
      const tA = tables.find(t => t.id === a.tid);
      const tB = tables.find(t => t.id === b.tid);
      const dA = (typeof userLat !== 'undefined' && userLat && tA?.lat) ? calcDistance(userLat, userLng, tA.lat, tA.lng) : Infinity;
      const dB = (typeof userLat !== 'undefined' && userLat && tB?.lat) ? calcDistance(userLat, userLng, tB.lat, tB.lng) : Infinity;
      return dA !== dB ? dA - dB : _sortByDate(a, b);
    });
  }
  return [...events].sort(_sortByDate);
}

function sortEvents(sort, btn) {
  currentSort = sort;
  document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents(currentFilter);
}

function renderEventCard(e, idx = 0) {
  const thumbFallback = e.type === 'punktspiel' ? 'images/placeholders/game_tournament.png'
    : e.type === 'casual'    ? 'images/placeholders/game_fun.png'
    : e.type === 'training'  ? 'images/placeholders/game_training.png'
    : 'images/placeholders/game_fun.png';
  const loadAttr = idx < 2 ? 'eager' : 'lazy';
  const thumbInner = (e.photos && e.photos.length)
    ? `<img src="${escAttr(e.photos[0])}" onerror="this.src='${thumbFallback}'" loading="${loadAttr}" decoding="async">`
    : `<img src="${thumbFallback}" loading="${loadAttr}" decoding="async">`;
  return `
  <div class="event-card-big fade-up" onclick="showEventDetail(${e.id})">
    <div class="ecb-thumb ev-thumb-${e.type||'casual'}">${thumbInner}</div>
    <div class="ecb-info">
      <div class="ecb-title-row">
        <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
      </div>
      <div class="ecb-title">${e.name}</div>
      <div class="ecb-date">${ic('calendar',12)} ${formatEventDate(e)}</div>
      <div class="ecb-creator">${ic('user',12)} ${e.creatorId
        ? `<b class="pp-clickable" style="cursor:pointer;" onclick="event.stopPropagation();showPlayerProfile('${escAttr(e.creatorId)}','${escAttr(e.creator||'')}','${escAttr(e.creatorEmoji||'')}',null,'${escAttr(e.creatorAvatarUrl||'')}')">${escHtml(e.creator||'Anonym')}</b>`
        : `<b>${escHtml(e.creator||'Anonym')}</b>`}</div>
      <div class="ecb-location">${ic('pin')} ${e.tname}</div>
      <div class="ecb-participants-row">${participantStack(e.participants,4,26)}<span class="ecb-pcount">${e.p}/${e.max} Teilnehmer</span></div>
    </div>
    <div class="ecb-chevron">›</div>
  </div>`;
}

function renderEvents(filter = 'all') {
  const gameSrc = allEvents;
  const c = document.getElementById('events-list');

  // Spielart-Filter gilt für beide Bereiche
  const psFiltered = filter === 'all'
    ? allPlayerSearches
    : allPlayerSearches.filter(ps => ps.spielart === filter);

  const games = getSortedEvents(
    filter === 'all' ? gameSrc : gameSrc.filter(e => e.type === filter)
  );

  const psChevron = `<span class="feed-section-chevron" id="feed-ps-chevron"${_psCollapsed ? ' style="transform:rotate(0deg)"' : ''}>›</span>`;
  const psHtml = psFiltered.length
    ? `<div class="feed-section-title feed-section-toggle" onclick="_toggleFeedSection('ps')">${ic('users',13)} Mitspieler gesucht <span class="ps-count-chip">${psFiltered.length}</span>${psChevron}</div>
       <div id="feed-ps-wrap"${_psCollapsed ? ' style="display:none"' : ''}>${psFiltered.map(renderPlayerSearchCard).join('')}</div>`
    : '';

  const psEmptyHtml = (!psFiltered.length && allPlayerSearches.length === 0)
    ? `<div class="feed-section-title">${ic('users',13)} Mitspieler gesucht</div>
       <div class="empty-state-card">
         <div class="esc-icon">👥</div>
         <div class="esc-title">Noch keine Mitspieler gefunden?</div>
         <div class="esc-body">Erstelle ein Gesuch oder entdecke später neue Mitspieler in deiner Umgebung.</div>
         <button class="esc-btn" onclick="openSheet('mitspieler-sheet')">Gesuch erstellen</button>
       </div>`
    : '';

  const gamesChevron = `<span class="feed-section-chevron" id="feed-games-chevron"${_gamesCollapsed ? ' style="transform:rotate(0deg)"' : ''}>›</span>`;
  const gamesStyle = (psHtml || psEmptyHtml) ? 'margin-top:4px;' : '';
  const gamesHtml = games.length
    ? `<div class="feed-section-title feed-section-toggle"${gamesStyle ? ` style="${gamesStyle}"` : ''} onclick="_toggleFeedSection('games')">${ic('calendar',13)} Geplante Spiele <span class="ps-count-chip">${games.length}</span>${gamesChevron}</div>
       <div id="feed-games-wrap"${_gamesCollapsed ? ' style="display:none"' : ''}>${games.map((e, i) => renderEventCard(e, i)).join('')}</div>`
    : '';

  if (!psHtml && !psEmptyHtml && !gamesHtml) {
    c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Keine Einträge gefunden.</div>';
    return;
  }

  c.innerHTML = (psHtml || psEmptyHtml) + gamesHtml;
}

function filterEvents(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents(type);
}

function activateMitspielerFilter() {
  showPage('events');
  // Mitspieler-Gesuche erscheinen oben im "Alle"-Feed
  const allPill = document.querySelector('#event-filter-pills .filter-pill');
  if(allPill && currentFilter !== 'all') filterEvents('all', allPill);
}

function openCreateEventSheet() {
  _editingEventId = null;
  document.querySelector('#create-event-sheet .sheet-title').textContent = 'Spiel organisieren';
  document.querySelector('#create-event-sheet .btn-primary').textContent = 'Spiel organisieren 🏓';
  document.getElementById('ev-name').value  = '';
  document.getElementById('ev-date').value  = '';
  document.getElementById('ev-time').value  = '15:00';
  document.getElementById('ev-mode').value  = 'casual';
  const evDesc = document.getElementById('ev-desc');
  if (evDesc) evDesc.value = '';
  closeAllSheets();
  openSheet('create-event-sheet');
}

async function submitCreateEvent() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
  const title   = document.getElementById('ev-name').value.trim();
  const tableId = document.getElementById('ev-table').value;
  const date    = document.getElementById('ev-date').value;
  const time    = document.getElementById('ev-time').value;
  const mode    = document.getElementById('ev-mode').value;
  const desc    = (document.getElementById('ev-desc')?.value || '').trim();
  if(!title || !tableId || !date || !time) { showToast('Bitte alle Pflichtfelder ausfüllen','⚠️'); return; }

  const qb = new QueryBuilder('events');
  let error;

  if(_editingEventId) {
    ({ error } = await qb.eq('id', _editingEventId).update({
      title, table_id: parseInt(tableId), event_date: date, event_time: time, mode,
      description: desc || null
    }));
    if(error) { showToast('Fehler beim Speichern','❌'); console.error(error); return; }
    _editingEventId = null;
    closeAllSheets();
    showToast('✅ Event gespeichert!');
  } else {
    ({ error } = await qb.insert({
      title, table_id: parseInt(tableId),
      creator_id: sb.getUserId(),
      event_date: date, event_time: time, mode,
      description: desc || null
    }));
    if(error) { showToast('Fehler beim Erstellen','❌'); console.error(error); return; }
    closeAllSheets();
    showToast('🎉 Spiel organisiert!','🎉');
  }

  await loadEvents();
  renderEvents(currentFilter);
  renderHome();
}

async function submitMitspieler() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }

  const btn     = document.getElementById('ms-submit-btn');
  if(btn) { btn.disabled = true; btn.textContent = '…'; }

  const spielart = document.getElementById('ms-spielart').value;
  const wann     = document.getElementById('ms-wann').value;
  const umkreis  = document.getElementById('ms-umkreis').value;
  const message  = (document.getElementById('ms-message').value || '').trim();
  const today    = new Date().toISOString().slice(0, 10);
  const title    = (currentUser?.username || 'Spieler') + ' sucht Mitspieler';
  const descJson = JSON.stringify({
    spielart, wann, umkreis, message,
    avatarEmoji: currentUser?.avatar_emoji || ''
  });

  const qb = new QueryBuilder('events');
  const {error} = await qb.insert({
    title,
    table_id:         null,
    creator_id:       sb.getUserId(),
    event_date:       today,
    event_time:       '00:00',
    mode:             'player_search',
    max_participants: 2,
    description:      descJson
  });

  if(btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
  if(error) { showToast('Fehler beim Veröffentlichen', '❌'); console.error(error); return; }

  closeAllSheets();
  showToast('👥 Gesuch veröffentlicht!', '✅');
  await loadEvents();
  renderEvents(currentFilter);
  renderHome();
}
