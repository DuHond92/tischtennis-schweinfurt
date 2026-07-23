// ╔══════════════════════════════════════════════════════════════╗
// ║           MODERATION — VORSCHLÄGE & NUTZERVERWALTUNG         ║
// ╚══════════════════════════════════════════════════════════════╝

let _adminData = {};
let _usersData = {};
let _adminCounts = { suggestions: -1, images: -1, reports: -1 };

const _NOTIFY_LABELS = {
  suggestions: { one: 'neuer Vorschlag',  many: 'neue Vorschläge' },
  images:      { one: 'neues Bild',       many: 'neue Bilder'     },
  reports:     { one: 'neue Meldung',     many: 'neue Meldungen'  },
};

function _updateAdminBadge(key, count) {
  const el = document.getElementById(`admin-badge-${key}`);
  if (el) {
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
  if (key !== 'nav') {
    const counts = { ..._adminCounts, [key]: count };
    const total = Object.values(counts).reduce((s, c) => s + Math.max(0, c), 0);
    _updateAdminBadge('nav', total);
  }
}

function _notifyIfNew(key, count) {
  const prev = _adminCounts[key];
  if (prev >= 0 && count > prev) {
    const diff = count - prev;
    const l = _NOTIFY_LABELS[key];
    showToast(l ? `${diff} ${diff === 1 ? l.one : l.many}` : `${diff} neue Einträge`);
  }
  _adminCounts[key] = count;
}

async function _pollAdminCounts() {
  if (!currentUser || !['moderator', 'admin'].includes(currentUser.role)) return;
  try {
    const { data } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/table_suggestions?select=id&status=eq.pending`,
      { headers: dbHeaders() }
    );
    const c = Array.isArray(data) ? data.length : 0;
    _notifyIfNew('suggestions', c);
    _updateAdminBadge('suggestions', c);
  } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] suggestions count:', e); }
  try {
    const { data } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/table_images?select=id&status=eq.pending`,
      { headers: dbHeaders() }
    );
    const c = Array.isArray(data) ? data.length : 0;
    _notifyIfNew('images', c);
    _updateAdminBadge('images', c);
  } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] images count:', e); }
  try {
    const { data } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/reports?select=id&status=eq.pending`,
      { headers: dbHeaders() }
    );
    const c = Array.isArray(data) ? data.length : 0;
    _notifyIfNew('reports', c);
    _updateAdminBadge('reports', c);
  } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] reports count:', e); }
}

function showAdminPage() {
  if (!currentUser || !['moderator', 'admin'].includes(currentUser.role)) {
    showToast('Kein Zugriff', 'error');
    return;
  }
  showPage('admin');
  loadAdminPage();
}

async function loadAdminPage() {
  _loadSuggestions();
  _loadImageModerations();
  _loadReports();
  _loadModLog();
  const isAdmin = currentUser?.role === 'admin';
  const userSection = document.getElementById('admin-user-section');
  if (userSection) {
    userSection.style.display = isAdmin ? '' : 'none';
    if (isAdmin) _loadUserManagement();
  }
  const candidatesSection = document.getElementById('admin-candidates-section');
  if (candidatesSection) {
    candidatesSection.style.display = isAdmin ? '' : 'none';
    if (isAdmin) _loadCandidates();
  }
}

// --- Vorschläge ---

async function _loadSuggestions() {
  const list = document.getElementById('admin-suggestions-list');
  if (!list) return;
  list.innerHTML = skeletonList('admin', 4);

  const qb = new QueryBuilder('table_suggestions');
  qb._filters.push('status=eq.pending');
  const { data, error } = await qb.order('created_at').execute();

  if (error) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden — RLS-Policy prüfen</div>';
    return;
  }
  if (!data.length) {
    _notifyIfNew('suggestions', 0); _updateAdminBadge('suggestions', 0);
    list.innerHTML = '<div class="admin-empty">Keine offenen Vorschläge</div>';
    return;
  }

  // Nutzernamen für alle submitted_by IDs in einer Query laden
  const userIds = [...new Set(data.map(s => s.submitted_by).filter(Boolean))];
  const usernameMap = {};
  if (userIds.length) {
    const qbP = new QueryBuilder('profiles');
    qbP.select('id,username');
    qbP._filters.push(`id=in.(${userIds.join(',')})`);
    const { data: profiles } = await qbP.execute();
    if (profiles) profiles.forEach(p => { usernameMap[p.id] = p.username; });
  }

  _adminData = {};
  data.forEach(s => { _adminData[s.id] = s; });
  _notifyIfNew('suggestions', data.length); _updateAdminBadge('suggestions', data.length);
  list.innerHTML = data.map(s => _renderSuggestionCard(s, usernameMap[s.submitted_by])).join('');
}

function _renderSuggestionCard(s, username) {
  const date     = new Date(s.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const typeTag  = s.type === 'indoor' ? 'Indoor' : 'Outdoor';
  const condMap  = { sehr_gut: 'Sehr gut', gut: 'Gut', ok: 'Ok', schlecht: 'Schlecht' };
  username = username || 'Unbekannt';

  return `
  <div class="admin-card" id="admin-card-${s.id}">
    <div class="admin-card-header">
      <div class="admin-card-name">${escHtml(s.name)}</div>
      <div class="admin-card-date">${date}</div>
    </div>
    ${s.address ? `<div class="admin-card-row">${ic('pin',13)} ${escHtml(s.address)}</div>` : ''}
    <div class="admin-card-coords">${ic('pin',12)} ${Number(s.lat).toFixed(6)}, ${Number(s.lng).toFixed(6)}</div>
    <div class="admin-card-tags">
      <span class="admin-tag">${typeTag}</span>
      ${s.table_count ? `<span class="admin-tag">${s.table_count} Tisch${s.table_count > 1 ? 'e' : ''}</span>` : ''}
      ${s.condition ? `<span class="admin-tag">Zustand: ${condMap[s.condition] || s.condition}</span>` : ''}
    </div>
    ${s.image_url ? `<div class="admin-card-img"><img src="${escHtml(s.image_url)}" alt="Foto" loading="lazy"></div>` : ''}
    ${s.description ? `<div class="admin-card-desc">${escHtml(s.description)}</div>` : ''}
    <div class="admin-card-meta">Eingereicht von <strong>${escHtml(username)}</strong></div>
    <div class="admin-card-actions" id="admin-actions-${s.id}">
      <button class="btn btn-secondary btn-sm admin-reject-btn" onclick="adminReject(${s.id})">Ablehnen</button>
      <button class="btn btn-sm admin-approve-btn" onclick="adminApprove(${s.id})" style="flex:1;">Übernehmen</button>
    </div>
    <div class="admin-reject-reason-box" id="reject-box-${s.id}" style="display:none;">
      <textarea id="reject-reason-${s.id}" class="admin-reject-textarea" placeholder="Ablehnungsgrund (optional)" maxlength="200" rows="2"></textarea>
      <div class="admin-card-actions" style="margin-top:8px;">
        <button class="btn btn-secondary btn-sm" onclick="adminCancelReject(${s.id})">Abbrechen</button>
        <button class="btn btn-sm admin-reject-btn" onclick="adminRejectConfirm(${s.id})" style="flex:1;">Ablehnung bestätigen</button>
      </div>
    </div>
  </div>`;
}

function adminReject(id) {
  const box     = document.getElementById(`reject-box-${id}`);
  const actions = document.getElementById(`admin-actions-${id}`);
  if (!box) return;
  actions.style.display = 'none';
  box.style.display = 'block';
  box.querySelector('textarea').focus();
}

function adminCancelReject(id) {
  const box     = document.getElementById(`reject-box-${id}`);
  const actions = document.getElementById(`admin-actions-${id}`);
  if (!box) return;
  box.style.display = 'none';
  actions.style.display = 'flex';
}

async function adminRejectConfirm(id) {
  const card   = document.getElementById(`admin-card-${id}`);
  const reason = document.getElementById(`reject-reason-${id}`)?.value.trim() || null;
  if (!card) return;

  _setCardLoading(card, true);

  const payload = {
    status:      'rejected',
    reviewed_by: sb.getUserId(),
    reviewed_at: new Date().toISOString()
  };
  if (reason) payload.rejection_reason = reason;

  const qb = new QueryBuilder('table_suggestions');
  const { error } = await qb.eq('id', id).update(payload);

  if (error) {
    _setCardLoading(card, false);
    showToast('Fehler beim Ablehnen', 'error');
    return;
  }

  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkEmpty(); }, 400);
  showToast('Vorschlag abgelehnt');
  delete _adminData[id];
}

async function adminApprove(id) {
  const s    = _adminData[id];
  const card = document.getElementById(`admin-card-${id}`);
  if (!s || !card) return;

  _setCardLoading(card, true);

  const { error: insertErr } = await (new QueryBuilder('tables')).insert({
    name:        s.name,
    address:     s.address || '',
    lat:         s.lat,
    lng:         s.lng,
    type:        s.type || 'outdoor',
    
    description: s.description || ''
  });

  if (insertErr) {
    _setCardLoading(card, false);
    console.error('Approve insert error:', insertErr);
    showToast('Fehler beim Übernehmen — RLS prüfen', 'error');
    return;
  }

  const qbS = new QueryBuilder('table_suggestions');
  await qbS.eq('id', id).update({
    status:      'approved',
    reviewed_by: sb.getUserId(),
    reviewed_at: new Date().toISOString()
  });

  // Notification an den Einreicher
  if (s.submitted_by) {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/notifications`, {
      method:  'POST',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_id: s.submitted_by,
        type:    'suggestion_approved',
        title:   'Platte freigegeben!',
        body:    `"${s.name}" ist jetzt auf der Karte sichtbar.`,
        data:    { suggestion_id: id, name: s.name }
      })
    }).catch(() => {});
  }

  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkEmpty(); }, 400);
  showToast('Platte übernommen!');
  delete _adminData[id];
}

