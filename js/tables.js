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

  // Distanz + OSM als Badge-Zeile (gleicher Stil wie Karten-Cards)
  const distHtml = _tableDistBadge(t);
  const osmHtml = t.osmId
    ? `<span class="osm-badge">${ic('map-pinned',12)} OpenStreetMap</span>` : '';

  // Zugang-Sektion (neue Felder)
  const _aLabel = { public:'Öffentlich zugänglich', limited:'Eingeschränkt zugänglich', private_or_unclear:'Zugang unklar', temporarily_closed:'Aktuell geschlossen' };
  const _aClass = { limited:'tds-access-limited', private_or_unclear:'tds-access-unclear', temporarily_closed:'tds-access-closed' };
  const showAccess = (t.accessType && t.accessType !== 'public') || t.accessNote || t.openingHours;
  const accessHtml = showAccess ? `
    <div class="tds-section tds-access-section">
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
    : evArr.map(e=>`
      <div class="tds-event-row">
        <div class="ev-date-box"><div class="ev-day">${e.day}</div><div class="ev-mon">${e.mon}</div></div>
        <div class="tds-event-info">
          <div class="tds-event-name">${e.name}</div>
          <div class="tds-event-meta">${ic('clock',12)} ${e.time} · ${ic('users',12)} ${e.p}/${e.max}</div>
        </div>
        <span class="ev-type-pill pill-${e.type}">${typeLabel(e.type)}</span>
        <button class="btn btn-secondary btn-sm" onclick="showEventDetail(${e.id})">Details</button>
      </div>`).join('');

  document.getElementById('tds-body').innerHTML = `
    ${sliderHtml}
    <!-- Info Block -->
    <div class="ds-info">
      <div class="ds-name">${t.name}</div>
      <div class="ds-address">${t.addr||'Schweinfurt'}</div>
      <div class="plt-badge-row" style="margin-top:8px;">${distHtml}${osmHtml}</div>
      <div class="tds-meta-line">${_tableMetaLine(t, { operator: true })}</div>
      <div class="tds-rating-inline" id="tds-rating-${t.id}">
        <span style="font-size:0.78rem;color:var(--text-dim);">Lade…</span>
      </div>
    </div>
    ${accessHtml}
    <!-- Aktionen -->
    <div class="tds-cta-row">
      <button class="btn btn-primary btn-full" onclick="closeAllSheets();
        document.getElementById('ev-table').value='${t.id}';
        openSheet('create-event-sheet')">${ic('calendar-plus',15)} Spiel erstellen</button>
      <button class="btn btn-secondary tds-route-btn" onclick="openMapsDirections('${t.lat??t.latitude??''}','${t.lng??t.lon??t.longitude??''}','${_escJs(t.name||'')}','${_escJs(t.addr||'')}')">${ic('navigate',15)} In Karten öffnen</button>
    </div>
    <!-- Kommende Spiele -->
    <div class="tds-events-heading">${ic('calendar',13)} Kommende Spiele</div>
    ${evHtml}
    <!-- Kommentare -->
    <div class="tds-section">
      <div class="tds-section-label">${ic('chat',13)} Kommentare</div>
      <div id="tds-comments-${t.id}">
        <div class="tds-loading">Lade…</div>
      </div>
      <button class="btn btn-secondary btn-sm btn-full tds-comment-btn" onclick="openComments(${t.id})">${ic('chat',13)} Kommentar schreiben</button>
    </div>
    <!-- Bewertung -->
    <div class="rate-btn-row">
      <button class="btn btn-secondary btn-full btn-sm" onclick="openRating(${t.id},'${escAttr(t.name)}')">Bewertung abgeben</button>
    </div>
    <div class="pb-safe"></div>`;

  openSheet('table-detail-sheet');
  _initSliderTouch(document.querySelector('#tds-body .ds-main'));
  const shareBtn = document.getElementById('tds-share-btn');
  if (shareBtn) shareBtn.onclick = () => shareTable(t);
  loadRatingsForTable(id);
  loadCommentsInline(id);
  loadTableImages(id);
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
    showToast(isMod ? 'Bild hochgeladen und sofort freigegeben.' : 'Bild hochgeladen! Wird nach Freigabe sichtbar.', '✅');
    if (isMod && typeof loadEventImages === 'function') await loadEventImages(currentEventId);
  } catch(e) {
    showToast('Fehler beim Hochladen: ' + (e.message || ''), '❌');
  }
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
      showToast('Bild hochgeladen und sofort freigegeben.', '✅');
      // Reload fresh from Supabase so we never double-append local state
      const slider = document.querySelector('#tds-body .detail-slider');
      if (slider) {
        slider.querySelectorAll('.ds-db-slide').forEach(el => el.remove());
        slider.querySelectorAll('.ds-db-thumb').forEach(el => el.remove());
      }
      await loadTableImages(currentDetailTableId);
    } else {
      showToast('Bild hochgeladen! Es wird nach Freigabe durch einen Moderator sichtbar.', '✅');
    }
  } catch(e) {
    console.error('Table image upload error:', e);
    showToast('Fehler beim Hochladen: ' + (e.message || ''), '❌');
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
      label: 'Apple Karten', emoji: '🗺️',
      appUrl: hasCoords ? `maps://?daddr=${lat},${lng}&dirflg=d` : `maps://?q=${q}`,
      webUrl: hasCoords ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `https://maps.apple.com/?q=${q}`,
    });
  }
  apps.push({
    label: 'Google Maps', emoji: '📍',
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
          <span class="maps-picker-arrow">›</span>
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
  const inlineEl  = document.getElementById(`tds-rating-${tableId}`);
  const rateBtnRow = document.querySelector('.rate-btn-row');
  if(inlineEl) {
    if(!r || !r.rating_count) {
      inlineEl.innerHTML = `<button class="tds-rating-cta" onclick="openRating(${tableId},'${escAttr(tableName)}')">☆ Erste Bewertung abgeben</button>`;
      if(rateBtnRow) rateBtnRow.style.display = 'none';
    } else {
      const avg = parseFloat(r.avg_overall);
      const count = r.rating_count;
      inlineEl.innerHTML = `<span class="tds-rating-compact"><span class="tds-rating-star">★</span> ${avg.toFixed(1)} · ${count} Bewertung${count > 1 ? 'en' : ''}</span>`;
      if(rateBtnRow) rateBtnRow.style.display = '';
    }
  }
}

// ── KOMMENTARE ────────────────────────────────────────────────────
async function loadCommentsInline(tableId) {
  const el    = document.getElementById(`tds-comments-${tableId}`);
  if(!el) return;
  try {
    const qb = new QueryBuilder('comments');
    qb._select = 'id,user_id,text,created_at,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('table_id', tableId).order('created_at', true).limit(3);
    const {data} = await qb.execute();
    if(!data || !data.length) {
      el.innerHTML = `<div class="tds-no-comments">Noch keine Kommentare. Teile deine Erfahrung mit dieser Platte.</div>`;
      return;
    }
    el.innerHTML = data.map(c => _commentItemHtml(c, 'inline')).join('');
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
  const el = document.getElementById('comment-list');
  if(!comments.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem;">
      Noch keine Kommentare.<br>Sei der Erste! 💬</div>`;
    return;
  }
  el.innerHTML = comments.map(c => _commentItemHtml(c, 'sheet')).join('');
}

function _commentItemHtml(c, ctx) {
  const myId   = sb.getUserId();
  const isMod  = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const isOwn  = c.user_id === myId;
  const name   = c.profiles?.username || 'Anonym';
  const date   = new Date(c.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const av     = getAvatarHtml(c.profiles, { size: 34 });
  const showDot = sb.isLoggedIn() && (isMod || !isOwn);
  const dotBtn = showDot
    ? `<button class="comment-dot-btn"
         aria-label="Kommentaroptionen"
         data-cid="${escAttr(c.id)}"
         data-ctx="${ctx}"
         data-own="${isOwn ? '1' : ''}"
         data-preview="${escAttr((c.text || '').slice(0, 80))}"
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
      <div class="comment-text">${escHtml(c.text)}</div>
    </div>
  </div>`;
}

let _cmtMenuData = {};

function openCommentDotMenu(btn) {
  document.querySelectorAll('.cdot-menu').forEach(el => el.remove());
  _cmtMenuData = {
    id:      btn.dataset.cid,
    ctx:     btn.dataset.ctx,
    isOwn:   btn.dataset.own === '1',
    preview: btn.dataset.preview
  };
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const items = [];
  if (!_cmtMenuData.isOwn && !isMod) {
    items.push(`<button class="cdot-item" onclick="_cmtReport()">Melden</button>`);
  }
  if (isMod) {
    items.push(`<button class="cdot-item danger" onclick="_cmtDelete()">Löschen</button>`);
  }
  if (!items.length) return;
  const menu = document.createElement('div');
  menu.className = 'cdot-menu';
  menu.innerHTML = items.join('');
  btn.closest('.comment-meta').appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => {
    document.querySelectorAll('.cdot-menu').forEach(el => el.remove());
  }, { once: true }), 0);
}

function _cmtReport() {
  document.querySelectorAll('.cdot-menu').forEach(el => el.remove());
  openReport('comment', _cmtMenuData.id, _cmtMenuData.preview);
}

function _cmtDelete() {
  document.querySelectorAll('.cdot-menu').forEach(el => el.remove());
  deleteComment(_cmtMenuData.id, _cmtMenuData.ctx);
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
  const url = new URL(window.location.href);
  url.searchParams.set('table', t.id);
  // Strip other search params to keep the URL clean
  ['event'].forEach(k => url.searchParams.delete(k));
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
