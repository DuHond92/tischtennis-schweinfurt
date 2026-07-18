// ╔══════════════════════════════════════════════════════════════╗
// ║           TABLE DETAIL                                       ║
// ╚══════════════════════════════════════════════════════════════╝
let currentDetailTableId = null;

function showTableDetail(id) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x=>x.id===id);
  if(!t) return;
  currentDetailTableId = id;
  PTAnalytics.track('plate_detail_opened', { type: t.type || null });

  // Fotos (OSM-Foto oder Test-Fallback)
  const photos = t.photos && t.photos.length ? t.photos : [];
  const sliderHtml = buildPhotoSlider(t, photos);

  // Distanz + OSM als Badge-Zeile (gleicher Stil wie Karten-Cards)
  const distHtml = _tableDistBadge(t);
  const osmHtml = t.osmId
    ? `<span class="osm-badge">${ic('map-pinned',12)} OpenStreetMap</span>` : '';

  // Zugang-Sektion (neue Felder)
  const _aLabel = { public:'Öffentlich zugänglich', limited:'Eingeschränkt zugänglich', private_or_unclear:'Zugang unklar', temporarily_closed:'Aktuell geschlossen' };
  const _aClass = { limited:'tds-access-limited', private_or_unclear:'tds-access-unclear', temporarily_closed:'tds-access-closed' };
  const showAccess = (t.accessType && t.accessType !== 'public') || t.accessNote || t.openingHours;
  const accessHtml = showAccess ? `
    <div class="tds-access-block tds-access-section">
      <div class="tds-section-label">${ic('lock',13)} Zugang</div>
      ${(t.accessType && t.accessType !== 'public') ? `<span class="tds-access-status ${_aClass[t.accessType]||''}">${_aLabel[t.accessType]||''}</span>` : ''}
      ${t.openingHours ? `<div class="tds-access-row">${ic('clock',13)} ${escHtml(t.openingHours)}</div>` : ''}
      ${t.accessNote   ? `<div class="tds-access-note">${escHtml(t.accessNote)}</div>` : ''}
    </div>` : '';

  // Events direkt aus globalem allEvents filtern — nie Demo-Daten
  const evArr = allEvents.filter(e => e.tid === id);
  const evHtml = evArr.length===0
    ? `<div class="tds-events-empty">
        Noch keine Spiele an dieser Platte geplant.
       </div>`
    : `<div class="tds-event-list">${evArr.map(e=>`
      <div class="tds-event-card" onclick="showEventDetail(${e.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' ')showEventDetail(${e.id})">
        <div class="tds-event-card-body">
          <div class="tds-event-name">${escHtml(e.name)}</div>
          <div class="tds-event-tag-row">
            ${gameTypePill(e.type)}
          </div>
          <div class="tds-event-meta">${ic('calendar',12)} ${formatEventDate(e)} · ${ic('users',12)} ${e.p}/${e.max} Spieler</div>
          ${eventStatusBlock(e)}
        </div>
        <div class="tds-event-chevron">${ic('chevron-right', 16)}</div>
      </div>`).join('')}</div>`;

  // Basisinfos-Meta (sync, kein Rating hier — das kommt in die Rating-Card)
  const metaLine = _tableMetaLine(t, { operator: true });

  document.getElementById('tds-body').innerHTML = `
    ${sliderHtml}
    <!-- Basisinfos -->
    <div class="eds-section eds-section--info">
      <div class="ds-name">${t.name}</div>
      <div class="ds-address">${icPlate(13)} ${t.addr||'Schweinfurt'}</div>
      ${metaLine ? `<div class="tds-meta-line">${metaLine}</div>` : ''}
      <div class="plt-badge-row" style="margin-top:6px;">${distHtml}${osmHtml}</div>
    </div>
    <!-- Community-Bewertung (async) -->
    <div id="tds-community-rating-${t.id}"></div>
    <!-- Zugang (optional, Detailinformationen) -->
    ${accessHtml}
    <!-- Kommende Spiele -->
    <div class="eds-section tds-events-section">
      <div class="eds-section-title">Kommende Spiele</div>
      ${evHtml}
    </div>
    <div class="sheet-map-attr" style="padding-bottom:8px;">© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</div>`;

  // Fixed Bottom Bar — CTA-Buttons mit korrekten Event-Handlern (kein inline-JS-Escaping nötig)
  const actionsEl = document.getElementById('tds-actions');
  if (actionsEl) {
    const lat  = t.lat  ?? t.latitude  ?? '';
    const lng  = t.lng  ?? t.lon ?? t.longitude ?? '';
    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn-primary tds-float-create';
    createBtn.innerHTML = `${ic('calendar-plus',15)} Spiel erstellen`;
    createBtn.onclick = () => openCreateEventSheetFromTds(t.id);
    const routeBtn = document.createElement('button');
    routeBtn.className = 'btn btn-secondary tds-float-route';
    routeBtn.innerHTML = `${ic('navigate',15)} In Karten öffnen`;
    routeBtn.onclick = () => openMapsDirections(lat, lng, t.name||'', t.addr||'');
    actionsEl.innerHTML = '';
    actionsEl.append(createBtn, routeBtn);
  }

  openSheet('table-detail-sheet');
  _initSliderTouch(document.querySelector('#tds-body .ds-main'));
  const shareBtn = document.getElementById('tds-share-btn');
  if (shareBtn) shareBtn.onclick = () => shareTable(t);
  loadRatingsForTable(id);
  loadTableImages(id);
}