// --- Bilder-Moderation ---

let _imageData = {};

async function _loadImageModerations() {
  const section = document.getElementById('admin-images-section');
  const list    = document.getElementById('admin-images-list');
  if (!section || !list) return;
  section.style.display = '';
  list.innerHTML = skeletonList('admin', 4);

  // Pending-Bilder + zugehörige Platten-Namen laden
  let images = [];
  try {
    const qb = new QueryBuilder('table_images');
    qb._select = 'id,table_id,uploaded_by,image_url,status,created_at';
    qb.eq('status', 'pending').order('created_at');
    const { data, error } = await qb.execute();
    if (error) throw error;
    images = data || [];
  } catch(e) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden der Bilder</div>';
    return;
  }

  if (!images.length) {
    _notifyIfNew('images', 0); _updateAdminBadge('images', 0);
    list.innerHTML = '<div class="admin-empty">Keine Bilder zur Freigabe</div>';
    return;
  }

  // Platten-Namen batch-laden
  const tableIds  = [...new Set(images.map(i => i.table_id).filter(Boolean))];
  const tableMap  = {};
  if (tableIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/tables?select=id,name&id=in.(${tableIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(t => { tableMap[t.id] = t.name; });
    } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] tableNames fetch:', e); }
  }

  // Uploader-Namen batch-laden
  const uploaderIds = [...new Set(images.map(i => i.uploaded_by).filter(Boolean))];
  const uploaderMap = {};
  if (uploaderIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${uploaderIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { uploaderMap[p.id] = p.username; });
    } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] uploaderNames fetch:', e); }
  }

  _imageData = {};
  images.forEach(img => { _imageData[img.id] = img; });
  _notifyIfNew('images', images.length); _updateAdminBadge('images', images.length);
  list.innerHTML = images.map(img =>
    _renderImageCard(img, tableMap[img.table_id] || `Platte #${img.table_id}`, uploaderMap[img.uploaded_by] || 'Unbekannt')
  ).join('');
}

function _renderImageCard(img, tableName, uploaderName) {
  const date = new Date(img.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const imgId = escAttr(img.id);
  return `
  <div class="admin-card admin-img-card" id="admin-img-card-${imgId}">
    <div class="admin-img-preview-wrap">
      <img class="admin-img-preview" src="${escAttr(img.image_url)}"
        onerror="this.src='images/placeholders/tischtennisplatte-outdoor-512x512.webp'" loading="lazy">
    </div>
    <div class="admin-card-header" style="margin-top:8px;">
      <div class="admin-card-name">${ic('pin',12)} ${escHtml(tableName)}</div>
      <div class="admin-card-date">${date}</div>
    </div>
    <div class="admin-card-row">von <strong>${escHtml(uploaderName)}</strong></div>
    <div class="admin-card-actions" id="admin-img-actions-${imgId}">
      <button class="btn btn-secondary btn-sm admin-reject-btn" onclick="rejectTableImage('${imgId}')">Ablehnen</button>
      <button class="btn btn-sm admin-approve-btn" onclick="approveTableImage('${imgId}')" style="flex:1;">Freigeben</button>
    </div>
  </div>`;
}

async function approveTableImage(id) {
  const card = document.getElementById(`admin-img-card-${id}`);
  if (!card) return;
  _setCardLoading(card, true);
  const qb = new QueryBuilder('table_images');
  const { error } = await qb.eq('id', id).update({
    status:      'approved',
    reviewed_by: sb.getUserId(),
    reviewed_at: new Date().toISOString()
  });
  if (error) {
    _setCardLoading(card, false);
    showToast('Fehler beim Freigeben', 'error');
    return;
  }
  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkImagesEmpty(); }, 400);
  showToast('Bild freigegeben');
  delete _imageData[id];
}

async function rejectTableImage(id) {
  const card = document.getElementById(`admin-img-card-${id}`);
  if (!card) return;
  _setCardLoading(card, true);
  const qb = new QueryBuilder('table_images');
  const { error } = await qb.eq('id', id).update({
    status:      'rejected',
    reviewed_by: sb.getUserId(),
    reviewed_at: new Date().toISOString()
  });
  if (error) {
    _setCardLoading(card, false);
    showToast('Fehler beim Ablehnen', 'error');
    return;
  }
  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkImagesEmpty(); }, 400);
  showToast('Bild abgelehnt');
  delete _imageData[id];
}

