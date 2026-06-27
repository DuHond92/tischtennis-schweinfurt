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
      <button class="btn btn-secondary tds-route-btn" onclick="openMapsDirections('${t.lat??t.latitude??''}','${t.lng??t.lon??t.longitude??''}',${JSON.stringify(t.name||'')},${JSON.stringify(t.addr||'')})">${ic('navigate',15)} In Karten öffnen</button>
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
  loadTableImages(id);
}

const PLATE_FALLBACK = 'images/placeholders/placeholder-plate.webp';

function buildPhotoSlider(t, photos) {
  const hasPhotos = photos && photos.length;

  const slides = hasPhotos
    ? photos.map((src, i) =>
        `<div class="ds-slide" style="${i===0?'':'display:none'}">
          <img src="${src}" onerror="this.src='${PLATE_FALLBACK}'" loading="${i===0?'eager':'lazy'}">
        </div>`
      ).join('')
    : `<div class="ds-slide ds-slide-empty">
        <div class="ds-no-img-hint"><span class="nimg-icon">🏓</span>Noch kein Bild</div>
      </div>`;

  const thumbs = hasPhotos
    ? photos.map((src, i) =>
        `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
          <img src="${src}" onerror="this.src='${PLATE_FALLBACK}'">
        </div>`
      ).join('')
    : '';

  const navHtml = hasPhotos && photos.length > 1 ? `
    <button class="ds-nav ds-prev" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),-1)">‹</button>
    <button class="ds-nav ds-next" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),1)">›</button>` : '';

  const mainAttrs = hasPhotos
    ? ` onclick="openLightbox(this.closest('.detail-slider'))" style="cursor:pointer;"`
    : '';

  return `
    <div class="detail-slider" data-idx="0" data-count="${hasPhotos ? photos.length : 1}">
      <div class="ds-main"${mainAttrs}>
        <div class="ds-slides-wrap">${slides}</div>
        ${hasPhotos && photos.length > 1 ? `<div class="ds-counter">1/${photos.length}</div>` : ''}
        ${navHtml}
      </div>
      <div class="ds-thumbs">
        ${thumbs}
        <div class="ds-thumb-add" title="Bild hinzufügen" onclick="document.getElementById('ds-file-input').click()">+</div>
      </div>
    </div>
    <input type="file" id="ds-file-input" accept="image/*" capture="environment" style="display:none" onchange="handleTableImageUpload(this)">`;
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

// Event-Bild Upload (Weiterleitung an event-detail.js)
async function handleDetailImageUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (!sb.isLoggedIn()) { input.value = ''; closeAllSheets(); openSheet('auth-sheet'); return; }
  const file = input.files[0];
  input.value = '';
  showToast('Bild wird hochgeladen…', '⏳');
  try {
    const blob     = await _resizeTableImage(file);
    const token    = await sb.getValidToken();
    const ts       = Date.now();
    const uid      = sb.getUserId();
    const path     = `${currentEventId}/${uid}_${ts}.jpg`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/event-images/${path}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: blob
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || 'Storage-Upload fehlgeschlagen'); }
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/event-images/${path}`;
    const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
    const record = {
      event_id:    currentEventId,
      uploaded_by: uid,
      image_url:   imageUrl,
      status:      isMod ? 'approved' : 'pending',
      ...(isMod ? { reviewed_by: uid, reviewed_at: new Date().toISOString() } : {})
    };
    const { ok } = await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/event_images`, {
      method: 'POST',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (!ok) throw new Error('Datenbank-Eintrag fehlgeschlagen');
    showToast(isMod ? 'Bild hochgeladen und sofort freigegeben.' : 'Bild hochgeladen! Wird nach Freigabe sichtbar.', '✅');
    if (isMod && typeof loadEventImages === 'function') await loadEventImages(currentEventId);
  } catch(e) {
    showToast('Fehler beim Hochladen: ' + (e.message || ''), '❌');
  }
}