// Aktualisiert nur die Kommende-Spiele-Sektion im geöffneten Table-Detail.
// Wird nach erfolgreicher Spielerstellung aus dem TDS-Kontext aufgerufen.
function _refreshTableDetailEvents(tableId) {
  const sec = document.querySelector('#tds-body .tds-events-section');
  if (!sec) return;
  const evArr = allEvents.filter(e => e.tid === tableId);
  const evHtml = evArr.length === 0
    ? `<div class="tds-events-empty">Noch keine Spiele an dieser Platte geplant.</div>`
    : `<div class="tds-event-list">${evArr.map(e => `
      <div class="tds-event-card" onclick="showEventDetail(${e.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' ')showEventDetail(${e.id})">
        <div class="tds-event-card-body">
          <div class="tds-event-name">${escHtml(e.name)}</div>
          <div class="tds-event-tag-row">
            ${gameTypePill(e.type)}
          </div>
          <div class="tds-event-meta">${ic('calendar',12)} ${formatEventDate(e)} · ${ic('users',12)} ${e.p}/${e.max} Spieler</div>
          ${eventStatusBlock(e)}
        </div>
        <div class="tds-event-chevron">${ic('chevron-right', 16)}</div>
      </div>`).join('')}</div>`;
  sec.innerHTML = `<div class="eds-section-title">Kommende Spiele</div>${evHtml}`;
}

const PLATE_FALLBACK = 'images/placeholders/plate_outdoor.png';

function buildPhotoSlider(t, photos) {
  const hasPhotos = photos && photos.length;
  const plateFb = t.type === 'indoor' ? 'images/placeholders/plate_indoor.png' : 'images/placeholders/plate_outdoor.png';

  const slides = hasPhotos
    ? photos.map((src, i) => {
        const s = escAttr(src), f = escAttr(plateFb), l = i === 0 ? 'eager' : 'lazy';
        return `<div class="ds-slide" data-img-url="${s}" style="${i===0?'':'display:none'}">
          <img class="ds-slide-bg" src="${s}" onerror="this.style.display='none'" aria-hidden="true" alt="" loading="${l}">
          <img class="ds-slide-img" src="${s}" onerror="this.src='${f}'" loading="${l}">
        </div>`;
      }).join('')
    : `<div class="ds-slide ds-slide-empty">
        <img src="${escAttr(plateFb)}" class="thumb-placeholder-img">
        <div class="ds-no-img-hint">Noch kein Bild</div>
      </div>`;

  const thumbs = hasPhotos
    ? photos.map((src, i) =>
        `<div class="ds-thumb${i===0?' active':''}" onclick="detailSliderGo(this.closest('.detail-slider'),${i})">
          <img src="${src}" onerror="this.src='${plateFb}'">
        </div>`
      ).join('')
    : '';

  const navHtml = hasPhotos && photos.length > 1 ? `
    <button class="ds-nav ds-prev" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),-1)">‹</button>
    <button class="ds-nav ds-next" onclick="event.stopPropagation();detailSliderStep(this.closest('.detail-slider'),1)">${ic('chevron-right', 16)}</button>` : '';

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
        <div class="ds-thumb-add" title="Bild hinzufügen" onclick="_openPhotoSourcePicker()">+</div>
      </div>
    </div>
    <input type="file" id="ds-file-camera"  accept="image/*" capture="environment" style="display:none" onchange="handleTableImageUpload(this)">
    <input type="file" id="ds-file-gallery" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" style="display:none" onchange="handleTableImageUpload(this)">`;
}

function detailSliderGo(slider, idx, dir) {
  const slides  = slider.querySelectorAll('.ds-slide');
  const thumbs  = slider.querySelectorAll('.ds-thumb');
  const counter = slider.querySelector('.ds-counter');
  const count   = slides.length;
  const prevIdx = parseInt(slider.dataset.idx || 0);
  if (idx === prevIdx || !slides[idx]) return;

  // Determine direction for animation if not passed (thumb clicks)
  const resolvedDir = dir || (idx > prevIdx ? 'next' : 'prev');
  const entryCls    = resolvedDir === 'next' ? 'ds-enter-next' : 'ds-enter-prev';

  const incoming = slides[idx];
  const outgoing = slides[prevIdx];

  // Hide outgoing immediately
  if (outgoing) outgoing.style.display = 'none';

  // Show incoming with entry class (offset + transparent)
  incoming.style.display = '';
  incoming.classList.add(entryCls);
  incoming.offsetHeight; // force reflow so transition sees start state
  incoming.classList.remove(entryCls);

  thumbs.forEach((th, i) => th.classList.toggle('active', i === idx));
  slider.dataset.idx = idx;
  if (counter) counter.textContent = `${idx + 1}/${count}`;
}