function _checkImagesEmpty() {
  const list = document.getElementById('admin-images-list');
  if (list && !list.querySelector('.admin-img-card')) {
    list.innerHTML = '<div class="admin-empty">Keine Bilder zur Freigabe</div>';
  }
}

// --- Nutzerverwaltung (nur Admin) ---

async function _loadUserManagement() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = skeletonList('admin', 4);

  const qb = new QueryBuilder('profiles');
  qb.select('id,username,role,created_at').order('created_at');
  const { data, error } = await qb.execute();

  if (error) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden</div>';
    return;
  }

  _usersData = {};
  data.forEach(u => { _usersData[u.id] = u; });

  const others = data.filter(u => u.id !== sb.getUserId());
  if (!others.length) {
    list.innerHTML = '<div class="admin-empty">Keine anderen Nutzer</div>';
    return;
  }
  list.innerHTML = others.map(u => _renderUserCard(u)).join('');
}

function _renderUserCard(u) {
  const roleLabel = { user: 'Spieler', moderator: 'Moderator', admin: 'Admin' };
  const badgeClass = { user: 'admin-role-user', moderator: 'admin-role-mod', admin: 'admin-role-admin' };
  const joined = new Date(u.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });

  return `
  <div class="admin-user-card" id="admin-user-${u.id}">
    <div class="admin-user-info">
      <div class="admin-user-name">${escHtml(u.username || 'Unbekannt')}</div>
      <div class="admin-user-joined">Dabei seit ${joined}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="admin-role-badge ${badgeClass[u.role] || 'admin-role-user'}">${roleLabel[u.role] || u.role}</span>
      ${u.role === 'user'      ? `<button class="btn btn-sm admin-approve-btn" style="padding:5px 10px;font-size:0.73rem;" onclick="setUserRole('${u.id}','moderator')">→ Mod</button>` : ''}
      ${u.role === 'moderator' ? `<button class="btn btn-sm btn-secondary" style="padding:5px 10px;font-size:0.73rem;color:var(--text-dim);" onclick="setUserRole('${u.id}','user')">→ Spieler</button>` : ''}
    </div>
  </div>`;
}

async function setUserRole(uid, newRole) {
  const token = await sb.getValidToken();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_user_role`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ target_uid: uid, new_role: newRole })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    console.error('setUserRole error:', err);
    showToast('Fehler beim Ändern der Rolle', 'error');
    return;
  }

  const label = { user: 'Spieler', moderator: 'Moderator', admin: 'Admin' };
  showToast(`Rolle auf ${label[newRole] || newRole} gesetzt`);
  _loadUserManagement();
}

// --- Helpers ---

function toggleAdminSection(btn) {
  const body = btn.nextElementSibling;
  const icon = btn.querySelector('.admin-toggle-icon');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

function _setCardLoading(card, loading) {
  card.style.opacity = loading ? '0.5' : '1';
  card.querySelectorAll('button').forEach(b => { b.disabled = loading; });
}

function _checkEmpty() {
  const remaining = Object.keys(_adminData).length;
  _notifyIfNew('suggestions', remaining);
  _updateAdminBadge('suggestions', remaining);
  const list = document.getElementById('admin-suggestions-list');
  if (list && !list.querySelector('.admin-card')) {
    list.innerHTML = '<div class="admin-empty">Keine offenen Vorschläge</div>';
  }
}

// ── Mod-Log ───────────────────────────────────────────────────────────

async function _logModAction(action, contentType, contentId, details) {
  try {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/moderation_log`, {
      method:  'POST',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mod_id:       sb.getUserId(),
        action,
        content_type: contentType,
        content_id:   String(contentId),
        details:      details || null
      })
    });
  } catch(e) { /* Logfehler blockiert nie die eigentliche Aktion */ }
}

const _ACTION_LABELS = {
  delete_image:          'Bild gelöscht',
  delete_comment:        'Kommentar gelöscht',
  delete_event_message:  'Event-Nachricht gelöscht',
  delete_dm:             'DM gelöscht',
  delete_event:          'Event gelöscht',
  delete_player_search:  'Mitspieler-Gesuch gelöscht',
};

const _CONTENT_LABELS = {
  table_image: 'Plattenbild', event_message: 'Event-Chat',
  direct_message: 'Direktnachricht', comment: 'Kommentar',
  event: 'Spielrunde', player_search: 'Mitspieler-Gesuch',
};

async function _loadModLog() {
  const section = document.getElementById('admin-modlog-section');
  const list    = document.getElementById('admin-modlog-list');
  if (!section || !list) return;
  section.style.display = '';
  list.innerHTML = skeletonList('admin', 4);

  let entries = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/moderation_log?select=id,action,content_type,content_id,mod_id,created_at&order=created_at.desc&limit=50`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    entries = data || [];
  } catch(e) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden</div>';
    return;
  }

  if (!entries.length) {
    list.innerHTML = '<div class="admin-empty">Noch keine Einträge</div>';
    return;
  }

  const modIds = [...new Set(entries.map(e => e.mod_id).filter(Boolean))];
  const modMap = {};
  if (modIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${modIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { modMap[p.id] = p.username; });
    } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] modNames fetch:', e); }
  }

  list.innerHTML = entries.map(e => {
    const time = new Date(e.created_at).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const mod  = modMap[e.mod_id] || 'Unbekannt';
    const action = _ACTION_LABELS[e.action] || e.action;
    return `<div class="admin-modlog-row">
      <div class="admin-modlog-action">${action}</div>
      <div class="admin-modlog-meta">von <b>${escHtml(mod)}</b> · ${time}</div>
    </div>`;
  }).join('');
}

// ── Gemeldete Inhalte ─────────────────────────────────────────────────

const _REASON_LABELS = {
  spam: 'Spam / Werbung', inappropriate: 'Unangemessener Inhalt',
  wrong_info: 'Falsche Informationen', other: 'Sonstiges',
};

async function _loadReports() {
  const section = document.getElementById('admin-reports-section');
  const list    = document.getElementById('admin-reports-list');
  if (!section || !list) return;
  section.style.display = '';
  list.innerHTML = skeletonList('admin', 4);

  let reports = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/reports?select=id,content_type,content_id,reason,preview,status,reporter_id,created_at&status=eq.pending&order=created_at.desc&limit=50`;
    const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    reports = data || [];
  } catch(e) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden</div>';
    return;
  }

  if (!reports.length) {
    _notifyIfNew('reports', 0); _updateAdminBadge('reports', 0);
    list.innerHTML = '<div class="admin-empty">Keine offenen Meldungen</div>';
    return;
  }

  const repIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
  const repMap = {};
  if (repIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${repIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { repMap[p.id] = p.username; });
    } catch(e) { if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[admin] reporterNames fetch:', e); }
  }

  _notifyIfNew('reports', reports.length); _updateAdminBadge('reports', reports.length);
  list.innerHTML = reports.map(r => {
    const date      = new Date(r.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    const reporter  = repMap[r.reporter_id] || 'Anonym';
    const typeLabel = _CONTENT_LABELS[r.content_type] || r.content_type;
    const reason    = _REASON_LABELS[r.reason] || r.reason;
    const rid       = escAttr(r.id);
    const canNav    = ['comment','event_message'].includes(r.content_type);
    return `<div class="admin-card admin-report-card" id="admin-report-${rid}"
        data-content-type="${escAttr(r.content_type)}"
        data-content-id="${escAttr(r.content_id)}">
      <div class="admin-card-header">
        <div class="admin-card-name">${escHtml(typeLabel)}</div>
        <div class="admin-card-date">${date}</div>
      </div>
      <div class="admin-card-row">${escHtml(reason)}</div>
      ${r.preview ? `<div class="admin-card-desc">"${escHtml(r.preview)}"</div>` : ''}
      <div class="admin-card-meta">Gemeldet von <strong>${escHtml(reporter)}</strong></div>
      <div class="admin-report-actions" id="admin-report-actions-${rid}">
        ${canNav ? `<button class="btn btn-secondary btn-sm btn-full" style="margin-bottom:6px;"
          onclick="openReportedTarget(this.closest('.admin-report-card'))">Kontext anzeigen</button>` : ''}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;"
            onclick="resolveReport('${rid}','dismissed')">Ignorieren</button>
          <button class="btn btn-sm admin-report-delete-btn" style="flex:1;"
            onclick="deleteReportedContent('${rid}')">Löschen</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function resolveReport(reportId, status) {
  const card = document.getElementById(`admin-report-${reportId}`);
  if (card) _setCardLoading(card, true);
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}`,
    {
      method:  'PATCH',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewed_by: sb.getUserId(), reviewed_at: new Date().toISOString() })
    }
  );
  if (!ok) { if (card) _setCardLoading(card, false); showToast('Fehler', 'error'); return; }
  if (card) { card.classList.add('admin-card-done'); setTimeout(() => { card.remove(); _checkReportsEmpty(); }, 400); }
  showToast(status === 'dismissed' ? 'Meldung ignoriert' : 'Erledigt');
}

