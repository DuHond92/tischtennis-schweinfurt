// ╔══════════════════════════════════════════════════════════════╗
// ║           PLATTE VORSCHLAGEN                                 ║
// ╚══════════════════════════════════════════════════════════════╝

let suggestLat = null, suggestLng = null;
let suggestPinMarker = null;
let suggestStep = 1;
let suggestMapClickActive = false;
let _suggestImageFile = null;
let _editingSuggestionId       = null;
let _editingSuggestionImageUrl = null;

function openSuggestSheet() {
  if (!sb.isLoggedIn()) {
    showToast('Bitte zuerst anmelden', 'info');
    openSheet('auth-sheet');
    return;
  }
  PTAnalytics.track('plate_suggest_started');
  _resetSuggestForm();
  openSheet('suggest-table-sheet');
}

function closeSuggestSheet() {
  closeAllSheets();
  _cancelSuggestMapClick();
}

function _resetSuggestForm() {
  _editingSuggestionId       = null;
  _editingSuggestionImageUrl = null;
  suggestLat = null;
  suggestLng = null;
  _setSuggestStep(1);
  _clearSuggestPin();
  ['sug-name', 'sug-address', 'sug-count', 'sug-desc', 'sug-opening-hours', 'sug-access-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cond = document.getElementById('sug-condition');
  if (cond) cond.value = '';
  const acc = document.getElementById('sug-access-type');
  if (acc) acc.value = 'public';
  document.querySelectorAll('.sug-type-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  _updateCoordDisplay();
  _suggestImageFile = null;
  const prev = document.getElementById('sug-photo-preview');
  const add  = document.getElementById('sug-add-photo-btn');
  if (prev) prev.style.display = 'none';
  if (add)  add.style.display  = '';
  // Edit-Mode UI zurücksetzen
  const modeTitle = document.getElementById('sug-sheet-mode-title');
  if (modeTitle) modeTitle.textContent = 'Platte vorschlagen';
  const submitBtn = document.getElementById('sug-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Absenden';
  const fb = document.getElementById('sug-edit-feedback');
  if (fb) { fb.style.display = 'none'; fb.innerHTML = ''; }
  const successTitle = document.getElementById('sug-success-title');
  if (successTitle) successTitle.textContent = 'Deine Platte wurde eingetragen!';
  const successText = document.getElementById('sug-success-text');
  if (successText) successText.textContent = 'Danke für deinen Vorschlag. Wir prüfen die Platte und geben sie frei, sobald alles passt.';
  const successSub = document.getElementById('sug-success-sub');
  if (successSub) successSub.style.display = '';
  const restartBtn = document.getElementById('sug-restart-btn');
  if (restartBtn) restartBtn.style.display = '';
  // Inline-Errors zurücksetzen
  clearInlineError('sug-name-error');
  clearInlineError('sug-loc-error');
  _clearSugNameError();
}

// ── BEARBEITEN-MODUS (abgelehnte Einträge) ────────────────────────────────────

function openSuggestSheetForEdit(s) {
  if (!sb.isLoggedIn()) { showToast('Bitte zuerst anmelden', 'info'); return; }
  _resetSuggestForm();

  _editingSuggestionId       = s.id;
  _editingSuggestionImageUrl = s.image_url || null;

  // Standort vorbelegen
  suggestLat = s.lat;
  suggestLng = s.lng;
  _updateCoordDisplay();
  if (suggestLat && suggestLng) _placeSuggestPin(suggestLat, suggestLng);

  // Felder vorbelegen
  const fields = {
    'sug-name':           s.name          || '',
    'sug-address':        s.address       || '',
    'sug-count':          s.table_count   != null ? String(s.table_count) : '',
    'sug-desc':           s.description   || '',
    'sug-opening-hours':  s.opening_hours || '',
    'sug-access-note':    s.access_note   || '',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  const cond = document.getElementById('sug-condition');
  if (cond) cond.value = s.condition || '';
  const acc = document.getElementById('sug-access-type');
  if (acc) acc.value = s.access_type || 'public';
  document.querySelectorAll('.sug-type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === (s.type || 'outdoor')));

  // Vorhandenes Bild anzeigen
  if (s.image_url) {
    const img  = document.getElementById('sug-img-preview');
    const prev = document.getElementById('sug-photo-preview');
    const add  = document.getElementById('sug-add-photo-btn');
    if (img)  img.src = s.image_url;
    if (prev) prev.style.display = '';
    if (add)  add.style.display  = 'none';
  }

  // UI auf Bearbeitungs-Modus umschalten
  const modeTitle = document.getElementById('sug-sheet-mode-title');
  if (modeTitle) modeTitle.textContent = 'Eintrag bearbeiten';
  const submitBtn = document.getElementById('sug-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Erneut einreichen';
  const restartBtn = document.getElementById('sug-restart-btn');
  if (restartBtn) restartBtn.style.display = 'none';

  // Moderationsfeedback-Banner einblenden
  if (s.rejection_reason) {
    const fb = document.getElementById('sug-edit-feedback');
    if (fb) {
      fb.innerHTML = `<div class="sug-edit-feedback-inner"><b>Feedback vom Team:</b><br>${escHtml(s.rejection_reason)}</div>`;
      fb.style.display = '';
    }
  }

  openSheet('suggest-table-sheet');
  _setSuggestStep(2);
}

function _clearSugNameError() {
  const el = document.getElementById('sug-name');
  if (el) { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); }
  clearInlineError('sug-name-error');
}

function _showSugFieldError(fieldId, errorId, msg) {
  const el = document.getElementById(fieldId);
  if (el) { el.classList.add('input-error'); el.setAttribute('aria-invalid', 'true'); }
  showInlineError(errorId, { title: msg });
  const errEl = document.getElementById(errorId);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (errEl) errEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  if (el)    el.focus({ preventScroll: true });
}

function _setSuggestStep(step) {
  suggestStep = step;
  [1, 2, 3].forEach(s => {
    const el = document.getElementById(`sug-step-${s}`);
    if (el) el.style.display = s === step ? '' : 'none';
  });
  document.querySelectorAll('.sug-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i < step);
    dot.classList.toggle('done', i + 1 < step);
  });
}

// ── STANDORT ─────────────────────────────────────────────────────────────────

function suggestUseGPS() {
  if (!navigator.geolocation) { showToast('GPS nicht verfügbar', 'warning'); return; }
  const btn = document.getElementById('sug-gps-btn');
  const orig = btn?.innerHTML;
  if (btn) btn.textContent = '⏳ Ermittle Standort…';
  PTAnalytics.track('location_permission_requested', { source: 'suggest' });
  navigator.geolocation.getCurrentPosition(pos => {
    suggestLat = pos.coords.latitude;
    suggestLng = pos.coords.longitude;
    if (btn && orig) btn.innerHTML = orig;
    PTAnalytics.track('location_permission_granted', { source: 'suggest' });
    _updateCoordDisplay();
    _placeSuggestPin(suggestLat, suggestLng);
    showToast('Standort übernommen');
  }, err => {
    if (btn && orig) btn.innerHTML = orig;
    if (err.code === 1) {
      PTAnalytics.track('location_permission_denied', { source: 'suggest' });
      showToast('Standortfreigabe verweigert. Bitte in den Einstellungen erlauben.', 'warning');
    } else {
      showToast('Standort nicht verfügbar', 'warning');
    }
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

function suggestActivateMapClick() {
  suggestMapClickActive = true;
  closeAllSheets();
  showToast('Tippe auf die Karte, um den Standort zu setzen', 'info');
  if (leafletMap) leafletMap.getContainer().style.cursor = 'crosshair';
}

function _cancelSuggestMapClick() {
  suggestMapClickActive = false;
  if (leafletMap) leafletMap.getContainer().style.cursor = '';
}

function _handleSuggestMapClick(e) {
  if (!suggestMapClickActive) return;
  _cancelSuggestMapClick();
  suggestLat = e.latlng.lat;
  suggestLng = e.latlng.lng;
  _placeSuggestPin(suggestLat, suggestLng);
  _updateCoordDisplay();
  openSheet('suggest-table-sheet');
}

function _placeSuggestPin(lat, lng) {
  if (!leafletMap) return;
  _clearSuggestPin();
  suggestPinMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div style="background:#F59E0B;color:#fff;width:36px;height:36px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:1.1rem;
        box-shadow:0 3px 14px rgba(245,158,11,0.45);border:2.5px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></div>`,
      iconSize: [36, 36], iconAnchor: [18, 36]
    })
  }).addTo(leafletMap);
  leafletMap.setView([lat, lng], Math.max(leafletMap.getZoom(), 16), { animate: true });
}

function _clearSuggestPin() {
  if (suggestPinMarker && leafletMap) {
    leafletMap.removeLayer(suggestPinMarker);
    suggestPinMarker = null;
  }
}

// Vollständiger State-Cleanup beim Abbrechen des Suggest-Flows.
// Guard: wenn der User gerade per Map-Klick neu positioniert (suggestMapClickActive),
// darf der bestehende Pin nicht entfernt werden.
function _cleanupSuggestPin() {
  if (suggestMapClickActive) return;
  _clearSuggestPin();
  suggestLat = null;
  suggestLng = null;
}

function _updateCoordDisplay() {
  const el  = document.getElementById('sug-coord-display');
  const btn = document.getElementById('sug-step1-next');
  if (!el) return;
  if (suggestLat && suggestLng) {
    el.textContent = `${suggestLat.toFixed(6)}, ${suggestLng.toFixed(6)}`;
    el.classList.add('has-coords');
    if (btn) btn.removeAttribute('disabled');
  } else {
    el.textContent = 'Noch kein Standort gewählt';
    el.classList.remove('has-coords');
    if (btn) btn.setAttribute('disabled', '');
  }
}

// ── FOTO PICKER ──────────────────────────────────────────────────────────────

async function _openSuggestPhotoPicker() {
  const file = await pickImageFromPhotoLibrary('sug-file-gallery');
  if (file) _handleSuggestImageFile(file);
}
function _handleSuggestImageSelect(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';
  _handleSuggestImageFile(file);
}
function _handleSuggestImageFile(file) {
  if (!file) return;
  _suggestImageFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const img  = document.getElementById('sug-img-preview');
    const prev = document.getElementById('sug-photo-preview');
    const add  = document.getElementById('sug-add-photo-btn');
    if (img)  img.src = ev.target.result;
    if (prev) prev.style.display = '';
    if (add)  add.style.display  = 'none';
  };
  reader.readAsDataURL(file);
}
function _removeSuggestImage() {
  _suggestImageFile         = null;
  _editingSuggestionImageUrl = null;
  const prev = document.getElementById('sug-photo-preview');
  const add  = document.getElementById('sug-add-photo-btn');
  if (prev) prev.style.display = 'none';
  if (add)  add.style.display  = '';
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────

function suggestNextStep() {
  if (suggestStep === 1) {
    if (!suggestLat || !suggestLng) {
      showInlineError('sug-loc-error', { title: 'Standort erforderlich', desc: 'Bitte wähle einen Standort per GPS oder setze einen Pin auf der Karte.' });
      return;
    }
    clearInlineError('sug-loc-error');
    // Duplikat-Check nur gegen echte Supabase-Daten — FALLBACK_TABLES niemals prüfen
    const src = tablesLoaded ? tables : [];
    const DUPE_M = 50;
    for (const t of src) {
      const d = calcDistance(suggestLat, suggestLng, t.lat, t.lng);
      if (d < DUPE_M) {
        showToast(`"${t.name}" ist nur ${d}m entfernt — bereits eingetragen?`, 'warning');
        return;
      }
    }
    _setSuggestStep(2);
  } else if (suggestStep === 2) {
    _submitSuggestion();
  }
}

function suggestPrevStep() {
  if (suggestStep > 1) _setSuggestStep(suggestStep - 1);
}

function suggestSetType(btn) {
  document.querySelectorAll('.sug-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────

async function _submitSuggestion() {
  const name = document.getElementById('sug-name')?.value.trim();
  if (!name) {
    _showSugFieldError('sug-name', 'sug-name-error', 'Bitte gib einen Namen für die Platte ein.');
    return;
  }
  _clearSugNameError();

  const address      = document.getElementById('sug-address')?.value.trim() || null;
  const typeBtn      = document.querySelector('.sug-type-btn.active');
  const type         = typeBtn?.dataset.type || 'outdoor';
  const countVal     = document.getElementById('sug-count')?.value;
  const count        = countVal ? parseInt(countVal) : null;
  const condition    = document.getElementById('sug-condition')?.value || null;
  const desc         = document.getElementById('sug-desc')?.value.trim() || null;
  const accessType   = document.getElementById('sug-access-type')?.value || 'public';
  const openingHours = document.getElementById('sug-opening-hours')?.value.trim() || null;
  const accessNote   = document.getElementById('sug-access-note')?.value.trim() || null;
  const uid          = sb.getUserId();
  const isMod        = currentUser && ['moderator', 'admin'].includes(currentUser.role);

  const submitBtn = document.getElementById('sug-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gespeichert…'; }

  if (isMod) {
    const { data: tableData, error } = await (new QueryBuilder('tables')).insert({
      name,
      address:       address || '',
      lat:           suggestLat,
      lng:           suggestLng,
      type,
      
      description:   desc || '',
      tables_count:  count,
      access_type:   accessType,
      opening_hours: openingHours,
      access_note:   accessNote,
      status:        'approved',
      source:        'user_suggestion'
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Absenden'; }

    if (error) {
      console.error('Table insert error:', error);
      showToast('Fehler beim Speichern. Bitte erneut versuchen.', 'error');
      return;
    }

    // Bild hochladen und direkt freigeben
    let uploadedImageUrl = null;
    const newTableId = tableData?.[0]?.id;
    if (_suggestImageFile && newTableId) {
      try {
        const blob = await _resizeTableImage(_suggestImageFile);
        uploadedImageUrl = await _uploadTableImageToStorage(blob, newTableId);
        await _saveTableImageRecord(newTableId, uploadedImageUrl);
      } catch(e) {
        console.error('Suggest image upload error:', e);
      }
    }
    _suggestImageFile = null;

    // Karte im Hintergrund aktualisieren
    loadTables().then(() => {
      if (typeof _applyMapFilters === 'function') _applyMapFilters();
      if (typeof renderHome      === 'function') renderHome();
    });

    // Preview-Card für Schritt 3
    _buildSuggestPreviewCard(name, address, count, type, uploadedImageUrl);
    _setSuggestStep(3);
    return;
  }

  // Bild hochladen (neu gewählt oder vorhandenes übernehmen)
  let suggestionImageUrl = null;
  if (_suggestImageFile) {
    try {
      const blob = await _resizeTableImage(_suggestImageFile);
      suggestionImageUrl = await _uploadTableImageToStorage(blob, 'suggestions');
    } catch(e) {
      console.error('Suggest image upload error:', e);
    }
  }
  _suggestImageFile = null;
  const finalImageUrl = suggestionImageUrl || _editingSuggestionImageUrl || null;

  // ── BEARBEITEN-MODUS: PATCH statt INSERT ─────────────────────────
  if (_editingSuggestionId) {
    const { ok } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/table_suggestions?id=eq.${_editingSuggestionId}&submitted_by=eq.${uid}`,
      {
        method:  'PATCH',
        headers: { ...dbHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name, address, lat: suggestLat, lng: suggestLng,
          description:   desc, type, table_count: count, condition,
          access_type:   accessType, opening_hours: openingHours, access_note: accessNote,
          image_url:     finalImageUrl,
          status:        'pending',
          rejection_reason: null,
        })
      }
    );

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Erneut einreichen'; }

    if (!ok) {
      showToast('Fehler beim Speichern. Bitte erneut versuchen.', 'error');
      return;
    }

    // Schritt 3 auf Wiedervorlage anpassen
    const sTitle = document.getElementById('sug-success-title');
    if (sTitle) sTitle.textContent = 'Eintrag erneut eingereicht!';
    const sText = document.getElementById('sug-success-text');
    if (sText) sText.textContent = 'Dein Eintrag wurde erneut zur Prüfung eingereicht.';
    const sSub = document.getElementById('sug-success-sub');
    if (sSub) sSub.style.display = 'none';

    PTAnalytics.track('plate_suggest_resubmitted', { type });
    if (typeof loadMySuggestions === 'function') loadMySuggestions();
    _buildSuggestPreviewCard(name, address, count, type, finalImageUrl);
    _setSuggestStep(3);
    return;
  }

  const qb = new QueryBuilder('table_suggestions');
  const { error } = await qb.insert({
    name,
    address,
    lat:           suggestLat,
    lng:           suggestLng,
    description:   desc,
    type,
    table_count:   count,
    condition,
    access_type:   accessType,
    opening_hours: openingHours,
    access_note:   accessNote,
    image_url:     finalImageUrl,
    submitted_by:  uid,
    status:        'pending'
  });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Absenden'; }

  if (error) {
    console.error('Suggest insert error:', error);
    showToast('Fehler beim Speichern. Bitte erneut versuchen.', 'error');
    return;
  }

  PTAnalytics.track('plate_suggest_submitted', { type });
  _clearSuggestPin();
  if (typeof loadMySuggestions === 'function') loadMySuggestions();
  _buildSuggestPreviewCard(name, address, count, type, finalImageUrl);
  _setSuggestStep(3);
}

function _buildSuggestPreviewCard(name, address, count, type, imageUrl) {
  const previewCard = document.getElementById('sug-preview-card');
  if (!previewCard) return;
  const plateFb    = type === 'indoor' ? 'images/placeholders/plate_indoor.webp' : 'images/placeholders/plate_outdoor.webp';
  const thumbSrc   = imageUrl || plateFb;
  const typeLabel  = type === 'indoor' ? 'Indoor' : 'Outdoor';
  const countLabel = count ? `${count} ${count === 1 ? 'Tisch' : 'Tische'} · ` : '';
  previewCard.innerHTML = `
    <div class="sug-preview-thumb"><img src="${thumbSrc}" alt="" loading="lazy"></div>
    <div class="sug-preview-info">
      <div class="sug-preview-name">${escHtml(name)}</div>
      ${address ? `<div class="sug-preview-addr">${escHtml(address)}</div>` : ''}
      <div class="sug-preview-meta">${countLabel}${typeLabel}</div>
    </div>`;
}

function suggestRestartFlow() {
  _resetSuggestForm();
}