function detailSliderStep(slider, dir) {
  const count = parseInt(slider.dataset.count || 1);
  const idx   = (parseInt(slider.dataset.idx || 0) + dir + count) % count;
  detailSliderGo(slider, idx, dir > 0 ? 'next' : 'prev');
}

function _initSliderTouch(mainEl) {
  if (!mainEl || mainEl._touchInited) return;
  mainEl._touchInited = true;
  let startX = 0, startY = 0, isHSwipe = false;
  mainEl.addEventListener('touchstart', e => {
    startX   = e.touches[0].clientX;
    startY   = e.touches[0].clientY;
    isHSwipe = false;
  }, { passive: true });
  mainEl.addEventListener('touchmove', e => {
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (!isHSwipe && dx > dy && dx > 8) isHSwipe = true;
  }, { passive: true });
  mainEl.addEventListener('touchend', e => {
    if (!isHSwipe) return;
    const dx     = e.changedTouches[0].clientX - startX;
    const slider = mainEl.closest('.detail-slider');
    if (!slider || parseInt(slider.dataset.count || 1) < 2) return;
    if (Math.abs(dx) < 40) return;
    e.preventDefault();
    detailSliderStep(slider, dx < 0 ? 1 : -1);
    isHSwipe = false;
  }, { passive: false });
  mainEl.addEventListener('click', e => {
    if (isHSwipe) { e.stopImmediatePropagation(); isHSwipe = false; }
  });
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
    showToast(isMod ? 'Bild hochgeladen und sofort freigegeben.' : 'Bild hochgeladen! Wird nach Freigabe sichtbar.');
    if (isMod && typeof loadEventImages === 'function') await loadEventImages(currentEventId);
  } catch(e) {
    showToast('Fehler beim Hochladen: ' + (e.message || ''), 'error');
  }
}

// ── Foto-Quelle Action Sheet ──────────────────────────────────
function _openPhotoSourcePicker() {
  if (!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  document.getElementById('photo-source-sheet')?.classList.add('open');
}
function _closePhotoSourcePicker() {
  document.getElementById('photo-source-sheet')?.classList.remove('open');
}

// ── Platten-Bild Upload ───────────────────────────────────────
let _tableImgUploading = false;

async function handleTableImageUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (_tableImgUploading) { input.value = ''; return; }
  if (!sb.isLoggedIn()) {
    input.value = '';
    closeAllSheets();
    openSheet('auth-sheet');
    return;
  }
  _tableImgUploading = true;
  const file = input.files[0];
  input.value = '';
  showToast('Bild wird komprimiert und hochgeladen…', '⏳');
  try {
    const blob     = await _resizeTableImage(file);
    const imageUrl = await _uploadTableImageToStorage(blob, currentDetailTableId);
    await _saveTableImageRecord(currentDetailTableId, imageUrl);
    const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
    if (isMod) {
      showToast('Bild hochgeladen und sofort freigegeben.');
      // Reload fresh from Supabase so we never double-append local state
      const slider = document.querySelector('#tds-body .detail-slider');
      if (slider) {
        slider.querySelectorAll('.ds-db-slide').forEach(el => el.remove());
        slider.querySelectorAll('.ds-db-thumb').forEach(el => el.remove());
      }
      await loadTableImages(currentDetailTableId);

      // In-Memory-Daten aktualisieren damit Thumbnails auf Karte + Home sofort stimmen
      const tableObj = tables.find(t => t.id === currentDetailTableId);
      if (tableObj) {
        if (!Array.isArray(tableObj.photos)) tableObj.photos = [];
        if (!tableObj.photos.includes(imageUrl)) tableObj.photos.push(imageUrl);
      }
      if (typeof _applyMapFilters === 'function') _applyMapFilters();
      if (typeof refreshActiveMapPreview === 'function') refreshActiveMapPreview();
      if (typeof renderHome === 'function') renderHome();
    } else {
      showToast('Bild hochgeladen! Es wird nach Freigabe durch einen Moderator sichtbar.');
    }
  } catch(e) {
    console.error('Table image upload error:', e);
    showToast('Fehler beim Hochladen: ' + (e.message || ''), 'error');
  } finally {
    _tableImgUploading = false;
  }
}