function _checkReportsEmpty() {
  const list = document.getElementById('admin-reports-list');
  if (list && !list.querySelector('.admin-report-card')) {
    list.innerHTML = '<div class="admin-empty">Keine offenen Meldungen</div>';
  }
}

async function openReportedTarget(cardEl) {
  const contentType = cardEl.dataset.contentType;
  const contentId   = cardEl.dataset.contentId;

  if (contentType === 'comment') {
    try {
      const { data } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/comments?select=table_id&id=eq.${encodeURIComponent(contentId)}`,
        { headers: dbHeaders() }
      );
      const tableId = data?.[0]?.table_id;
      if (!tableId) { showToast('Kommentar nicht gefunden', 'warning'); return; }
      closeAllSheets();
      showTableDetail(tableId);
    } catch(e) { showToast('Fehler beim Laden', 'error'); }
    return;
  }

  if (contentType === 'event_message') {
    try {
      const { data } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/event_messages?select=event_id&id=eq.${encodeURIComponent(contentId)}`,
        { headers: dbHeaders() }
      );
      const eventId = data?.[0]?.event_id;
      if (!eventId) { showToast('Nachricht nicht gefunden', 'warning'); return; }
      const ev = typeof allEvents !== 'undefined' && allEvents.find(e => e.id === eventId);
      closeAllSheets();
      if (ev && ev.type === 'player_search') showPlayerSearchDetail(eventId);
      else showEventDetail(eventId);
    } catch(e) { showToast('Fehler beim Laden', 'error'); }
    return;
  }

  showToast('Kein direkter Kontext verfügbar', 'info');
}

function deleteReportedContent(reportId) {
  const actionsEl = document.getElementById(`admin-report-actions-${reportId}`);
  if (!actionsEl) return;
  actionsEl.innerHTML = `
    <div class="admin-delete-confirm">
      <div class="admin-delete-confirm-text">Inhalt wirklich löschen?</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="_loadReports()">Abbrechen</button>
        <button class="btn btn-sm admin-report-delete-btn" style="flex:1;"
          onclick="_confirmDeleteContent('${escAttr(reportId)}')">Löschen</button>
      </div>
    </div>`;
}

function _reportNotifBody(contentType) {
  const suffix = {
    comment:        'Der gemeldete Kommentar wurde entfernt.',
    event_message:  'Die gemeldete Nachricht wurde entfernt.',
    direct_message: 'Die gemeldete Nachricht wurde entfernt.',
    event:          'Das gemeldete Spiel wurde entfernt.',
    player_search:  'Das gemeldete Gesuch wurde entfernt.',
  };
  return 'Danke für deine Meldung. ' + (suffix[contentType] || 'Der gemeldete Inhalt wurde entfernt.');
}

async function _confirmDeleteContent(reportId) {
  const card = document.getElementById(`admin-report-${reportId}`);
  if (!card) return;
  const contentType = card.dataset.contentType;
  const contentId   = card.dataset.contentId;
  _setCardLoading(card, true);

  const tableMap = { comment: 'comments', event_message: 'event_messages', direct_message: 'direct_messages' };
  const logMap   = { comment: 'delete_comment', event_message: 'delete_event_message', direct_message: 'delete_dm' };
  const table    = tableMap[contentType];

  if (!table) {
    _setCardLoading(card, false);
    showToast(`Löschen für "${contentType}" nicht unterstützt`, 'warning');
    return;
  }

  // 1. Inhalt löschen
  const { ok: delOk } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(contentId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!delOk) { _setCardLoading(card, false); showToast('Fehler beim Löschen', 'error'); return; }

  _logModAction(logMap[contentType], contentType, contentId);

  // 2. Alle offenen Reports zu diesem Inhalt laden
  const myId = sb.getUserId();
  let siblingIds = [];
  let reporterIds = [];
  try {
    const { data: siblings } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/reports?content_type=eq.${encodeURIComponent(contentType)}&content_id=eq.${encodeURIComponent(contentId)}&status=eq.pending&select=id,reporter_id`,
      { headers: dbHeaders() }
    );
    siblingIds  = (siblings || []).map(r => r.id);
    reporterIds = [...new Set((siblings || []).map(r => r.reporter_id).filter(id => id && id !== myId))];
  } catch(e) { siblingIds = [reportId]; }

  // 3. Notification an jeden Reporter
  const notifBody = _reportNotifBody(contentType);
  for (const uid of reporterIds) {
    await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        user_id: uid,
        type: 'report_resolved',
        title: 'Meldung geprüft',
        body: notifBody,
        data: { content_type: contentType, content_id: contentId, action: 'deleted' }
      })
    });
  }

  // 4. Alle zugehörigen Reports auf reviewed setzen
  const ids = siblingIds.length ? siblingIds : [reportId];
  await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/reports?id=in.(${ids.map(encodeURIComponent).join(',')})`,
    {
      method:  'PATCH',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'reviewed', reviewed_by: myId, reviewed_at: new Date().toISOString() })
    }
  );

  // 5. Alle Karten für diesen Inhalt aus dem DOM entfernen
  document.querySelectorAll('.admin-report-card').forEach(c => {
    if (c.dataset.contentType === contentType && c.dataset.contentId === contentId) {
      c.classList.add('admin-card-done');
      setTimeout(() => { c.remove(); _checkReportsEmpty(); }, 400);
    }
  });

  showToast(reporterIds.length > 0 ? 'Inhalt gelöscht und Reporter benachrichtigt' : 'Inhalt gelöscht');
}