// ── Platten-Bild Upload ───────────────────────────────────────
async function handleTableImageUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (!sb.isLoggedIn()) {
    input.value = '';
    closeAllSheets();
    openSheet('auth-sheet');
    return;
  }
  const file = input.files[0];
  input.value = '';
  showToast('Bild wird komprimiert und hochgeladen…', '⏳');
  try {
    const blob     = await _resizeTableImage(file);
    const imageUrl = await _uploadTableImageToStorage(blob, currentDetailTableId);
    await _saveTableImageRecord(currentDetailTableId, imageUrl);
    const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
    if (isMod) {
      showToast('Bild hochgeladen und sofort freigegeben.', '✅');
      await loadTableImages(currentDetailTableId);
    } else {
      showToast('Bild hochgeladen! Es wird nach Freigabe durch einen Moderator sichtbar.', '✅');
    }
  } catch(e) {
    console.error('Table image upload error:', e);
    showToast('Fehler beim Hochladen: ' + (e.message || ''), '❌');
  }
}

async function _resizeTableImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload  = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.82);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function _uploadTableImageToStorage(blob, tableId) {
  const uid   = sb.getUserId();
  const token = await sb.getValidToken();
  const ts    = Date.now();
  const path  = `${tableId}/${uid}_${ts}.jpg`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/table-images/${path}`, {
    method:  'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body:    blob
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || 'Storage-Upload fehlgeschlagen');
  }
  return `${SUPABASE_URL}/storage/v1/object/public/table-images/${path}`;
}

async function _saveTableImageRecord(tableId, imageUrl) {
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const record = {
    table_id:    tableId,
    uploaded_by: sb.getUserId(),
    image_url:   imageUrl,
    status:      isMod ? 'approved' : 'pending',
  };
  if (isMod) {
    record.reviewed_by = sb.getUserId();
    record.reviewed_at = new Date().toISOString();
  }
  const qb = new QueryBuilder('table_images');
  const { error } = await qb.insert(record);
  if (error) throw new Error('Datenbank-Eintrag fehlgeschlagen: ' + JSON.stringify(error));
}

// ── Approved DB-Bilder in den Slider einfügen ─────────────────
async function loadTableImages(tableId) {
  try {
    const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
    const qb = new QueryBuilder('table_images');
    qb._select = isMod ? 'id,image_url,created_at,uploaded_by' : 'id,image_url,created_at';
    qb.eq('table_id', tableId).eq('status', 'approved').order('created_at');
    const { data } = await qb.execute();
    if (data && data.length) {
      let uploaderMap = {};
      if (isMod) {
        const ids = [...new Set(data.map(i => i.uploaded_by).filter(Boolean))];
        if (ids.length) {
          try {
            const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${ids.join(',')})`;
            const { data: profiles } = await fetchWithRefresh(url, { headers: dbHeaders() });
            if (Array.isArray(profiles)) profiles.forEach(p => { uploaderMap[p.id] = p.username; });
          } catch(e) {}
        }
      }
      _appendDbImagesToSlider(data, uploaderMap, isMod);
    }
  } catch(e) { /* silent — OSM-Bilder bleiben sichtbar */ }
}

