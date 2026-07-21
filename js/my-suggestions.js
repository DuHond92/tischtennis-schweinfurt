// ╔══════════════════════════════════════════════════════════════╗
// ║           MEINE EINTRÄGE (Plattenvorschläge)                 ║
// ╚══════════════════════════════════════════════════════════════╝

let mySuggestions   = [];
let _pendingMarkers = [];

// ── STATUS ────────────────────────────────────────────────────────
function _suggestionStatusInfo(s) {
  if (s.status === 'approved')
    return { label: 'Freigegeben',           cls: 'sug-status--approved' };
  if (s.status === 'rejected' && s.rejection_reason)
    return { label: 'Änderung erforderlich', cls: 'sug-status--changes'  };
  if (s.status === 'rejected')
    return { label: 'Nicht freigegeben',     cls: 'sug-status--rejected' };
  return   { label: 'Wird geprüft',          cls: 'sug-status--pending'  };
}

// "Offen" = braucht Aufmerksamkeit des Nutzers
function _isOpenSuggestion(s) {
  return s.status === 'pending' || (s.status === 'rejected' && !!s.rejection_reason);
}

function _sugTimeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 3600)  return `vor ${Math.max(1, Math.floor(diff / 60))} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}

// ── DATEN LADEN ───────────────────────────────────────────────────
async function loadMySuggestions() {
  if (!sb.isLoggedIn()) { mySuggestions = []; return; }
  try {
    const qb = new QueryBuilder('table_suggestions');
    qb._select = 'id,name,address,lat,lng,status,rejection_reason,created_at,type,image_url';
    qb._filters.push(`submitted_by=eq.${sb.getUserId()}`);
    qb.order('created_at', true); // descending = newest first
    const { data } = await qb.execute();
    mySuggestions = Array.isArray(data) ? data : [];
  } catch(e) {
    console.warn('[my-suggestions] load error', e);
    mySuggestions = [];
  }
  _refreshPendingMarkers();
  renderHomeSuggestionsSection();
  if (typeof renderMySuggestionsSection === 'function') renderMySuggestionsSection();
}

// ── KARTE: PRÜFUNGS-PINS ─────────────────────────────────────────
function _makePendingMarkerIcon(s) {
  const isChanges = s.status === 'rejected' && s.rejection_reason;
  // Clock SVG for pending, alert circle for changes-required
  const iconPath = isChanges
    ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>'
    : '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
  const color    = isChanges ? '#E67E22' : '#F59E0B';
  const shadow   = isChanges ? 'rgba(230,126,34,0.45)' : 'rgba(245,158,11,0.45)';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 14px ${shadow};border:2.5px solid #fff;cursor:pointer;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">${iconPath}</svg>
    </div>`,
    iconSize: [36, 36], iconAnchor: [18, 18]
  });
}

function _refreshPendingMarkers() {
  _pendingMarkers.forEach(({ m }) => {
    try { if (typeof leafletMap !== 'undefined' && leafletMap) leafletMap.removeLayer(m); } catch(_) {}
  });
  _pendingMarkers = [];

  if (typeof leafletMap === 'undefined' || !leafletMap || !sb.isLoggedIn()) return;

  mySuggestions
    .filter(s => s.status !== 'approved' && s.lat != null && s.lng != null)
    .forEach(s => {
      const m = L.marker([s.lat, s.lng], { icon: _makePendingMarkerIcon(s) }).addTo(leafletMap);
      m.on('click', () => showMySuggestionDetail(s.id));
      _pendingMarkers.push({ id: s.id, m });
    });
}