// ── Events + Mitspieler-Gesuche löschen (Mod) ────────────────────────

async function deleteEvent(eventId) {
  showConfirmDialog({
    title: 'Event löschen?',
    body: 'Das Event und alle zugehörigen Nachrichten werden dauerhaft entfernt.',
    confirmLabel: 'Löschen',
    danger: true,
    onConfirm: async () => {
      const { ok } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}`,
        { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
      );
      if (!ok) { showToast('Fehler beim Löschen', 'error'); return; }
      _logModAction('delete_event', 'event', eventId);
      showToast('Event gelöscht');
      closeAllSheets();
      await loadEvents();
      renderEvents();
      renderHome();
    }
  });
}

async function deletePlayerSearch(psId) {
  showConfirmDialog({
    title: 'Gesuch löschen?',
    body: 'Das Mitspieler-Gesuch und alle zugehörigen Nachrichten werden dauerhaft entfernt.',
    confirmLabel: 'Löschen',
    danger: true,
    onConfirm: async () => {
      const { ok } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(psId)}`,
        { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
      );
      if (!ok) { showToast('Fehler beim Löschen', 'error'); return; }
      _logModAction('delete_player_search', 'player_search', psId);
      showToast('Gesuch gelöscht');
      closeAllSheets();
      await loadEvents();
      renderEvents();
      renderHome();
    }
  });
}

// ── Report-Modal ──────────────────────────────────────────────────────

let _reportData = { contentType: null, contentId: null, reason: null, userId: null };

function openReportFromBtn(btn) {
  openReport(btn.dataset.type, btn.dataset.id, btn.dataset.preview);
}

function openReport(contentType, contentId, preview, userId) {
  if (!sb.isLoggedIn()) { showToast('Bitte melde dich an, um Inhalte zu melden.', 'info'); return; }
  _reportData = { contentType, contentId, reason: null, userId: userId || null };
  const prev = document.getElementById('report-preview');
  if (prev) prev.textContent = preview ? `"${preview}"` : '';
  const noteEl = document.getElementById('report-note');
  if (noteEl) noteEl.value = '';
  const reasons = [
    { key: 'spam',          label: 'Spam / Werbung' },
    { key: 'inappropriate', label: 'Unangemessener Inhalt' },
    { key: 'wrong_info',    label: 'Falsche Informationen' },
    { key: 'other',         label: 'Sonstiges' },
  ];
  const btns = document.getElementById('report-reason-btns');
  if (btns) btns.innerHTML = reasons.map(r =>
    `<button class="report-reason-opt" onclick="selectReportReason('${r.key}',this)">${r.label}</button>`
  ).join('');
  openSheet('report-sheet');
}