async function _resizeTableImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('Dieses Fotoformat konnte nicht verarbeitet werden. Bitte wähle ein anderes Bild.'));
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

  // Skip images already rendered — check ALL slides, not just ds-db-slide,
  // because buildPhotoSlider may have pre-rendered the same Supabase URLs from t.photos.
  const existingUrls = new Set(
    [...slidesWrap.querySelectorAll('.ds-slide[data-img-url]')].map(el => el.dataset.imgUrl)
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
    const su = escAttr(img.image_url);
    slide.innerHTML = `<img class="ds-slide-bg" src="${su}" onerror="this.style.display='none'" aria-hidden="true" alt="" loading="lazy">
      <img class="ds-slide-img" src="${su}" onerror="this.src='${PLATE_FALLBACK}'" loading="lazy">`
      + (isMod ? `<button class="ds-delete-btn" onclick="event.stopPropagation();deleteTableImage(this.closest('.ds-slide'))" title="Bild löschen" aria-label="Bild löschen"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>` : '')
      + (isMod ? `<div class="ds-mod-info">${ic('user',12)} ${escHtml(uploader)} · ${ic('calendar',12)} ${date}</div>` : '');
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
      next.innerHTML = ic('chevron-right', 16);
      next.onclick = () => detailSliderStep(slider, 1);
      main.appendChild(prev);
      main.appendChild(next);
    }
  }
}

function deleteTableImage(slideEl) {
  showConfirmDialog({
    title: 'Bild löschen?',
    body: 'Das Foto wird dauerhaft entfernt.',
    confirmLabel: 'Löschen',
    danger: true,
    onConfirm: () => _doDeleteTableImage(slideEl)
  });
}

async function _doDeleteTableImage(slideEl) {
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
  if (!ok) { showToast('Fehler beim Löschen', 'error'); return; }

  _logModAction('delete_image', 'table_image', imageId);
  showToast('Bild gelöscht');

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

  // In-Memory-Foto entfernen damit Thumbnails auf Karte + Home sofort stimmen
  const tableObj = tables.find(t => t.id === currentDetailTableId);
  if (tableObj && Array.isArray(tableObj.photos)) {
    tableObj.photos = tableObj.photos.filter(u => u !== imageUrl);
  }
  if (typeof _applyMapFilters === 'function') _applyMapFilters();
  if (typeof refreshActiveMapPreview === 'function') refreshActiveMapPreview();
  if (typeof renderHome === 'function') renderHome();
}

function _parseCoord(v) {
  if (v == null || v === '') return NaN;
  return parseFloat(String(v).replace(',', '.'));
}

// Escapes backslashes and single quotes for use in a JS string inside a double-quoted HTML attribute
function _escJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _openWithNativeFallback(appUrl, fallbackUrl) {
  let didHide = false;
  const markHidden = () => { didHide = true; };
  document.addEventListener('visibilitychange', () => { if (document.hidden) markHidden(); }, { once: true });
  window.addEventListener('pagehide', markHidden, { once: true });
  window.location.href = appUrl;
  window.setTimeout(() => { if (!didHide) window.location.href = fallbackUrl; }, 900);
}

function openMapsDirections(rawLat, rawLng, name, addr) {
  const lat = _parseCoord(rawLat);
  const lng = _parseCoord(rawLng);
  const hasCoords = !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  _showMapsPicker(lat, lng, hasCoords, name, addr);
}