function _appendDbImagesToSlider(dbImages, uploaderMap, isMod) {
  const slider = document.querySelector('#tds-body .detail-slider');
  if (!slider) return;

  const slidesWrap = slider.querySelector('.ds-slides-wrap');
  const thumbsRow  = slider.querySelector('.ds-thumbs');
  const addBtn     = thumbsRow?.querySelector('.ds-thumb-add');
  if (!slidesWrap || !thumbsRow) return;

  // Remove "Noch kein Bild" placeholder when real images arrive
  const emptySlide = slidesWrap.querySelector('.ds-slide-empty');
  const hadEmpty = !!emptySlide;
  if (emptySlide) emptySlide.remove();

  // Skip images already rendered (safe to call multiple times)
  const existingUrls = new Set(
    [...slidesWrap.querySelectorAll('.ds-db-slide')].map(el => el.dataset.imgUrl)
  );

  dbImages.forEach((img, dbIdx) => {
    if (existingUrls.has(img.image_url)) return;
    const currentCount = slider.querySelectorAll('.ds-slide').length;
    const date = new Date(img.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
    const uploader = (uploaderMap && uploaderMap[img.uploaded_by]) || 'Unbekannt';

    // Neuer Slide (erster sichtbar, wenn Placeholder ersetzt)
    const slide = document.createElement('div');
    slide.className = 'ds-slide ds-db-slide';
    slide.style.display = (hadEmpty && dbIdx === 0) ? '' : 'none';
    slide.dataset.imgId  = img.id;
    slide.dataset.imgUrl = img.image_url;
    slide.innerHTML = `<img src="${escAttr(img.image_url)}" onerror="this.src='${PLATE_FALLBACK}'" loading="lazy">`
      + (isMod ? `<button class="ds-delete-btn" onclick="event.stopPropagation();deleteTableImage(this.closest('.ds-slide'))" title="Bild löschen">🗑</button>` : '')
      + (isMod ? `<div class="ds-mod-info">👤 ${escHtml(uploader)} · 📅 ${date}</div>` : '');
    slidesWrap.appendChild(slide);

    // Neuer Thumb, vor dem + Button
    const thumb = document.createElement('div');
    thumb.className = 'ds-thumb ds-db-thumb';
    const idx = currentCount;
    thumb.onclick   = () => detailSliderGo(slider, idx);
    thumb.innerHTML = `<img src="${escAttr(img.image_url)}" onerror="this.src='${PLATE_FALLBACK}'" loading="lazy">`;
    thumbsRow.insertBefore(thumb, addBtn);
  });

  // data-count und Counter aktualisieren
  const total = slider.querySelectorAll('.ds-slide').length;
  slider.dataset.count = total;

  if (total > 1) {
    let counter = slider.querySelector('.ds-counter');
    const currentIdx = parseInt(slider.dataset.idx || 0);
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'ds-counter';
      slider.querySelector('.ds-main').appendChild(counter);
    }
    counter.textContent = `${currentIdx + 1}/${total}`;

    if (!slider.querySelector('.ds-nav')) {
      const main = slider.querySelector('.ds-main');
      const prev = document.createElement('button');
      prev.className = 'ds-nav ds-prev';
      prev.textContent = '‹';
      prev.onclick = () => detailSliderStep(slider, -1);
      const next = document.createElement('button');
      next.className = 'ds-nav ds-next';
      next.textContent = '›';
      next.onclick = () => detailSliderStep(slider, 1);
      main.appendChild(prev);
      main.appendChild(next);
    }
  }
}