function selectReportReason(key, btn) {
  _reportData.reason = key;
  document.querySelectorAll('.report-reason-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function submitReport() {
  if (!_reportData.reason) { showToast('Bitte wähle einen Grund aus.', 'warning'); return; }
  const note    = (document.getElementById('report-note')?.value || '').trim();
  const preview = document.getElementById('report-preview')?.textContent?.replace(/^"|"$/g, '').slice(0, 200) || null;
  const { ok } = await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/reports`, {
    method:  'POST',
    headers: { ...dbHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporter_id:  sb.getUserId(),
      content_type: _reportData.contentType,
      content_id:   String(_reportData.contentId),
      reason:       _reportData.reason,
      preview:      note ? `${preview || ''}\n\nHinweis: ${note}`.trim().slice(0, 500) : preview,
      status:       'pending'
    })
  });
  const reportedUserId = _reportData.userId;
  closeAllSheets();
  if (ok) {
    PTAnalytics.track('report_submitted', { content_type: _reportData.contentType });
    showToast('Danke, wir prüfen den Inhalt.');
    // Offer to block the reported user (with a short delay so the toast is visible first)
    if (reportedUserId && reportedUserId !== sb.getUserId()) {
      setTimeout(() => confirmBlockUser(reportedUserId, '', 'report', null), 400);
    }
  } else showToast('Fehler beim Melden', 'error');
}

function closeReportSheet() {
  closeAllSheets();
}

// ── OSM-Kandidaten Review ──────────────────────────────────────────────────────

const _CAND_LIMIT = 20;
let _candidateOffset = 0;
let _candidateHasMore = false;
let _candidateSearchTimer = null;

function _candidateFilterChanged() {
  _candidateOffset = 0;
  _loadCandidates();
}

function _candidateSearchDebounced() {
  clearTimeout(_candidateSearchTimer);
  _candidateSearchTimer = setTimeout(() => {
    _candidateOffset = 0;
    _loadCandidates();
  }, 350);
}

function _loadMoreCandidates() {
  _candidateOffset += _CAND_LIMIT;
  _loadCandidates(true);
}

async function _loadCandidates(append = false) {
  const list  = document.getElementById('admin-candidates-list');
  const pager = document.getElementById('admin-candidates-pagination');
  if (!list) return;

  const status = document.getElementById('cand-filter-status')?.value ?? 'pending_review';
  const type   = document.getElementById('cand-filter-type')?.value || '';
  const search = document.getElementById('cand-filter-search')?.value.trim() || '';

  if (!append) {
    list.innerHTML = skeletonList('admin', 3);
    if (pager) pager.style.display = 'none';
  }

  // list_candidates_for_review RPC: liefert Enrichment-Spalten und umgeht RLS
  const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/list_candidates_for_review`;
  const rpcBody = JSON.stringify({
    p_status: status || null,
    p_type:   type   || null,
    p_search: search || null,
    p_limit:  _CAND_LIMIT,
    p_offset: _candidateOffset,
  });
  const { data, error } = await fetchWithRefresh(rpcUrl, {
    method: 'POST',
    headers: { ...dbHeaders(), 'Content-Type': 'application/json' },
    body: rpcBody,
  });

  if (error || !data) {
    if (!append) list.innerHTML = '<div class="admin-empty">Fehler beim Laden — RLS-Policy prüfen</div>';
    return;
  }

  _candidateHasMore = data.length === _CAND_LIMIT;

  if (!append) {
    if (!data.length) {
      list.innerHTML = '<div class="admin-empty">Keine Kandidaten gefunden</div>';
      if (pager) pager.style.display = 'none';
      return;
    }
    list.innerHTML = data.map(_renderCandidateCard).join('');
  } else {
    data.forEach(c => { list.insertAdjacentHTML('beforeend', _renderCandidateCard(c)); });
  }

  if (pager) pager.style.display = _candidateHasMore ? '' : 'none';
  data.forEach(c => _loadNearbyCandidateTables(c));
}

function _deriveCandidateName(c) {
  // Enrichment aus DB hat Vorrang vor Tag-Ableitung
  if (c.enriched_display_name) {
    return { name: c.enriched_display_name, source: c.enriched_name_source || 'enriched' };
  }
  const tags = c.raw_tags || {};
  const tr = v => (typeof v === 'string' ? v.trim() : '') || null;
  const n  = tr(tags.name);
  const nd = tr(tags['name:de']);
  const op = tr(tags.operator);
  const st = tr(tags['addr:street']);
  const ci = tr(tags['addr:city']);
  const generic = new Set([
    'tischtennisplatte','tischtennis','tischtennisfeld','tischtennistisch',
    'tt-platte','tt platte','tt-tisch','table tennis','ping pong'
  ]);
  if (n  && !generic.has(n.toLowerCase()))  return { name: n,                         source: 'osm_name' };
  if (nd && !generic.has(nd.toLowerCase())) return { name: nd,                        source: 'osm_name_de' };
  if (op) return { name: `Tischtennis bei ${op}`,                  source: 'osm_operator' };
  if (st) return { name: `Tischtennisplatte an der ${st}`,         source: 'osm_addr_street' };
  if (ci) return { name: `Tischtennisplatte in ${ci}`,             source: 'osm_addr_city' };
  return { name: 'Tischtennisplatte', source: 'fallback' };
}

const _SOURCE_LABELS = {
  osm_name:        'echter Name',
  osm_name_de:     'Name (de)',
  osm_operator:    'Betreiber',
  osm_addr_street: 'Straße (addr-Tag)',
  osm_addr_city:   'Ort',
  osm_park:        'Park',
  osm_playground:  'Spielplatz',
  osm_school:      'Schule',
  osm_kindergarten:'Kindergarten',
  osm_sports:      'Sportanlage',
  osm_pool:        'Schwimmbad',
  osm_camping:     'Camping',
  osm_recreation:  'Erholungsfläche',
  osm_square:      'Platz',
  osm_street:      'Straße (Nearest)',
  osm_suburb:      'Stadtteil',
  enriched:        'räumlicher Kontext',
  fallback:        null,
};

const _METHOD_LABELS = {
  contains:       'enthält',
  nearest:        'Nähe',
  street:         'Straße',
  administrative: 'Stadtteil',
};

const _CAND_STATUS_BADGE = {
  pending_review:     '<span class="admin-tag">Offen</span>',
  approved:           '<span class="admin-tag" style="background:rgba(34,197,94,.13);color:#16a34a;">Freigegeben</span>',
  rejected:           '<span class="admin-tag" style="background:rgba(239,68,68,.13);color:#dc2626;">Abgelehnt</span>',
  possible_duplicate: '<span class="admin-tag" style="background:rgba(234,179,8,.13);color:#ca8a04;">Duplikat</span>',
};

function _renderCandidateCard(c) {
  const osmUrl    = `https://www.openstreetmap.org/${c.external_id}`;
  const tags      = c.raw_tags || {};
  const capacity  = tags.capacity ? `${tags.capacity} Tisch${Number(tags.capacity) === 1 ? '' : 'e'}` : null;
  const badge     = _CAND_STATUS_BADGE[c.review_status] || '';
  const isPending = c.review_status === 'pending_review';
  const cid       = escAttr(c.id);

  const derived    = _deriveCandidateName(c);
  const osmRawName = (c.name || '').trim();
  const showOsmRaw = osmRawName && osmRawName !== derived.name;

  // Enrichment-Kontext anzeigen (wenn vorhanden)
  const srcLabel  = _SOURCE_LABELS[derived.source];
  const methLabel = c.context_method ? _METHOD_LABELS[c.context_method] : null;
  let enrichBadge = '';
  if (c.enriched_display_name && c.context_type) {
    const distStr = (c.context_distance_m != null && c.context_distance_m > 0)
      ? ` · ${c.context_distance_m} m`
      : (c.context_method === 'contains' ? ' · enthält' : '');
    const conf    = c.context_confidence != null
      ? ` · ${Math.round(c.context_confidence * 100)} %`
      : '';
    enrichBadge = `<div class="cand-enrichment-badge">`
      + `<span class="admin-tag cand-enrich-tag">${escHtml(_SOURCE_LABELS[`osm_${c.context_type}`] || c.context_type)}</span>`
      + `<span class="cand-enrich-meta">${escHtml(methLabel || c.context_method || '')}${distStr}${conf}</span>`
      + (c.context_name ? ` <span class="cand-enrich-ctx">${escHtml(c.context_name)}</span>` : '')
      + `</div>`;
  }

  return `
  <div class="admin-card" id="cand-card-${cid}">
    <div class="admin-card-header">
      <div>
        <div class="admin-card-name">${escHtml(derived.name)}</div>
        ${showOsmRaw ? `<div class="admin-card-name-orig">OSM: ${escHtml(osmRawName)}</div>` : ''}
        ${srcLabel ? `<div class="admin-card-name-orig">Quelle: ${escHtml(srcLabel)}</div>` : ''}
      </div>
      ${badge}
    </div>
    ${enrichBadge}
    ${c.address ? `<div class="admin-card-row">${ic('pin',12)} ${escHtml(c.address)}</div>` : ''}
    <div class="admin-card-coords">${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}</div>
    <div class="admin-card-tags" style="margin:5px 0;">
      <span class="admin-tag">${c.type === 'indoor' ? 'Indoor' : 'Outdoor'}</span>
      ${capacity ? `<span class="admin-tag">${escHtml(capacity)}</span>` : ''}
      ${tags.access ? `<span class="admin-tag">Zugang: ${escHtml(tags.access)}</span>` : ''}
    </div>
    <div style="margin:2px 0 6px;">
      <a href="${osmUrl}" target="_blank" rel="noopener" style="font-size:0.73rem;color:var(--accent);text-decoration:none;">${escHtml(c.external_id)} ↗</a>
    </div>
    <div id="cand-nearby-${cid}"></div>
    ${isPending ? `
    <div class="admin-card-actions" id="cand-actions-${cid}">
      <button class="btn btn-secondary btn-sm" onclick="candidateReject('${cid}')">Ablehnen</button>
      <button class="btn btn-secondary btn-sm" onclick="candidateMarkDuplicate('${cid}')">Duplikat</button>
      <button class="btn btn-sm admin-approve-btn" onclick="candidatePromote('${cid}')" style="flex:1;">Freigeben ✓</button>
    </div>
    <div id="cand-reject-box-${cid}" style="display:none;">
      <textarea id="cand-reject-note-${cid}" class="admin-reject-textarea" placeholder="Ablehnungsgrund (optional)" maxlength="200" rows="2"></textarea>
      <div class="admin-card-actions" style="margin-top:8px;">
        <button class="btn btn-secondary btn-sm" onclick="candidateCancelAction('${cid}')">Abbrechen</button>
        <button class="btn btn-sm admin-reject-btn" onclick="candidateRejectConfirm('${cid}')" style="flex:1;">Ablehnung bestätigen</button>
      </div>
    </div>
    <div id="cand-dup-box-${cid}" style="display:none;">
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">ID der vorhandenen Platte (aus public.tables):</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="number" id="cand-dup-id-${cid}" placeholder="z.B. 18" min="1"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:0.82rem;background:var(--bg-card);color:var(--text);">
        <button class="btn btn-secondary btn-sm" onclick="candidateCancelAction('${cid}')">✕</button>
        <button class="btn btn-sm admin-approve-btn" onclick="candidateMarkDuplicateConfirm('${cid}')">Verbinden</button>
      </div>
    </div>` : ''}
  </div>`;
}

async function _loadNearbyCandidateTables(c) {
  const el = document.getElementById(`cand-nearby-${escAttr(c.id)}`);
  if (!el) return;
  // Vorfilter ±0.005° (~555 m) — dann exakte Haversine-Distanz per calcDistance().
  // calcDistance() ist in map.js global verfügbar (atan2-Variante, Erdradius 6371000 m).
  const bbox = 0.005;
  const url = `${SUPABASE_URL}/rest/v1/tables?select=id,name,lat,lng`
    + `&lat=gte.${c.lat - bbox}&lat=lte.${c.lat + bbox}`
    + `&lng=gte.${c.lng - bbox}&lng=lte.${c.lng + bbox}&limit=15`;
  const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
  if (!data || !data.length) return;

  // Exakte Distanz berechnen und sortieren
  const nearby = data
    .map(t => ({ ...t, dist: calcDistance(+c.lat, +c.lng, +t.lat, +t.lng) }))
    .filter(t => t.dist != null && t.dist <= 500)
    .sort((a, b) => a.dist - b.dist);
  if (!nearby.length) return;

  const blocking = nearby.filter(t => t.dist <= 100);
  const context  = nearby.filter(t => t.dist > 100).slice(0, 2);

  let html = '';
  if (blocking.length) {
    html += blocking.map(t =>
      `<div class="cand-nearby-entry cand-nearby-blocking">`
      + `⛔ Mögliche Dublette — ${t.dist} m: <strong>${escHtml(t.name)}</strong> (ID ${t.id})`
      + `</div>`
    ).join('');
  }
  if (context.length) {
    html += `<div class="cand-nearby-context">`
      + `Weitere im Umkreis: `
      + context.map(t => `<strong>${escHtml(t.name)}</strong> (${t.dist} m)`).join(', ')
      + `</div>`;
  }
  el.innerHTML = `<div class="cand-nearby-block">${html}</div>`;
}

function candidateCancelAction(cid) {
  const actions    = document.getElementById(`cand-actions-${cid}`);
  const rejectBox  = document.getElementById(`cand-reject-box-${cid}`);
  const dupBox     = document.getElementById(`cand-dup-box-${cid}`);
  if (rejectBox) rejectBox.style.display = 'none';
  if (dupBox)    dupBox.style.display    = 'none';
  if (actions)   actions.style.display   = 'flex';
}

function candidateReject(cid) {
  const actions   = document.getElementById(`cand-actions-${cid}`);
  const rejectBox = document.getElementById(`cand-reject-box-${cid}`);
  if (!rejectBox) return;
  if (actions) actions.style.display = 'none';
  rejectBox.style.display = 'block';
  rejectBox.querySelector('textarea')?.focus();
}

async function candidateRejectConfirm(cid) {
  const card = document.getElementById(`cand-card-${cid}`);
  const note = document.getElementById(`cand-reject-note-${cid}`)?.value.trim() || null;
  if (!card) return;
  _setCardLoading(card, true);

  const token = await sb.getValidToken();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reject_table_candidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ p_candidate_id: cid, p_note: note })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    _setCardLoading(card, false);
    showToast(err?.message || 'Fehler beim Ablehnen', 'error');
    return;
  }
  card.classList.add('admin-card-done');
  setTimeout(() => card.remove(), 400);
  showToast('Kandidat abgelehnt');
}