function _showMapsPicker(lat, lng, hasCoords, name, addr) {
  document.getElementById('maps-picker-overlay')?.remove();

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const q = hasCoords ? null : encodeURIComponent((addr || name || 'Tischtennisplatte').trim());

  const apps = [];
  if (isIOS) {
    apps.push({
      label: 'Apple Karten', emoji: '',
      appUrl: hasCoords ? `maps://?daddr=${lat},${lng}&dirflg=d` : `maps://?q=${q}`,
      webUrl: hasCoords ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `https://maps.apple.com/?q=${q}`,
    });
  }
  apps.push({
    label: 'Google Maps', emoji: '',
    appUrl: hasCoords
      ? (isIOS ? `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving` : `geo:${lat},${lng}?q=${lat},${lng}`)
      : (isIOS ? null : `geo:0,0?q=${q}`),
    webUrl: hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`,
  });
  const overlay = document.createElement('div');
  overlay.id = 'maps-picker-overlay';
  overlay.className = 'maps-picker-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay._apps = apps;
  overlay._isStandalone = isStandalone;

  overlay.innerHTML = `
    <div class="maps-picker-sheet">
      <div class="maps-picker-handle"></div>
      <div class="maps-picker-title">Navigation öffnen mit</div>
      ${apps.map((app, i) => `
        <button class="maps-picker-btn" onclick="_pickMapsApp(${i})">
          <span class="maps-picker-emoji">${app.emoji}</span>
          <span class="maps-picker-label">${app.label}</span>
          <span class="maps-picker-arrow">${ic('chevron-right', 16)}</span>
        </button>`).join('')}
      <button class="maps-picker-cancel" onclick="document.getElementById('maps-picker-overlay')?.remove()">Abbrechen</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.querySelector('.maps-picker-sheet').classList.add('maps-picker-sheet--in'));
}

function _pickMapsApp(index) {
  const overlay = document.getElementById('maps-picker-overlay');
  if (!overlay) return;
  const app = overlay._apps[index];
  const isStandalone = overlay._isStandalone;
  overlay.remove();

  if (isStandalone && app.appUrl) {
    _openWithNativeFallback(app.appUrl, app.webUrl);
  } else {
    window.open(app.webUrl, '_blank', 'noopener');
  }
}

// ── RATINGS ───────────────────────────────────────────────────────
let currentRatings = { overall: 0, surface: 0, ground: 0, windshield: 0 };
let currentRatingTableId = null;
let _currentTableHasRatings = false;
let _ratingDetailsOpen = false;
let _myTableRating = null;

const _OVERALL_LABELS = ['', 'schlecht', 'nicht so gut', 'okay', 'gut', 'top!'];
const _SCORE_LABELS   = ['', 'Schwach', 'Okay', 'Gut', 'Sehr gut', 'Top!'];

async function _loadMyRating(tableId) {
  if (!sb.isLoggedIn()) return null;
  try {
    const uid = sb.getUserId();
    const url = `${SUPABASE_URL}/rest/v1/ratings?table_id=eq.${tableId}&user_id=eq.${uid}&select=overall,surface,ground,windshield,comment&limit=1`;
    const { ok, data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    return (ok && Array.isArray(data) && data[0]) ? data[0] : null;
  } catch(e) { return null; }
}

function _renderCommunityRating(tableId, avg, commentList, myRating, tableName) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === tableId);
  const name = escAttr(t?.name || tableName || '');
  const isEdit = !!myRating;
  const btnLabel = isEdit ? 'Bewertung bearbeiten' : 'Platte bewerten';

  if (!avg || !avg.rating_count) {
    return `<div class="tds-cr">
      <div class="tds-cr-empty">Noch keine Bewertungen – sei der Erste!</div>
      <div class="tds-cr-actions">
        <button class="btn btn-secondary btn-sm" onclick="openRating(${tableId},'${name}')">★ Platte bewerten</button>
      </div>
    </div>`;
  }

  const score = parseFloat(avg.avg_overall);
  const count = avg.rating_count;
  const full  = Math.round(score);
  const label = _SCORE_LABELS[full] || '';

  const shown = commentList.slice(0, 2);
  const commentsHtml = shown.length ? `
    <div class="tds-cr-divider"></div>
    <div class="tds-cr-comments">
      ${shown.map(r => {
        const rName  = escHtml(r.profiles?.username || 'Anonym');
        const rFull  = Math.round(r.overall || 0);
        const rStars = '★'.repeat(rFull) + '☆'.repeat(5 - rFull);
        return `<div class="tds-cr-comment">
          <div class="tds-cr-cmt-text">${escHtml(r.comment)}</div>
          <div class="tds-cr-cmt-footer">
            <span class="tds-cr-cmt-name">${rName}</span>
            <span class="tds-cr-cmt-stars">${rStars}</span>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const criteria = [
    { key: 'avg_surface',    label: 'Zustand' },
    { key: 'avg_ground',     label: 'Untergrund' },
    { key: 'avg_windshield', label: 'Windschutz' },
  ].filter(c => avg[c.key] && parseFloat(avg[c.key]) > 0);
  const barsHtml = criteria.length ? `
    <div class="tds-cr-divider"></div>
    <div class="tds-cr-bars">
      ${criteria.map(c => {
        const val = parseFloat(avg[c.key]);
        const pct = (val / 5 * 100).toFixed(0);
        return `<div class="tds-cr-bar-row">
          <span class="tds-cr-bar-label">${c.label}</span>
          <div class="tds-cr-bar"><div class="tds-cr-bar-fill" style="width:${pct}%"></div></div>
          <span class="tds-cr-bar-val">${val.toFixed(1).replace('.', ',')}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  const moreCount = count > 2 ? count - 2 : 0;
  const moreBtn = moreCount > 0
    ? `<button class="tds-cr-more-btn" onclick="openAllRatings(${tableId})">+${moreCount} weitere Bewertung${moreCount > 1 ? 'en' : ''} ansehen</button>`
    : '';

  return `<div class="tds-cr">
    <div class="tds-cr-score-row">
      <div class="tds-cr-score-left">
        <span class="tds-cr-score-num">★ ${score.toFixed(1).replace('.', ',')}</span>
        ${label ? `<span class="tds-cr-score-label">${label}</span>` : ''}
        <span class="tds-cr-score-count">${count} Bewertung${count > 1 ? 'en' : ''}</span>
      </div>
      <button class="tds-cr-all-btn" onclick="openAllRatings(${tableId})">Alle ${ic('chevron-right', 14)}</button>
    </div>
    ${commentsHtml}
    ${barsHtml}
    <div class="tds-cr-divider"></div>
    <div class="tds-cr-actions">
      ${moreBtn}
      <button class="btn btn-secondary btn-sm" onclick="openRating(${tableId},'${name}')">★ ${btnLabel}</button>
    </div>
  </div>`;
}

