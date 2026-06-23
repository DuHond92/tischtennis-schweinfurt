// ╔══════════════════════════════════════════════════════════════╗
// ║           TABLE DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentDetailTableId = null;

function showTableDetail(id) {
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t = src.find(x=>x.id===id);
  if(!t) return;
  currentDetailTableId = id;
  document.getElementById('tds-title').textContent = t.icon+' '+t.name;

  // Fotos (OSM-Foto oder Emoji-Fallback)
  const photos = t.photos && t.photos.length ? t.photos : [];
  const sliderHtml = buildPhotoSlider(t, photos);

  // Distanz
  const distHtml = t.distance != null
    ? `<span class="distance-badge">📍 ${formatDistance(t.distance)} entfernt</span>` : '';

  // OSM Badge
  const osmHtml = t.osmId
    ? `<span class="osm-badge">🗺 OpenStreetMap</span>` : '';

  // Zusatz-Infos aus OSM
  const extraInfos = [];
  if(t.surface)   extraInfos.push(`🏔 Belag: ${t.surface}`);
  if(t.operator)  extraInfos.push(`🏢 Betreiber: ${t.operator}`);
  if(t.access)    extraInfos.push(`🔓 Zugang: ${t.access}`);
  const extraHtml = extraInfos.length
    ? `<div style="padding:8px 20px;display:flex;flex-wrap:wrap;gap:8px;">
        ${extraInfos.map(i=>`<span style="font-size:0.75rem;color:var(--text-dim);">${i}</span>`).join('')}
       </div>` : '';

  // Events
  const evArr = t.events || [];
  const evHtml = evArr.length===0
    ? `<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.85rem;">
        Noch keine Events –<br>Sei der Erste! 🏓<br><br>
        <button class="btn btn-primary btn-sm" onclick="openSheet('create-event-sheet')">Event erstellen</button>
       </div>`
    : evArr.map(e=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);">
        <div class="ev-date-box"><div class="ev-day">${e.day}</div><div class="ev-mon">${e.mon}</div></div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.88rem;">${e.name}</div>
          <div style="font-size:0.74rem;color:var(--text-dim);">⏰ ${e.time} · 👥 ${e.p}/${e.max}</div>
        </div>
        <span class="ev-type-pill pill-${e.type}">${e.type==='casual'?'Casual':e.type==='ranked'?'Ranked':'Turnier'}</span>
        <button class="btn btn-primary btn-sm" onclick="showEventDetail(${e.id})">Details →</button>
      </div>`).join('');

  document.getElementById('tds-body').innerHTML = `
    ${sliderHtml}
    <div style="padding:14px 20px;border-bottom:1px solid var(--border);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <span class="ev-type-pill ${t.type==='indoor'?'pill-ranked':'pill-casual'}">${t.type==='indoor'?'🏢 Indoor':'🌳 Outdoor'}</span>
        ${distHtml} ${osmHtml}
      </div>
      <div style="font-size:0.8rem;color:var(--text-dim);">📍 ${t.addr||'Schweinfurt'}</div>
    </div>
    ${extraHtml}
    <!-- Rating Summary -->
    <div id="rating-summary-${t.id}" class="rating-summary">
      <div style="text-align:center;min-width:56px;">
        <div class="rating-big-num" id="rating-num-${t.id}">–</div>
        <div class="rating-stars-row" id="rating-stars-${t.id}" style="justify-content:center;"></div>
        <div class="rating-count" id="rating-count-${t.id}">Noch keine</div>
      </div>
      <div class="rating-sub-bars" id="rating-bars-${t.id}">
        <div style="font-size:0.72rem;color:var(--text-dim);">Lade Bewertungen…</div>
      </div>
    </div>

    <!-- King of the Plate -->
    <div class="king-section" id="king-section-${t.id}">
      <div class="king-header">👑 King of the Plate</div>
      <div class="king-empty">Lade…</div>
    </div>

    <!-- Action Buttons -->
    <div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm btn-full" onclick="openComments(${t.id})">💬 Kommentare</button>
      <button class="btn btn-secondary btn-sm btn-full" onclick="openMapsDirections(${t.lat},${t.lng})">🗺 Route</button>
    </div>
    <div style="padding:8px 20px;border-bottom:1px solid var(--border);">
      <button class="btn btn-primary btn-full btn-sm" onclick="openRating(${t.id},'${t.name}')">⭐ Platte bewerten</button>
    </div>
    <div style="padding:10px 20px 4px;font-weight:800;font-size:0.9rem;font-family:var(--font-head);">📅 Events</div>
    ${evHtml}
    <div style="padding:14px 20px;">
      <button class="btn btn-accent btn-full btn-sm" onclick="closeAllSheets();
        document.getElementById('ev-table').value='${t.id}';
        openSheet('create-event-sheet')">+ Event hier erstellen</button>
    </div>`;

  openSheet('table-detail-sheet');
  // Ratings + King async laden
  loadRatingsForTable(id);
  loadKingOfPlate(id);
}

function buildPhotoSlider(t, photos) {
  if(!photos.length) {
    return `<div class="photo-slider">
      <div class="photo-slider-inner">
        <div class="photo-slide" style="font-size:5rem;">${t.icon}</div>
      </div>
    </div>`;
  }
  const slides = photos.map(p=>
    `<div class="photo-slide"><img src="${p}" onerror="this.parentElement.innerHTML='${t.icon}'" loading="lazy"></div>`
  ).join('');
  const dots = photos.length > 1
    ? `<div class="photo-dots">${photos.map((_,i)=>`<div class="photo-dot ${i===0?'active':''}"></div>`).join('')}</div>` : '';
  const navBtns = photos.length > 1
    ? `<button class="photo-nav prev" onclick="slidePhoto(-1,this)">‹</button>
       <button class="photo-nav next" onclick="slidePhoto(1,this)">›</button>
       <div class="photo-counter">1/${photos.length}</div>` : '';
  return `<div class="photo-slider" data-idx="0">
    <div class="photo-slider-inner" id="photo-inner">${slides}</div>
    ${navBtns} ${dots}
  </div>`;
}

function slidePhoto(dir, btn) {
  const slider = btn.closest('.photo-slider');
  const inner  = slider.querySelector('.photo-slider-inner');
  const slides = slider.querySelectorAll('.photo-slide');
  const dots   = slider.querySelectorAll('.photo-dot');
  const counter = slider.querySelector('.photo-counter');
  let idx = parseInt(slider.dataset.idx || 0) + dir;
  if(idx < 0) idx = slides.length-1;
  if(idx >= slides.length) idx = 0;
  slider.dataset.idx = idx;
  inner.style.transform = `translateX(-${idx*100}%)`;
  dots.forEach((d,i) => d.classList.toggle('active', i===idx));
  if(counter) counter.textContent = `${idx+1}/${slides.length}`;
}

function openMapsDirections(lat, lng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  window.open(url, '_blank');
}

// ── RATINGS ───────────────────────────────────────────────────────
let currentRatings = { overall: 0, surface: 0, ground: 0, windshield: 0 };
let currentRatingTableId = null;

function openRating(tableId, tableName) {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  currentRatingTableId = tableId;
  document.getElementById('rating-sheet-title').textContent = `⭐ ${tableName} bewerten`;
  // Reset
  currentRatings = { overall:0, surface:0, ground:0, windshield:0 };
  ['overall','surface','ground','windshield'].forEach(cat => updateStarDisplay(cat, 0));
  document.getElementById('rating-comment').value = '';
  openSheet('rating-sheet');
}

function setRating(category, value) {
  currentRatings[category] = value;
  updateStarDisplay(category, value);
}

function updateStarDisplay(category, value) {
  const container = document.getElementById(`stars-${category}`);
  if(!container) return;
  container.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('active', i < value);
  });
}

async function submitRating() {
  if(!currentRatings.overall) {
    showToast('Bitte mindestens die Gesamtbewertung vergeben ⭐','⚠️');
    return;
  }
  const btn = document.querySelector('#rating-sheet .btn-primary');
  btn.disabled = true; btn.textContent = '…';

  const payload = {
    table_id:   currentRatingTableId,
    user_id:    sb.getUserId(),
    overall:    currentRatings.overall,
    surface:    currentRatings.surface   || null,
    ground:     currentRatings.ground    || null,
    windshield: currentRatings.windshield|| null,
    comment:    document.getElementById('rating-comment').value.trim() || null
  };

  // Upsert via unique(table_id, user_id) – aktualisiert falls User schon bewertet hat
  const qb = new QueryBuilder('ratings');
  const {error} = await qb.upsert(payload, 'table_id,user_id');

  btn.disabled = false; btn.textContent = 'Bewertung abgeben ⭐';

  if(error) {
    console.error('Rating error:', JSON.stringify(error));
    showToast('Fehler: ' + (error.message || error.hint || JSON.stringify(error)), '❌');
    return;
  }
  closeAllSheets();
  showToast('⭐ Bewertung gespeichert! Danke!','⭐');
  await loadRatingsForTable(currentRatingTableId);
}

async function loadRatingsForTable(tableId) {
  try {
    // Durchschnitt laden
    const qb = new QueryBuilder('table_ratings_avg');
    qb.eq('table_id', tableId);
    const {data} = await qb.execute();
    if(data && data[0]) renderRatingSummary(tableId, data[0]);
    else renderRatingSummary(tableId, null);
  } catch(e) {
    console.warn('Rating load error', e);
    renderRatingSummary(tableId, null);
  }
}

function renderRatingSummary(tableId, r) {
  const numEl   = document.getElementById(`rating-num-${tableId}`);
  const starsEl = document.getElementById(`rating-stars-${tableId}`);
  const countEl = document.getElementById(`rating-count-${tableId}`);
  const barsEl  = document.getElementById(`rating-bars-${tableId}`);
  if(!numEl) return;

  if(!r || !r.rating_count) {
    numEl.textContent = '–';
    starsEl.innerHTML = '';
    countEl.textContent = 'Noch keine Bewertung';
    barsEl.innerHTML = `<div style="font-size:0.75rem;color:var(--text-dim);">Sei der Erste! ⭐</div>`;
    return;
  }

  const avg = parseFloat(r.avg_overall);
  numEl.textContent = avg.toFixed(1);

  // Sterne rendern
  let starsHtml = '';
  for(let i=1;i<=5;i++) {
    starsHtml += `<span class="${i<=Math.round(avg)?'rating-star-filled':'rating-star-empty'}">★</span>`;
  }
  starsEl.innerHTML = starsHtml;
  countEl.textContent = `${r.rating_count} Bewertung${r.rating_count>1?'en':''}`;

  // Sub-Bars
  const cats = [
    {key:'avg_surface',    label:'Oberfläche'},
    {key:'avg_ground',     label:'Untergrund'},
    {key:'avg_windshield', label:'Windschutz'},
  ];
  barsEl.innerHTML = cats.map(c => {
    const val = r[c.key] ? parseFloat(r[c.key]) : null;
    if(!val) return '';
    const pct = (val/5*100).toFixed(0);
    return `<div class="rating-sub-bar-row">
      <div class="rsb-label">${c.label}</div>
      <div class="rsb-bar"><div class="rsb-fill" style="width:${pct}%"></div></div>
      <div class="rsb-val">${val.toFixed(1)}</div>
    </div>`;
  }).join('') || `<div style="font-size:0.72rem;color:var(--text-dim);">Details ausstehend</div>`;
}

async function loadKingOfPlate(tableId) {
  const el = document.getElementById(`king-section-${tableId}`);
  if(!el) return;
  try {
    const qb = new QueryBuilder('king_of_plate');
    qb.eq('table_id', tableId).order('wins_at_table', true).limit(3);
    const {data} = await qb.execute();
    renderKingOfPlate(tableId, data || []);
  } catch(e) {
    renderKingOfPlate(tableId, []);
  }
}

function renderKingOfPlate(tableId, kings) {
  const el = document.getElementById(`king-section-${tableId}`);
  if(!el) return;
  const medals = ['👑','🥈','🥉'];
  if(!kings.length) {
    el.innerHTML = `<div class="king-header">👑 King of the Plate</div>
      <div class="king-empty">Noch keine Ranked Matches an dieser Platte.<br>
      <span style="font-size:0.78rem;">Spiele ein Ranked Match um König zu werden!</span></div>`;
    return;
  }
  el.innerHTML = `<div class="king-header">👑 King of the Plate</div>` +
    kings.map((k,i) => `
      <div class="king-row">
        <div class="king-rank">${medals[i]||`#${i+1}`}</div>
        <div class="king-avatar">${k.avatar_emoji||'🏓'}</div>
        <div class="king-name">${k.username}</div>
        <div class="king-wins"><b>${k.wins_at_table}</b> Siege</div>
      </div>`).join('');
}

// ── KOMMENTARE ────────────────────────────────────────────────────
async function openComments(tableId) {
  currentDetailTableId = tableId;
  document.getElementById('comment-sheet-title').textContent = '💬 Kommentare';
  const listEl = document.getElementById('comment-list');
  listEl.innerHTML = `<div class="osm-loading"><div class="search-spinner"></div>Lade Kommentare…</div>`;
  openSheet('comment-sheet');

  try {
    const qb = new QueryBuilder('comments');
    qb._select = 'id,text,created_at,profiles(username,avatar_emoji)';
    qb.eq('table_id', tableId).order('created_at', true);
    const {data} = await qb.execute();
    renderComments(data || []);
  } catch(e) {
    renderComments([]);
  }
}

function renderComments(comments) {
  const el = document.getElementById('comment-list');
  if(!comments.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Kommentare.<br>Sei der Erste! 💬</div>`;
    return;
  }
  el.innerHTML = comments.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'});
    return `<div class="comment-item">
      <div class="comment-header">
        <div class="comment-avatar">${c.profiles?.avatar_emoji||'🏓'}</div>
        <div class="comment-author">${c.profiles?.username||'Anonym'}</div>
        <div class="comment-date">${date}</div>
      </div>
      <div class="comment-text">${c.text}</div>
    </div>`;
  }).join('');
}

async function submitComment() {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  const text = document.getElementById('new-comment').value.trim();
  if(!text) { showToast('Bitte Text eingeben','⚠️'); return; }
  const qb = new QueryBuilder('comments');
  const {error} = await qb.insert({
    table_id: currentDetailTableId,
    user_id: sb.getUserId(),
    text
  });
  if(error) { showToast('Fehler beim Senden','❌'); return; }
  document.getElementById('new-comment').value = '';
  showToast('💬 Kommentar gesendet!');
  openComments(currentDetailTableId);
}