function candidateMarkDuplicate(cid) {
  const actions = document.getElementById(`cand-actions-${cid}`);
  const dupBox  = document.getElementById(`cand-dup-box-${cid}`);
  if (!dupBox) return;
  if (actions) actions.style.display = 'none';
  dupBox.style.display = 'block';
  document.getElementById(`cand-dup-id-${cid}`)?.focus();
}

async function candidateMarkDuplicateConfirm(cid) {
  const existingId = parseInt(document.getElementById(`cand-dup-id-${cid}`)?.value || '', 10);
  if (!existingId || existingId <= 0) { showToast('Ungültige Tabellen-ID', 'warning'); return; }

  showConfirmDialog({
    title: 'Als Duplikat markieren?',
    body: `Kandidat wird mit public.tables ID ${existingId} verknüpft und als Duplikat markiert.`,
    confirmLabel: 'Verbinden',
    onConfirm: async () => {
      const card = document.getElementById(`cand-card-${cid}`);
      if (card) _setCardLoading(card, true);

      const token = await sb.getValidToken();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_candidate_duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ p_candidate_id: cid, p_existing_table_id: existingId })
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (card) _setCardLoading(card, false);
        showToast(err?.message || 'Fehler', 'error');
        return;
      }
      if (card) { card.classList.add('admin-card-done'); setTimeout(() => card.remove(), 400); }
      showToast('Als Duplikat markiert');
    }
  });
}

// ── Batch-Review ──────────────────────────────────────────────────────────────

const _BATCH_SIZE = 25;
let _batchDryRunResults = null;
let _batchCandidateIds  = null;