async function openRating(tableId, tableName) {
  if(!sb.isLoggedIn()) { closeAllSheets(); openSheet('auth-sheet'); return; }
  currentRatingTableId = tableId;

  const existing = await _loadMyRating(tableId);
  _myTableRating = existing;
  const vals = existing || { overall:0, surface:0, ground:0, windshield:0, comment:'' };

  currentRatings = { overall: vals.overall||0, surface: vals.surface||0, ground: vals.ground||0, windshield: vals.windshield||0 };
  ['overall','surface','ground','windshield'].forEach(cat => updateStarDisplay(cat, currentRatings[cat]));
  document.getElementById('rating-comment').value = vals.comment || '';

  const isEdit = !!existing;
  const titleEl = document.getElementById('rating-sheet-title');
  if (titleEl) titleEl.textContent = isEdit ? 'Bewertung bearbeiten' : 'Platte bewerten';

  const labelEl = document.getElementById('rating-overall-label');
  if (labelEl) labelEl.textContent = _OVERALL_LABELS[currentRatings.overall] || '';
  const hint = document.getElementById('rating-req-hint');
  if (hint) hint.style.display = 'none';

  _ratingDetailsOpen = !!(vals.surface || vals.ground || vals.windshield);
  const detailsBody = document.getElementById('rating-details-body');
  const chevron = document.getElementById('rating-details-chevron');
  if (detailsBody) detailsBody.style.display = _ratingDetailsOpen ? '' : 'none';
  if (chevron) chevron.style.transform = _ratingDetailsOpen ? 'rotate(90deg)' : '';

  const btn = document.getElementById('rating-submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Änderungen speichern' : 'Bewertung speichern'; }

  openTdsSubpage('rating-sheet');
}

function closeRatingSheet() {
  closeTdsSubpage('rating-sheet');
}

function closeAllRatingsSheet() {
  closeTdsSubpage('all-ratings-sheet');
}

function _toggleRatingDetails() {
  _ratingDetailsOpen = !_ratingDetailsOpen;
  const body    = document.getElementById('rating-details-body');
  const chevron = document.getElementById('rating-details-chevron');
  if (body)    body.style.display      = _ratingDetailsOpen ? '' : 'none';
  if (chevron) chevron.style.transform = _ratingDetailsOpen ? 'rotate(90deg)' : '';
}

function setRating(category, value) {
  currentRatings[category] = value;
  updateStarDisplay(category, value);
  if (category === 'overall') {
    const labelEl = document.getElementById('rating-overall-label');
    if (labelEl) labelEl.textContent = _OVERALL_LABELS[value] || '';
    const hint = document.getElementById('rating-req-hint');
    if (hint) hint.style.display = 'none';
  }
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
    const hint = document.getElementById('rating-req-hint');
    if (hint) hint.style.display = '';
    const starsEl = document.getElementById('stars-overall');
    starsEl?.classList.add('stars-shake');
    setTimeout(() => starsEl?.classList.remove('stars-shake'), 400);
    return;
  }
  const btn = document.getElementById('rating-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

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

  const isUpdate = !!_myTableRating;
  if (btn) { btn.disabled = false; btn.textContent = isUpdate ? 'Änderungen speichern' : 'Bewertung speichern'; }

  if(error) {
    console.error('Rating error:', JSON.stringify(error));
    showToast('Fehler: ' + (error.message || error.hint || JSON.stringify(error)), 'error');
    return;
  }

  PTAnalytics.track('plate_rating_submitted', { overall: payload.overall, is_update: isUpdate });
  closeTdsSubpage('rating-sheet');
  showToast(isUpdate ? 'Bewertung aktualisiert.' : 'Bewertung gespeichert. Danke!');
  await loadRatingsForTable(currentRatingTableId);
}

