// ╔══════════════════════════════════════════════════════════════╗
// ║           PLATTE VORSCHLAGEN                                 ║
// ╚══════════════════════════════════════════════════════════════╝

let suggestLat = null, suggestLng = null;
let suggestPinMarker = null;
let suggestStep = 1;
let suggestMapClickActive = false;

function openSuggestSheet() {
  if (!sb.isLoggedIn()) {
    showToast('Bitte zuerst anmelden', '🔒');
    openSheet('auth-sheet');
    return;
  }
  _resetSuggestForm();
  openSheet('suggest-table-sheet');
}

function closeSuggestSheet() {
  closeAllSheets();
  _cancelSuggestMapClick();
}

function _resetSuggestForm() {
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
  if (!navigator.geolocation) { showToast('GPS nicht verfügbar', '⚠️'); return; }
  const btn = document.getElementById('sug-gps-btn');
  const orig = btn?.innerHTML;
  if (btn) btn.textContent = '⏳ Ermittle Standort…';
  navigator.geolocation.getCurrentPosition(pos => {
    suggestLat = pos.coords.latitude;
    suggestLng = pos.coords.longitude;
    if (btn && orig) btn.innerHTML = orig;
    _updateCoordDisplay();
    _placeSuggestPin(suggestLat, suggestLng);
    showToast('Standort übernommen', '📍');
  }, () => {
    if (btn && orig) btn.innerHTML = orig;
    showToast('Standort nicht verfügbar', '⚠️');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

function suggestActivateMapClick() {
  suggestMapClickActive = true;
  closeAllSheets();
  showToast('Tippe auf die Karte, um den Standort zu setzen', '📍');
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
        box-shadow:0 3px 14px rgba(245,158,11,0.45);border:2.5px solid #fff;">📍</div>`,
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

// ── NAVIGATION ────────────────────────────────────────────────────────────────

function suggestNextStep() {
  if (suggestStep === 1) {
    if (!suggestLat || !suggestLng) {
      showToast('Bitte zuerst einen Standort wählen', '⚠️');
      return;
    }
    // Duplikat-Check gegen geladene Platten (50m Radius)
    const src = tables.length ? tables : FALLBACK_TABLES;
    const DUPE_M = 50;
    for (const t of src) {
      const d = calcDistance(suggestLat, suggestLng, t.lat, t.lng);
      if (d < DUPE_M) {
        showToast(`"${t.name}" ist nur ${d}m entfernt — bereits eingetragen?`, '⚠️');
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
  if (!name) { showToast('Name ist ein Pflichtfeld', '⚠️'); return; }

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
    const { error } = await (new QueryBuilder('tables')).insert({
      name,
      address:       address || '',
      lat:           suggestLat,
      lng:           suggestLng,
      type,
      icon:          '🏓',
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
      showToast('Fehler beim Speichern. Bitte erneut versuchen.', '❌');
      return;
    }

    _clearSuggestPin();
    closeAllSheets();
    showToast('Platte sofort eingetragen!', '✅');
    await loadTables();
    if (typeof _applyMapFilters === 'function') _applyMapFilters();
    if (typeof renderHome === 'function') renderHome();
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
    submitted_by:  uid,
    status:        'pending'
  });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Absenden'; }

  if (error) {
    console.error('Suggest insert error:', error);
    showToast('Fehler beim Speichern. Bitte erneut versuchen.', '❌');
    return;
  }

  _clearSuggestPin();

  // Vorschau-Card für Schritt 3 mit den gespeicherten Daten befüllen
  const previewCard = document.getElementById('sug-preview-card');
  if (previewCard) {
    const plateFb    = type === 'indoor' ? 'images/placeholders/plate_indoor.png' : 'images/placeholders/plate_outdoor.png';
    const typeLabel  = type === 'indoor' ? 'Indoor' : 'Outdoor';
    const countLabel = count ? `${count} ${count === 1 ? 'Tisch' : 'Tische'} · ` : '';
    previewCard.innerHTML = `
      <div class="sug-preview-thumb"><img src="${plateFb}" alt=""></div>
      <div class="sug-preview-info">
        <div class="sug-preview-name">${escHtml(name)}</div>
        ${address ? `<div class="sug-preview-addr">${escHtml(address)}</div>` : ''}
        <div class="sug-preview-meta">${countLabel}${typeLabel}</div>
      </div>`;
  }

  _setSuggestStep(3);
}

function suggestRestartFlow() {
  _resetSuggestForm();
}