async function deleteTableImage(slideEl) {
  if (!confirm('Bild wirklich löschen?')) return;

  const imageId  = slideEl.dataset.imgId;
  const imageUrl = slideEl.dataset.imgUrl;

  // Storage löschen
  try {
    const storagePath = imageUrl.replace(`${SUPABASE_URL}/storage/v1/object/public/table-images/`, '');
    const token = await sb.getValidToken();
    await fetch(`${SUPABASE_URL}/storage/v1/object/table-images/${storagePath}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
  } catch(e) { /* Storage-Fehler ignorieren, DB trotzdem löschen */ }

  // DB-Eintrag löschen
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/table_images?id=eq.${encodeURIComponent(imageId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }

  _logModAction('delete_image', 'table_image', imageId);
  showToast('Bild gelöscht', '🗑');

  // Alle DB-Slides + Thumbs entfernen und neu laden
  const slider = document.querySelector('#tds-body .detail-slider');
  if (slider) {
    slider.querySelectorAll('.ds-db-slide').forEach(el => el.remove());
    slider.querySelectorAll('.ds-db-thumb').forEach(el => el.remove());
    const remaining = slider.querySelectorAll('.ds-slide').length;
    slider.dataset.count = remaining;
    const curIdx = parseInt(slider.dataset.idx || 0);
    if (curIdx >= remaining) detailSliderGo(slider, 0);
    const counter = slider.querySelector('.ds-counter');
    if (remaining <= 1) {
      counter?.remove();
      slider.querySelectorAll('.ds-nav').forEach(el => el.remove());
    } else if (counter) {
      counter.textContent = `${parseInt(slider.dataset.idx || 0) + 1}/${remaining}`;
    }
  }
  await loadTableImages(currentDetailTableId);
}

function _parseCoord(v) {
  if (v == null || v === '') return NaN;
  return parseFloat(String(v).replace(',', '.'));
}

function openMapsDirections(rawLat, rawLng, name, addr) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const lat = _parseCoord(rawLat);
  const lng = _parseCoord(rawLng);
  const hasCoords = !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  let url;
  if (hasCoords) {
    url = isIOS
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  } else {
    const q = encodeURIComponent((addr || name || 'Tischtennisplatte').trim());
    url = isIOS
      ? `https://maps.apple.com/?q=${q}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  window.location.href = url;
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
  const el    = document.getElementById(`tds-comments-${tableId}`);
  if(!el) return;
  const myId  = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  try {
    const qb = new QueryBuilder('comments');
    qb._select = 'id,user_id,text,created_at,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('table_id', tableId).order('created_at', true).limit(3);
    const {data} = await qb.execute();
    if(!data || !data.length) {
      el.innerHTML = `<div class="tds-no-comments">Noch keine Kommentare.</div>`;
      return;
    }
    el.innerHTML = data.map(c => {
      const date    = new Date(c.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'});
      const av      = getAvatarContent(c.profiles);
      const name    = c.profiles?.username || 'Anonym';
      const del     = isMod ? `<button class="comment-delete-btn" onclick="deleteComment('${escAttr(c.id)}','inline')">🗑</button>` : '';
      const isOwn   = c.user_id === myId;
      const preview = escAttr((c.text || '').slice(0, 80));
      const report  = (!isMod && sb.isLoggedIn() && !isOwn)
        ? `<button class="report-btn" data-type="comment" data-id="${escAttr(c.id)}" data-preview="${preview}" onclick="openReportFromBtn(this)" title="Melden">🚩</button>`
        : '';
      return `<div class="tds-comment-row">
        <div class="tds-comment-av">${av}</div>
        <div class="tds-comment-body">
          <div class="tds-comment-meta">${escHtml(name)} <span>· ${date}</span></div>
          <div class="tds-comment-text">${escHtml(c.text)}</div>
        </div>
        ${report}${del}
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
    qb._select = 'id,user_id,text,created_at,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('table_id', tableId).order('created_at', true);
    const {data} = await qb.execute();
    renderComments(data || []);
  } catch(e) {
    renderComments([]);
  }
}

function renderComments(comments) {
  const el    = document.getElementById('comment-list');
  const myId  = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  if(!comments.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Kommentare.<br>Sei der Erste! 💬</div>`;
    return;
  }
  el.innerHTML = comments.map(c => {
    const date    = new Date(c.created_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'});
    const del     = isMod ? `<button class="comment-delete-btn" onclick="deleteComment('${escAttr(c.id)}','sheet')">🗑</button>` : '';
    const isOwn   = c.user_id === myId;
    const preview = escAttr((c.text || '').slice(0, 80));
    const report  = (!isMod && sb.isLoggedIn() && !isOwn)
      ? `<button class="report-btn" data-type="comment" data-id="${escAttr(c.id)}" data-preview="${preview}" onclick="openReportFromBtn(this)" title="Melden">🚩</button>`
      : '';
    return `<div class="comment-item">
      <div class="comment-header">
        <div class="comment-avatar">${getAvatarContent(c.profiles)}</div>
        <div class="comment-author">${c.profiles?.username||'Anonym'}</div>
        <div class="comment-date">${date}</div>
        ${report}${del}
      </div>
      <div class="comment-text">${c.text}</div>
    </div>`;
  }).join('');
}

async function deleteComment(commentId, context) {
  if (!confirm('Kommentar wirklich löschen?')) return;
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/comments?id=eq.${encodeURIComponent(commentId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }
  _logModAction('delete_comment', 'comment', commentId);
  showToast('Kommentar gelöscht');
  if (context === 'sheet') openComments(currentDetailTableId);
  else loadCommentsInline(currentDetailTableId);
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

// ── IMAGE LIGHTBOX ────────────────────────────────────────────────────────────

let _lbxPhotos = [], _lbxIdx = 0;

function openLightbox(sliderEl) {
  const imgs = Array.from(sliderEl.querySelectorAll('.ds-slide:not(.ds-slide-empty) img'));
  if (!imgs.length) return;
  _lbxPhotos = imgs.map(img => img.src);
  _lbxIdx = parseInt(sliderEl.dataset.idx || 0);
  _lbxGo(_lbxIdx);
  document.getElementById('img-lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('img-lightbox').style.display = 'none';
  _lbxPhotos = [];
}

function lightboxStep(dir) {
  if (_lbxPhotos.length < 2) return;
  _lbxIdx = (_lbxIdx + dir + _lbxPhotos.length) % _lbxPhotos.length;
  _lbxGo(_lbxIdx);
}

function _lbxGo(idx) {
  const count = _lbxPhotos.length;
  document.getElementById('lbx-img').src = _lbxPhotos[idx] || '';
  const show = count > 1;
  document.getElementById('lbx-prev').style.display    = show ? '' : 'none';
  document.getElementById('lbx-next').style.display    = show ? '' : 'none';
  document.getElementById('lbx-counter').textContent   = show ? `${idx + 1} / ${count}` : '';
}
