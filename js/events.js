// ╔══════════════════════════════════════════════════════════════╗
// ║           EVENTS                                             ║
// ╚══════════════════════════════════════════════════════════════╝
async function joinEvent(eventId, btn) {
  btn.disabled = true; btn.textContent = '…';
  // Fallback-Events: kein DB-Eintrag nötig
  const isFallback = eventId >= 101;
  if(isFallback || !sb.isLoggedIn()) {
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
  const uid   = escAttr(ps.userId || '');
  const name  = escAttr(ps.username || 'Spieler');
  const emoji = escAttr(ps.avatarEmoji || '');
  const click = `showPlayerProfile('${uid}','${name}','${emoji}')`;
  const avHtml = ps.avatarEmoji
    ? `<div onclick="${click}" title="Profil ansehen" style="width:46px;height:46px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:1.75rem;cursor:pointer;flex-shrink:0;border:2px solid var(--border);">${ps.avatarEmoji}</div>`
    : `<div onclick="${click}" title="Profil ansehen" style="cursor:pointer;flex-shrink:0;">${initAvatar(ps.username || '?', 46)}</div>`;
  const spielartMap = {casual:'🎉 Just 4 Fun', training:'🎯 Training', ranked:'🏓 Wertungsspiel'};
  const spielartLabel = spielartMap[ps.spielart] || '🎉 Just 4 Fun';
  const metaParts = [];
  if(ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`📍 ${ps.umkreis}`);
  if(ps.wann    && ps.wann    !== 'Egal') metaParts.push(`📅 ${ps.wann}`);
  return `
    <div class="player-search-card fade-up">
      ${avHtml}
      <div class="psc-info">
        <div class="psc-name" onclick="${click}">${escHtml(ps.username || 'Spieler')}</div>
        <div class="psc-type-row">
          <span class="ev-type-pill pill-${ps.spielart || 'casual'}">${spielartLabel}</span>
          ${metaParts.length ? `<span class="psc-meta">${metaParts.join(' · ')}</span>` : ''}
        </div>
        ${ps.message ? `<div class="psc-message">"${escHtml(ps.message)}"</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm psc-btn" onclick="${click}">Profil</button>
    </div>`;
}

function renderEvents(filter = 'all') {
  const gameSrc = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const psSrc   = [...allPlayerSearches, ...FALLBACK_PLAYER_SEARCHES];
  const c = document.getElementById('events-list');
  const EV_IMGS = ['images/events/event1.webp','images/events/event2.webp','images/events/event3.webp'];
  const EV_PH   = 'images/placeholders/placeholder-plate.webp';

  function gameCard(e, idx) {
    const thumb = EV_IMGS[idx % EV_IMGS.length];
    return `
    <div class="event-card-big fade-up" onclick="showEventDetail(${e.id})">
      <img class="ecb-thumb" src="${thumb}" onerror="this.src='${EV_PH}'" loading="lazy">
      <div class="ecb-info">
        <div class="ecb-title-row">
          <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
          <span style="font-size:0.72rem;color:var(--text-dim);">${ic('calendar',12)} ${e.day}. ${e.mon}</span>
        </div>
        <div class="ecb-title">${e.name}</div>
        <div class="ecb-creator">${ic('user',12)} <b>${e.creator}</b> &nbsp;·&nbsp; ${ic('clock',12)} ${e.time} Uhr</div>
        <div class="ecb-location">${ic('pin')} ${e.tname}</div>
        <div class="ecb-participants-row">${participantStack(e.participants,4,26)}<span class="ecb-pcount">${e.p}/${e.max} Teilnehmer</span></div>
      </div>
      <div class="ecb-chevron">›</div>
    </div>`;
  }

  if(filter === 'mitspieler') {
    c.innerHTML = psSrc.length
      ? psSrc.map(renderPlayerSearchCard).join('')
      : '<div style="text-align:center;padding:40px;color:var(--text-dim);">Keine Mitspieler-Gesuche vorhanden.</div>';
    return;
  }

  const games = filter === 'all' ? gameSrc : gameSrc.filter(e => e.type === filter);

  if(filter === 'all') {
    const psHtml = psSrc.length ? `
      <div class="feed-section-title">${ic('users',13)} Mitspieler gesucht <span class="ps-count-chip">${psSrc.length}</span></div>
      ${psSrc.slice(0, 3).map(renderPlayerSearchCard).join('')}
      <div class="feed-section-title" style="margin-top:4px;">${ic('calendar',13)} Spielrunden</div>
    ` : '';
    if(!games.length && !psSrc.length) {
      c.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Keine Einträge gefunden.</div>';
      return;
    }
    c.innerHTML = psHtml + games.map(gameCard).join('');
  } else {
    c.innerHTML = games.length
      ? games.map(gameCard).join('')
      : '<div style="text-align:center;padding:40px;color:var(--text-dim);">Keine Spielrunden in dieser Kategorie.</div>';
  }
}

function filterEvents(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents(type);
}

function activateMitspielerFilter() {
  showPage('events');
  const pill = document.getElementById('pill-mitspieler');
  if(pill) filterEvents('mitspieler', pill);
}

async function submitCreateEvent() {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  const title   = document.getElementById('ev-name').value.trim();
  const tableId = document.getElementById('ev-table').value;
  const date    = document.getElementById('ev-date').value;
  const time    = document.getElementById('ev-time').value;
  const mode    = document.getElementById('ev-mode').value;
  if(!title || !tableId || !date || !time) { showToast('Bitte alle Pflichtfelder ausfüllen','⚠️'); return; }

  const qb = new QueryBuilder('events');
  const {error} = await qb.insert({
    title, table_id: parseInt(tableId),
    creator_id: sb.getUserId(),
    event_date: date, event_time: time, mode
  });
  if(error) { showToast('Fehler beim Erstellen','❌'); console.error(error); return; }
  closeAllSheets();
  showToast('🎉 Spiel organisiert!','🎉');
  await loadEvents();
  renderEvents(currentFilter);
  renderHome();
}

function submitMitspieler() {
  const spielart = document.getElementById('ms-spielart').value;
  const wann     = document.getElementById('ms-wann').value;
  const umkreis  = document.getElementById('ms-umkreis').value;
  const message  = (document.getElementById('ms-message').value || '').trim();
  const username = currentUser?.username || 'Du';
  const emoji    = currentUser?.avatar_emoji || '';

  allPlayerSearches.unshift({
    id: 300 + allPlayerSearches.length + 1,
    type: 'player_search',
    userId: currentUser?.id || null,
    username,
    avatarEmoji: emoji,
    spielart,
    wann,
    umkreis,
    message
  });

  closeAllSheets();
  showToast('👥 Gesuch veröffentlicht!', '✅');
  renderEvents(currentFilter);
  renderHome();
}