async function loadRatingsForTable(tableId) {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t   = src.find(x => x.id === tableId);
  try {
    const qb = new QueryBuilder('table_ratings_avg');
    qb.eq('table_id', tableId);
    const {data} = await qb.execute();
    const avgData = (data && data[0]) ? data[0] : null;
    const myRating = await _loadMyRating(tableId);
    _myTableRating = myRating;
    let commentList = [];
    if (avgData && avgData.rating_count > 0) {
      const url = `${SUPABASE_URL}/rest/v1/ratings?table_id=eq.${tableId}&comment=not.is.null&select=overall,comment,user_id&order=created_at.desc&limit=3`;
      const { ok, data: cData } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (ok && Array.isArray(cData)) {
        const uIds = [...new Set(cData.map(r => r.user_id).filter(Boolean))];
        const pMap = {};
        if (uIds.length) {
          const pu = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${uIds.join(',')})`;
          const {ok: pOk, data: pD} = await fetchWithRefresh(pu, {headers: dbHeaders()});
          if (pOk && Array.isArray(pD)) pD.forEach(p => { pMap[p.id] = p; });
        }
        commentList = cData.map(r => ({...r, profiles: pMap[r.user_id] || null}));
      }
    }
    renderRatingSummary(tableId, avgData, t?.name || '', myRating, commentList);
  } catch(e) {
    console.warn('Rating load error', e);
    renderRatingSummary(tableId, null, t?.name || '', null, []);
  }
}

function renderRatingSummary(tableId, r, tableName, myRating, commentList) {
  _currentTableHasRatings = !!(r && r.rating_count > 0);

  // Cache into table object so the floating preview card can use it
  const tObj = (tablesLoaded ? tables : FALLBACK_TABLES).find(x => x.id === tableId);
  if (tObj) {
    if (r && r.rating_count > 0) {
      tObj.ratingAvg   = parseFloat(r.avg_overall);
      tObj.ratingCount = r.rating_count;
    } else {
      tObj.ratingAvg = 0;
    }
  }
  if (typeof refreshActiveMapPreview === 'function') refreshActiveMapPreview();

  const el = document.getElementById(`tds-community-rating-${tableId}`);
  if (!el) return;
  el.innerHTML = _renderCommunityRating(tableId, r, commentList || [], myRating, tableName);
}

async function openAllRatings(tableId) {
  const summEl = document.getElementById('ar-summary');
  const listEl = document.getElementById('ar-list');
  if (!listEl) return;

  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const t = src.find(x => x.id === tableId);
  const titleEl = document.getElementById('ar-sheet-title');
  if (titleEl) titleEl.textContent = t?.name || 'Bewertungen';

  const skRow = `<div style="padding:14px 20px;display:flex;flex-direction:column;gap:8px;" aria-hidden="true"><div class="skeleton skeleton-line" style="width:60%;"></div><div class="skeleton skeleton-line skeleton-line--sm" style="width:40%;"></div></div>`;
  if (summEl) summEl.innerHTML = skRow;
  if (listEl) listEl.innerHTML = skRow + skRow;

  openTdsSubpage('all-ratings-sheet');

  try {
    const qb = new QueryBuilder('table_ratings_avg');
    qb.eq('table_id', tableId);
    const { data: avgData } = await qb.execute();
    const avg = (avgData && avgData[0]) ? avgData[0] : null;

    const url = `${SUPABASE_URL}/rest/v1/ratings?table_id=eq.${tableId}&select=overall,surface,ground,windshield,comment,created_at,user_id&order=created_at.desc`;
    const { ok, data: rRaw } = await fetchWithRefresh(url, { headers: dbHeaders() });
    let rList = [];
    if (ok && Array.isArray(rRaw)) {
      const uIds = [...new Set(rRaw.map(r => r.user_id).filter(Boolean))];
      const pMap = {};
      if (uIds.length) {
        const pu = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${uIds.join(',')})`;
        const {ok: pOk, data: pD} = await fetchWithRefresh(pu, {headers: dbHeaders()});
        if (pOk && Array.isArray(pD)) pD.forEach(p => { pMap[p.id] = p; });
      }
      rList = rRaw.map(r => ({...r, profiles: pMap[r.user_id] || null}));
    }

    _renderAllRatings(tableId, avg, rList);
  } catch(e) {
    if (listEl) listEl.innerHTML = `<div class="ar-empty">Bewertungen konnten nicht geladen werden.</div>`;
  }
}

function _renderAllRatings(tableId, avg, rList) {
  const summEl = document.getElementById('ar-summary');
  const listEl = document.getElementById('ar-list');

  if (summEl) {
    if (avg && avg.rating_count > 0) {
      const score = parseFloat(avg.avg_overall);
      const full  = Math.round(score);
      const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
      const label = _SCORE_LABELS[full] || '';
      const criteria = [
        { key: 'avg_surface',    label: 'Zustand der Platte' },
        { key: 'avg_ground',     label: 'Untergrund' },
        { key: 'avg_windshield', label: 'Windschutz' },
      ];
      const barsHtml = criteria
        .filter(c => avg[c.key] && parseFloat(avg[c.key]) > 0)
        .map(c => {
          const val = parseFloat(avg[c.key]);
          const pct = (val / 5 * 100).toFixed(0);
          return `<div class="ar-bar-row">
            <span class="ar-bar-label">${c.label}</span>
            <div class="ar-bar"><div class="ar-bar-fill" style="width:${pct}%"></div></div>
            <span class="ar-bar-val">${val.toFixed(1)}</span>
          </div>`;
        }).join('');
      summEl.innerHTML = `
        <div class="ar-summary">
          <div class="ar-score-big">${score.toFixed(1).replace('.', ',')}</div>
          <div class="ar-score-detail">
            <div class="ar-stars">${stars}</div>
            <div class="ar-count">${avg.rating_count} Bewertung${avg.rating_count > 1 ? 'en' : ''}</div>
            ${label ? `<div class="ar-label">${label}</div>` : ''}
          </div>
        </div>
        ${barsHtml ? `<div class="ar-criteria">${barsHtml}</div>` : ''}
        <div style="padding:12px 20px 0;">
          <button class="btn btn-primary btn-sm btn-full" onclick="closeAllRatingsSheet();openRating(${tableId},'')">Bewertung abgeben</button>
        </div>`;
    } else {
      summEl.innerHTML = '';
    }
  }

  if (!listEl) return;
  if (!rList.length) {
    listEl.innerHTML = `<div class="ar-empty">Noch keine Bewertungen vorhanden.</div>`;
    return;
  }
  const _CRIT = [
    { key: 'surface',    label: 'Zustand der Platte' },
    { key: 'ground',     label: 'Untergrund' },
    { key: 'windshield', label: 'Windschutz' },
  ];
  listEl.innerHTML = rList.map(r => {
    const prof  = r.profiles || {};
    const name  = escHtml(prof.username || 'Anonym');
    const emoji = prof.avatar_emoji || '';
    const full  = Math.round(r.overall || 0);
    const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    const date  = r.created_at
      ? new Date(r.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }) : '';
    const criteriaRows = _CRIT.filter(c => r[c.key]).map(c =>
      `<div class="ar-rev-crit-row">
        <span class="ar-rev-crit-label">${c.label}</span>
        <span class="ar-rev-crit-stars">${'★'.repeat(r[c.key])}${'☆'.repeat(5 - r[c.key])}</span>
      </div>`).join('');
    return `
      <div class="ar-review">
        <div class="ar-rev-head">
          <div class="ar-rev-avatar">${emoji || ic('user', 20)}</div>
          <div class="ar-rev-meta">
            <div class="ar-rev-name">${name}</div>
            ${date ? `<div class="ar-rev-date">${date}</div>` : ''}
          </div>
          <div class="ar-rev-score">${stars}</div>
        </div>
        ${r.comment ? `<div class="ar-rev-comment">${escHtml(r.comment)}</div>` : ''}
        ${criteriaRows ? `<div class="ar-rev-criteria">${criteriaRows}</div>` : ''}
      </div>`;
  }).join('');
}


