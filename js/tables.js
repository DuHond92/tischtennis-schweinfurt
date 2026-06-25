// ╔══════════════════════════════════════════════════════════════╗
// ║           TABLE DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentDetailTableId = null;

function showTableDetail(id) {
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t = src.find(x=>x.id===id);
  if(!t) return;
  currentDetailTableId = id;

  // Fotos (OSM-Foto oder Test-Fallback)
  const photos = t.photos && t.photos.length ? t.photos : [];
  const sliderHtml = buildPhotoSlider(t, photos);

  // Distanz
  const distHtml = t.distance != null
    ? `<span class="distance-badge">${ic('pin',12)} ${formatDistance(t.distance)} entfernt</span>` : '';

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
        Noch keine Spielrunden –<br>Sei der Erste! 🏓<br><br>
        <button class="btn btn-primary btn-sm" onclick="openSheet('create-event-sheet')">Spiel organisieren</button>
       </div>`
    : evArr.map(e=>`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);">
        <div class="ev-date-box"><div class="ev-day">${e.day}</div><div class="ev-mon">${e.mon}</div></div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.88rem;">${e.name}</div>
          <div style="font-size:0.74rem;color:var(--text-dim);">${ic('clock')} ${e.time} · ${ic('users')} ${e.p}/${e.max}</div>
        </div>
        <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
        <button class="btn btn-primary btn-sm" onclick="showEventDetail(${e.id})">Details →</button>
      </div>`).join('');

  document.getElementById('tds-body').innerHTML = `
    ${sliderHtml}
    <!-- Kompakter Info-Block -->
    <div class="ds-info">
      <div class="ds-name">${t.icon} ${t.name}</div>
      <div class="ds-badges">
        <span class="ev-type-pill ${t.type==='indoor'?'pill-ranked':'pill-casual'}">${t.type==='indoor'?'🏢 Indoor':'🌳 Outdoor'}</span>
        ${distHtml}${osmHtml}
      </div>
      <div class="ds-address">${ic('pin')} ${t.addr||'Schweinfurt'}</div>
      <div class="tds-rating-inline" id="tds-rating-${t.id}">
        <span style="font-size:0.78rem;color:var(--text-dim);">⭐ Lade…</span>
      </div>
    </div>
    ${t.description ? `<div class="tds-desc">${escHtml(t.description)}</div>` : ''}
    ${extraHtml}
    <!-- Primäre Aktionen -->
    <div class="tds-cta-row">
      <button class="btn btn-primary btn-full" onclick="closeAllSheets();
        document.getElementById('ev-table').value='${t.id}';
        openSheet('create-event-sheet')">🏓 Spiel organisieren</button>
      <button class="btn btn-secondary tds-route-btn" onclick="openMapsDirections(${t.lat},${t.lng})">${ic('navigate',15)} Route</button>
    </div>
    <!-- Kommentare (inline) -->
    <div class="tds-section">
      <div class="tds-section-label">${ic('chat',13)} Kommentare</div>
      <div id="tds-comments-${t.id}">
        <div class="tds-loading">Lade…</div>
      </div>
      <button class="btn btn-secondary btn-sm btn-full tds-comment-btn" onclick="openComments(${t.id})">${ic('chat',13)} Kommentar schreiben</button>
    </div>
    <!-- Bewertung abgeben -->
    <div style="padding:8px 20px;border-bottom:1px solid var(--border);">
      <button class="btn btn-secondary btn-full btn-sm" onclick="openRating(${t.id},'${escAttr(t.name)}')">⭐ Bewertung abgeben</button>
    </div>
    <!-- Spielrunden -->
    <div style="padding:10px 20px 4px;font-weight:800;font-size:0.9rem;font-family:var(--font-head);">${ic('calendar',15)} Spielrunden</div>
    ${evHtml}
    <div class="pb-safe"></div>`;

  openSheet('table-detail-sheet');
  loadRatingsForTable(id);
  loadCommentsInline(id);
}

const PLATE_TEST_IMAGES = [
  'images/platten/celtis-gymnasium.jpg',
  'images/placeholders/placeholder-plate.webp',
];
const PLATE_FALLBACK = 'images/placeholders/placeholder-plate.webp';

function buildPhotoSlider(t, photos) {
  const imgs = (photos && photos.length) ? photos : PLATE_TEST_IMAGES;

  const slides = imgs.map((src, i) =>
    `<div class="ds-slide" style="${i===0?'':'display:none'}">
      <img src="${src}" onerror="this.src='${PLATE_FALLBACK}'" loading="${i===0?'eager':'lazy'}">
    </div>`
  ).join('');

  const thumbs = imgs.map((src, i) =>
    `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
      <img src="${src}" onerror="this.src='${PLATE_FALLBACK}'">
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
        <div class="ds-thumb-add" onclick="document.getElementById('ds-file-input').click()">+</div>
      </div>
    </div>
    <input type="file" id="ds-file-input" accept="image/*" style="display:none" onchange="handleDetailImageUpload(this)">`;
}

function detailSliderGo(slider, idx) {
  const slides  = slider.querySelectorAll('.ds-slide');
  const thumbs  = slider.querySelectorAll('.ds-thumb');
  const counter = slider.querySelector('.ds-counter');
  const count   = slides.length;
  slides.forEach((s, i) => { s.style.display = i === idx ? '' : 'none'; });
  thumbs.forEach((th, i) => th.classList.toggle('active', i === idx));
  slider.dataset.idx = idx;
  if(counter) counter.textContent = `${idx+1}/${count}`;
}

function detailSliderStep(slider, dir) {
  const count = parseInt(slider.dataset.count || 1);
  const idx   = (parseInt(slider.dataset.idx || 0) + dir + count) % count;
  detailSliderGo(slider, idx);
}

function handleDetailImageUpload(input) {
  if(!input.files || !input.files[0]) return;
  showToast('📸 Bild ausgewählt – Upload folgt in Kürze');
  input.value = '';
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
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t   = src.find(x => x.id === tableId);
  try {
    const qb = new QueryBuilder('table_ratings_avg');
    qb.eq('table_id', tableId);
    const {data} = await qb.execute();
    renderRatingSummary(tableId, (data && data[0]) ? data[0] : null, t?.name || '');
  } catch(e) {
    console.warn('Rating load error', e);
    renderRatingSummary(tableId, null, t?.name || '');
  }
}

function renderRatingSummary(tableId, r, tableName) {
  // Kompakte Anzeige im Info-Block
  const inlineEl = document.getElementById(`tds-rating-${tableId}`);
  if(inlineEl) {
    if(!r || !r.rating_count) {
      inlineEl.innerHTML = `<span style="font-size:0.78rem;color:var(--text-dim);">Noch keine Bewertungen</span>`;
    } else {
      const avg = parseFloat(r.avg_overall);
      let stars = '';
      for(let i=1;i<=5;i++) {
        stars += `<span style="color:${i<=Math.round(avg)?'var(--gold)':'var(--border)'};">★</span>`;
      }
      inlineEl.innerHTML = `<span style="display:flex;align-items:center;gap:5px;font-size:0.78rem;color:var(--text-dim);">${stars}<b style="color:var(--text);">${avg.toFixed(1)}</b> · ${r.rating_count} Bewertung${r.rating_count>1?'en':''}</span>`;
    }
  }
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
      <div class="king-empty">Noch keine Wertungsspiele an dieser Platte.<br>
      <span style="font-size:0.78rem;">Spiele ein Wertungsspiel um König zu werden!</span></div>`;
    return;
  }
  el.innerHTML = `<div class="king-header">👑 King of the Plate</div>` +
    kings.map((k,i) => `
      <div class="king-row">
        <div class="king-rank">${medals[i]||`#${i+1}`}</div>
        <div class="king-avatar">${getAvatarContent(k)}</div>
        <div class="king-name">${k.username}</div>
        <div class="king-wins"><b>${k.wins_at_table}</b> Siege</div>
      </div>`).join('');
}

// ── KOMMENTARE ────────────────────────────────────────────────────
async function loadCommentsInline(tableId) {
  const el = document.getElementById(`tds-comments-${tableId}`);
  if(!el) return;
  try {
    const qb = new QueryBuilder('comments');
    qb._select = 'id,text,created_at,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('table_id', tableId).order('created_at', true).limit(3);
    const {data} = await qb.execute();
    if(!data || !data.length) {
      el.innerHTML = `<div class="tds-no-comments">Noch keine Kommentare.</div>`;
      return;
    }
    el.innerHTML = data.map(c => {
      const date = new Date(c.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'});
      const av   = getAvatarContent(c.profiles);
      const name = c.profiles?.username || 'Anonym';
      return `<div class="tds-comment-row">
        <div class="tds-comment-av">${av}</div>
        <div class="tds-comment-body">
          <div class="tds-comment-meta">${escHtml(name)} <span>· ${date}</span></div>
          <div class="tds-comment-text">${escHtml(c.text)}</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div class="tds-no-comments">Kommentare nicht verfügbar.</div>`;
  }
}

async function openComments(tableId) {
  currentDetailTableId = tableId;
  document.getElementById('comment-sheet-title').textContent = '💬 Kommentare';
  const listEl = document.getElementById('comment-list');
  listEl.innerHTML = `<div class="osm-loading"><div class="search-spinner"></div>Lade Kommentare…</div>`;
  openSheet('comment-sheet');

  try {
    const qb = new QueryBuilder('comments');
    qb._select = 'id,text,created_at,profiles(username,avatar_emoji,avatar_url)';
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
        <div class="comment-avatar">${getAvatarContent(c.profiles)}</div>
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