async function _batchPreview() {
  const btn   = document.getElementById('cand-batch-btn');
  const panel = document.getElementById('admin-batch-result');
  if (!panel) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Wird geprüft…'; }
  panel.style.display = 'none';

  // Kandidaten-IDs laden (pending_review, aktuelle Typ- und Suchfilter, max. 25)
  const type   = document.getElementById('cand-filter-type')?.value   || '';
  const search = document.getElementById('cand-filter-search')?.value.trim() || '';
  let url = `${SUPABASE_URL}/rest/v1/table_candidates?select=id&review_status=eq.pending_review`;
  if (type)   url += `&type=eq.${encodeURIComponent(type)}`;
  if (search) { const q = encodeURIComponent(search); url += `&or=(name.ilike.*${q}*,external_id.ilike.*${q}*)`; }
  url += `&order=imported_at.asc&limit=${_BATCH_SIZE}`;

  const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
  if (!data || !data.length) {
    if (btn) { btn.disabled = false; btn.textContent = 'Batch-Vorschau'; }
    showToast('Keine offenen Kandidaten in aktueller Auswahl', 'warning');
    return;
  }
  _batchCandidateIds = data.map(c => c.id);

  // Dry-Run
  let r;
  try {
    const token = await sb.getValidToken();
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/batch_promote_candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ p_candidate_ids: _batchCandidateIds, p_dry_run: true })
    });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Batch-Vorschau'; }
    showToast('Netzwerkfehler beim Dry-Run', 'error');
    return;
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    if (btn) { btn.disabled = false; btn.textContent = 'Batch-Vorschau'; }
    showToast(err?.message || 'Fehler beim Dry-Run', 'error');
    return;
  }

  _batchDryRunResults = await r.json().catch(() => []);
  if (btn) { btn.disabled = false; btn.textContent = 'Batch-Vorschau'; }

  _renderBatchResults(_batchDryRunResults, true);
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _renderBatchResults(results, isDryRun) {
  const body       = document.getElementById('admin-batch-result-body');
  const actionBar  = document.getElementById('admin-batch-action-bar');
  const doneBar    = document.getElementById('admin-batch-done-bar');
  const confirmBtn = document.getElementById('cand-batch-confirm-btn');
  if (!body) return;

  const wouldPromote = results.filter(r => r.status === 'would_promote' || r.status === 'promoted');
  const skipped      = results.filter(r => r.status === 'skipped');
  const errors       = results.filter(r => r.status === 'error');

  let html = `<div class="batch-header">${isDryRun ? `Dry-Run — ${results.length} Kandidaten geprüft` : `Batch abgeschlossen — ${results.length} verarbeitet`}</div>`;

  if (wouldPromote.length) {
    const label = isDryRun ? `Würde freigegeben (${wouldPromote.length})` : `Freigegeben (${wouldPromote.length})`;
    html += `<div class="batch-section batch-section--promote"><div class="batch-section-label">${label}</div>`;
    html += wouldPromote.map(r => {
      const displayName = r.derived_name || r.name || r.id;
      const showOrig    = r.name && r.name !== r.derived_name;
      const srcLabel    = _SOURCE_LABELS[r.name_source] || null;
      const idSuffix    = r.new_table_id ? ` → ID ${r.new_table_id}` : '';
      // Enrichment-Kontext im Batch-Ergebnis anzeigen
      const ctxLabel    = r.context_type ? (_SOURCE_LABELS[`osm_${r.context_type}`] || r.context_type) : null;
      const ctxMeta     = [
        ctxLabel,
        r.context_method ? (_METHOD_LABELS[r.context_method] || r.context_method) : null,
        r.context_dist != null && r.context_dist > 0 ? `${r.context_dist} m` : null,
      ].filter(Boolean).join(' · ');
      const meta = [
        showOrig ? `OSM: ${r.name}` : null,
        srcLabel && !r.context_type ? srcLabel : null,
        ctxMeta || null,
      ].filter(Boolean).join(' · ');
      return `<div class="batch-item">${escHtml(displayName)}${idSuffix}`
        + (meta ? `<span class="batch-reason">${escHtml(meta)}</span>` : '')
        + `</div>`;
    }).join('');
    html += `</div>`;
  }
  if (skipped.length) {
    html += `<div class="batch-section batch-section--skip"><div class="batch-section-label">Übersprungen (${skipped.length})</div>`;
    html += skipped.map(r =>
      `<div class="batch-item">${escHtml(r.name || r.id)}<span class="batch-reason">${escHtml(r.reason || '')}</span></div>`
    ).join('');
    html += `</div>`;
  }
  if (errors.length) {
    html += `<div class="batch-section batch-section--error"><div class="batch-section-label">Fehler (${errors.length})</div>`;
    html += errors.map(r =>
      `<div class="batch-item">${escHtml(r.name || r.id)}<span class="batch-reason">${escHtml(r.reason || '')}</span></div>`
    ).join('');
    html += `</div>`;
  }
  if (!results.length) {
    html += `<div class="batch-empty">Keine Kandidaten verarbeitet.</div>`;
  }

  body.innerHTML = html;

  if (actionBar && doneBar && confirmBtn) {
    if (isDryRun && wouldPromote.length > 0) {
      confirmBtn.textContent = `${wouldPromote.length} Platte${wouldPromote.length === 1 ? '' : 'n'} jetzt freigeben`;
      actionBar.style.display = 'flex';
      doneBar.style.display   = 'none';
    } else {
      actionBar.style.display = 'none';
      doneBar.style.display   = 'block';
    }
  }
}

function _batchClose() {
  const panel = document.getElementById('admin-batch-result');
  if (panel) panel.style.display = 'none';
  _batchDryRunResults = null;
  _batchCandidateIds  = null;
}

async function _batchExecute() {
  const wouldCount = (_batchDryRunResults || []).filter(r => r.status === 'would_promote').length;
  if (!wouldCount || !_batchCandidateIds?.length) return;

  showConfirmDialog({
    title: `${wouldCount} Platte${wouldCount === 1 ? '' : 'n'} freigeben?`,
    body: `Dieser Vorgang ist nicht rückgängig zu machen. Die Platten werden sofort in der App sichtbar.`,
    confirmLabel: `${wouldCount} Platten freigeben`,
    danger: true,
    onConfirm: async () => {
      const actionBar = document.getElementById('admin-batch-action-bar');
      if (actionBar) actionBar.style.display = 'none';

      let r;
      try {
        const token = await sb.getValidToken();
        r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/batch_promote_candidates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ p_candidate_ids: _batchCandidateIds, p_dry_run: false })
        });
      } catch (e) {
        if (actionBar) actionBar.style.display = 'flex';
        showToast('Netzwerkfehler beim Batch', 'error');
        return;
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (actionBar) actionBar.style.display = 'flex';
        showToast(err?.message || 'Fehler beim Batch', 'error');
        return;
      }

      const finalResults = await r.json().catch(() => []);
      _renderBatchResults(finalResults, false);
      _batchDryRunResults = null;
      _batchCandidateIds  = null;

      const promoted = finalResults.filter(r => r.status === 'promoted');
      if (promoted.length) {
        showToast(`${promoted.length} Platte${promoted.length === 1 ? '' : 'n'} freigegeben ✓`);
        try {
          await loadTables();
          if (typeof _applyMapFilters === 'function') _applyMapFilters();
        } catch (e) {
          showToast('Karte wird beim nächsten Öffnen aktualisiert', 'warning');
        }
        _candidateOffset = 0;
        _loadCandidates();
      }
    }
  });
}

async function candidatePromote(cid) {
  showConfirmDialog({
    title: 'Kandidat freigeben?',
    body: 'Die Platte wird in public.tables übernommen und sofort in der App sichtbar.',
    confirmLabel: 'Freigeben und veröffentlichen',
    onConfirm: async () => {
      const card = document.getElementById(`cand-card-${cid}`);
      if (card) _setCardLoading(card, true);

      let r, err;
      try {
        const token = await sb.getValidToken();
        r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/promote_table_candidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ p_candidate_id: cid })
        });
      } catch (e) {
        if (card) _setCardLoading(card, false);
        showToast('Netzwerkfehler bei der Promotion', 'error');
        return;
      }

      if (!r.ok) {
        err = await r.json().catch(() => ({}));
        if (card) _setCardLoading(card, false);
        showToast(err?.message || err?.hint || 'Fehler bei der Promotion', 'error');
        return;
      }

      const newId = await r.json().catch(() => null);
      if (newId === null) {
        if (card) _setCardLoading(card, false);
        showToast('Promotion ausgeführt, Antwort nicht lesbar', 'warning');
        return;
      }

      // Kandidat sofort aus der Adminliste entfernen (Promotion war erfolgreich)
      if (card) { card.classList.add('admin-card-done'); setTimeout(() => card.remove(), 400); }
      showToast(`Platte #${newId} veröffentlicht ✓`);

      // Karte aktualisieren: loadTables ersetzt das globale tables-Array,
      // _applyMapFilters synct Marker (keine Duplikate: _syncMapMarkers prüft
      // existierende IDs) und aktualisiert die Kartenliste.
      try {
        await loadTables();
        if (typeof _applyMapFilters === 'function') _applyMapFilters();
      } catch (e) {
        showToast('Karte konnte nicht sofort aktualisiert werden — beim nächsten Öffnen sichtbar', 'warning');
      }
    }
  });
}
