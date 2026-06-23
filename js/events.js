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

function renderEvents(filter='all') {
  // Fallback-Events verwenden wenn Supabase noch keine hat
  const src = allEvents.length ? allEvents : FALLBACK_EVENTS;
  const list = filter==='all' ? src : src.filter(e=>e.type===filter);
  const c = document.getElementById('events-list');
  if(!list.length) {
    c.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-dim);">
      Keine Events in dieser Kategorie.
    </div>`; return;
  }
  const EV_IMGS = ['images/events/event1.webp','images/events/event2.webp','images/events/event3.webp'];
  const EV_PH  = 'images/placeholders/placeholder-plate.webp';
  c.innerHTML = list.map((e, idx)=>{
    const thumb = EV_IMGS[idx % EV_IMGS.length];
    const typeLabel = e.type==='casual'?'🎮 Casual':e.type==='ranked'?'⚔️ Ranked':'🏆 Turnier';
    return `
    <div class="event-card-big fade-up" onclick="showEventDetail(${e.id})">
      <img class="ecb-thumb" src="${thumb}" onerror="this.src='${EV_PH}'" loading="lazy">
      <div class="ecb-info">
        <div class="ecb-title-row">
          <span class="ev-type-pill pill-${e.type}">${typeLabel}</span>
          <span style="font-size:0.72rem;color:var(--text-dim);">📅 ${e.day}. ${e.mon}</span>
        </div>
        <div class="ecb-title">${e.name}</div>
        <div class="ecb-meta">⏰ ${e.time} Uhr · von ${e.creator}</div>
        <div class="ecb-location">📍 ${e.tname}</div>
        <div class="ecb-participants">👥 ${e.p}/${e.max} Teilnehmer</div>
      </div>
      <div class="ecb-chevron">›</div>
    </div>`;
  }).join('');
}

function filterEvents(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderEvents(type);
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
  showToast('🎉 Event erstellt!','🎉');
  await loadEvents();
  renderEvents(currentFilter);
  renderHome();
}