let _cmtMenuData = {};

function openCommentDotMenu(btn) {
  _cmtMenuData = {
    id:          btn.dataset.cid,
    contentType: btn.dataset.contentType || 'comment',
    ctx:         btn.dataset.ctx,
    isOwn:       btn.dataset.own === '1',
    preview:     btn.dataset.preview
  };
  const isMod      = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const reportBtn  = document.getElementById('cmt-action-report');
  const deleteBtn  = document.getElementById('cmt-action-delete');
  const titleEl    = document.getElementById('cmt-action-title');
  const deleteLbl  = document.getElementById('cmt-delete-label');
  const showReport = !_cmtMenuData.isOwn && !isMod;
  if (titleEl)    titleEl.textContent   = 'Kommentar';
  if (deleteLbl)  deleteLbl.textContent = 'Kommentar löschen';
  if (reportBtn)  reportBtn.style.display = showReport ? '' : 'none';
  if (deleteBtn)  deleteBtn.style.display = isMod ? '' : 'none';
  openSheet('cmt-action-sheet');
}

function openCmtReportDialog() {
  openReport(_cmtMenuData.contentType || 'comment', _cmtMenuData.id, _cmtMenuData.preview);
}

function submitCmtDelete() {
  closeAllSheets();
  if (_cmtMenuData.contentType === 'event_message') {
    deleteEventMessage(_cmtMenuData.id, _cmtMenuData.ctx);
  }
}

// ── IMAGE LIGHTBOX ────────────────────────────────────────────────────────────

let _lbxPhotos = [], _lbxInfos = [], _lbxIdx = 0;

function openLightbox(sliderEl) {
  // Collect one entry per slide — only the foreground .ds-slide-img, not the bg copy
  const slides = Array.from(sliderEl.querySelectorAll('.ds-slide:not(.ds-slide-empty)'));
  if (!slides.length) return;
  _lbxPhotos = slides.map(s => (s.querySelector('.ds-slide-img') || s.querySelector('img'))?.src || '');
  _lbxInfos  = slides.map(s => s.querySelector('.ds-mod-info')?.textContent?.trim() || '');
  _lbxIdx    = parseInt(sliderEl.dataset.idx || 0);
  _lbxGo(_lbxIdx);
  document.getElementById('img-lightbox').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('img-lightbox').style.display = 'none';
  _lbxPhotos = []; _lbxInfos = [];
}

function lightboxStep(dir) {
  if (_lbxPhotos.length < 2) return;
  _lbxIdx = (_lbxIdx + dir + _lbxPhotos.length) % _lbxPhotos.length;
  _lbxGo(_lbxIdx);
}

function _lbxGo(idx) {
  const count   = _lbxPhotos.length;
  document.getElementById('lbx-img').src = _lbxPhotos[idx] || '';
  const infoEl  = document.getElementById('lbx-info');
  if (infoEl) {
    const info = _lbxInfos[idx] || '';
    infoEl.textContent = info;
    infoEl.style.display = info ? '' : 'none';
  }
  const show = count > 1;
  document.getElementById('lbx-prev').style.display  = show ? '' : 'none';
  document.getElementById('lbx-next').style.display  = show ? '' : 'none';
  document.getElementById('lbx-counter').textContent = show ? `${idx + 1} / ${count}` : '';
}

// ── SHARE ─────────────────────────────────────────────────────────
function buildTableShareUrl(t) {
  const url = new URL(_getShareBase());
  url.searchParams.set('table', t.id);
  return url.toString();
}

async function shareTable(t) {
  const name  = t.name || 'Tischtennisplatte';
  const url   = buildTableShareUrl(t);
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