// ── DETAIL-SHEET (einzelne Platte) ───────────────────────────────
function showMySuggestionDetail(id) {
  const s = mySuggestions.find(x => x.id === id);
  if (!s) return;

  const status  = _suggestionStatusInfo(s);
  const dateStr = new Date(s.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const typeTag = s.type === 'indoor' ? 'Indoor' : 'Outdoor';
  const plateFb = `images/placeholders/plate_${s.type === 'indoor' ? 'indoor' : 'outdoor'}.png`;
  const imgSrc  = s.image_url || plateFb;

  let statusMsg  = '';
  let reasonHtml = '';
  if (s.status === 'pending') {
    statusMsg = 'Dein Eintrag wurde übermittelt und wird aktuell von unserem Team geprüft. Nach der Freigabe ist die Platte für alle Nutzer sichtbar.';
  } else if (s.status === 'rejected' && s.rejection_reason) {
    statusMsg  = 'Unser Team hat folgendes Feedback zu deinem Eintrag:';
    reasonHtml = `<div class="msd-reason">${escHtml(s.rejection_reason)}</div>`;
  } else if (s.status === 'rejected') {
    statusMsg = 'Dein Eintrag wurde leider nicht freigegeben. Bei Fragen melde dich gerne bei uns.';
  } else if (s.status === 'approved') {
    statusMsg = 'Dein Eintrag ist freigegeben und für alle Nutzer auf der Karte sichtbar. Danke für deinen Beitrag!';
  }

  const body = document.getElementById('msd-body');
  if (!body) return;
  body.innerHTML = `
    <div class="msd-img-wrap">
      <img src="${escHtml(imgSrc)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${escHtml(plateFb)}'">
    </div>
    <div class="msd-info">
      <div class="msd-name">${escHtml(s.name)}</div>
      ${s.address ? `<div class="msd-addr">${icPlate(12)} ${escHtml(s.address)}</div>` : ''}
      <div class="msd-meta">${typeTag} · Eingereicht am ${dateStr}</div>
    </div>
    <div class="msd-status-card">
      <div class="sug-status-pill ${status.cls} msd-status-pill">${status.label}</div>
      <div class="msd-status-msg">${escHtml(statusMsg)}</div>
      ${reasonHtml}
    </div>`;
  openSheet('my-suggestion-detail-sheet');
}

// ── VOLLSTÄNDIGE ÜBERSICHT (Sheet) ───────────────────────────────
function openMySuggestionsSheet() {
  _renderMySuggestionsSheet();
  openSheet('my-suggestions-sheet');
}

function _renderMySuggestionsSheet() {
  const body = document.getElementById('my-suggestions-body');
  if (!body) return;

  if (!mySuggestions.length) {
    body.innerHTML = '<div class="mss-empty">Du hast noch keine Platten eingetragen.</div>';
    return;
  }

  const groups = [
    { label: 'Wird geprüft',          cls: 'sug-status--pending',  items: mySuggestions.filter(s => s.status === 'pending') },
    { label: 'Änderung erforderlich', cls: 'sug-status--changes',  items: mySuggestions.filter(s => s.status === 'rejected' && s.rejection_reason) },
    { label: 'Freigegeben',           cls: 'sug-status--approved', items: mySuggestions.filter(s => s.status === 'approved') },
    { label: 'Nicht freigegeben',     cls: 'sug-status--rejected', items: mySuggestions.filter(s => s.status === 'rejected' && !s.rejection_reason) },
  ].filter(g => g.items.length);

  const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style="color:var(--text-xdim);flex-shrink:0;" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

  body.innerHTML = groups.map(g => `
    <div class="mss-group">
      <div class="mss-group-header">
        <span class="sug-status-pill ${g.cls}">${g.label}</span>
        <span class="mss-group-count">${g.items.length}</span>
      </div>
      ${g.items.map(s => {
        const dateStr = new Date(s.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `
        <div class="mss-item" onclick="showMySuggestionDetail(${s.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' ')showMySuggestionDetail(${s.id})">
          <div class="mss-item-content">
            <div class="mss-item-name">${escHtml(s.name)}</div>
            ${s.address ? `<div class="mss-item-addr">${escHtml(s.address)}</div>` : ''}
            <div class="mss-item-date">Eingereicht am ${dateStr}</div>
            ${s.rejection_reason ? `<div class="mss-item-reason">${escHtml(s.rejection_reason)}</div>` : ''}
          </div>
          ${chevronSvg}
        </div>`;
      }).join('')}
    </div>`).join('');
}

// ── HOME: OFFENE EINTRÄGE ─────────────────────────────────────────
function renderHomeSuggestionsSection() {
  const container = document.getElementById('home-suggestions-section');
  if (!container) return;

  if (!sb.isLoggedIn()) { container.innerHTML = ''; return; }

  const open = mySuggestions.filter(_isOpenSuggestion);
  if (!open.length) { container.innerHTML = ''; return; }

  const shown = open.slice(0, 2);
  const cardsHtml = shown.map(s => {
    const status = _suggestionStatusInfo(s);
    const ago    = _sugTimeAgo(s.created_at);
    return `
      <div class="home-act-card" onclick="showMySuggestionDetail(${s.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' ')showMySuggestionDetail(${s.id})">
        <div class="home-act-body">
          <div class="home-act-badges">
            <span class="sug-status-pill ${status.cls}">${status.label}</span>
          </div>
          <div class="home-act-title">${escHtml(s.name)}</div>
          <div class="home-act-meta">${ic('clock', 10)} Eingereicht ${ago}</div>
        </div>
        <span class="home-act-chevron home-act-chevron--visible">›</span>
      </div>`;
  }).join('');

  const moreHtml = open.length > 2
    ? `<button type="button" class="home-act-more" onclick="openMySuggestionsSheet()">${ic('map-pinned', 12)} Alle ${open.length} Einträge ansehen</button>`
    : `<button type="button" class="home-act-more" onclick="openMySuggestionsSheet()">${ic('map-pinned', 12)} Alle Einträge ansehen</button>`;

  container.innerHTML = `
    <div class="home-act-section">
      <div class="home-act-head">
        <div class="home-act-headrow">
          <span class="home-act-headtitle">Meine Einträge</span>
          <span class="act-badge act-badge--entries">${open.length}</span>
        </div>
        <div class="home-act-subtitle">Noch nicht freigegebene Platten</div>
      </div>
      <div class="home-act-list">${cardsHtml}</div>
      ${moreHtml}
    </div>`;
}

// ── PROFIL: STATUS-ZUSAMMENFASSUNG ────────────────────────────────
function renderMySuggestionsSection() {
  const el = document.getElementById('profile-my-suggestions');
  if (!el) return;
  if (!sb.isLoggedIn()) { el.innerHTML = ''; return; }

  if (!mySuggestions.length) {
    el.innerHTML = `
      <div class="pms-empty">
        <div class="pms-empty-text">Du hast noch keine Platten eingetragen.</div>
        <button class="pms-suggest-btn" onclick="showPage('map');setTimeout(openSuggestSheet,200)">Jetzt Platte eintragen</button>
      </div>`;
    return;
  }

  const pending  = mySuggestions.filter(s => s.status === 'pending').length;
  const changes  = mySuggestions.filter(s => s.status === 'rejected' && s.rejection_reason).length;
  const approved = mySuggestions.filter(s => s.status === 'approved').length;
  const rejected = mySuggestions.filter(s => s.status === 'rejected' && !s.rejection_reason).length;

  const rows = [
    pending  ? `<div class="pms-row"><span class="sug-status-pill sug-status--pending">Wird geprüft</span><span class="pms-count">${pending}</span></div>`  : '',
    changes  ? `<div class="pms-row"><span class="sug-status-pill sug-status--changes">Änderung erforderlich</span><span class="pms-count">${changes}</span></div>` : '',
    approved ? `<div class="pms-row"><span class="sug-status-pill sug-status--approved">Freigegeben</span><span class="pms-count">${approved}</span></div>` : '',
    rejected ? `<div class="pms-row"><span class="sug-status-pill sug-status--rejected">Nicht freigegeben</span><span class="pms-count">${rejected}</span></div>` : '',
  ].filter(Boolean).join('');

  el.innerHTML = `
    <div class="pms-summary">${rows}</div>
    <button class="pms-all-btn" onclick="openMySuggestionsSheet()">Alle ${mySuggestions.length} Einträge ansehen →</button>`;
}
