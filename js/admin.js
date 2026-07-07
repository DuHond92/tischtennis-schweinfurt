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
    showToast(l ? `${diff} ${diff === 1 ? l.one : l.many}` : `${diff} neue Einträge`, '🔔');
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
  } catch(e) {}
  try {
    const { data } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/table_images?select=id&status=eq.pending`,
      { headers: dbHeaders() }
    );
    const c = Array.isArray(data) ? data.length : 0;
    _notifyIfNew('images', c);
    _updateAdminBadge('images', c);
  } catch(e) {}
  try {
    const { data } = await fetchWithRefresh(
      `${SUPABASE_URL}/rest/v1/reports?select=id&status=eq.pending`,
      { headers: dbHeaders() }
    );
    const c = Array.isArray(data) ? data.length : 0;
    _notifyIfNew('reports', c);
    _updateAdminBadge('reports', c);
  } catch(e) {}
}

function showAdminPage() {
  if (!currentUser || !['moderator', 'admin'].includes(currentUser.role)) {
    showToast('Kein Zugriff', '🔒');
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
  const userSection = document.getElementById('admin-user-section');
  if (userSection) {
    const isAdmin = currentUser?.role === 'admin';
    userSection.style.display = isAdmin ? '' : 'none';
    if (isAdmin) _loadUserManagement();
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
    list.innerHTML = '<div class="admin-empty">🎉 Keine offenen Vorschläge</div>';
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
  const typeTag  = s.type === 'indoor' ? '🏠 Indoor' : '☀️ Outdoor';
  const condMap  = { sehr_gut: 'Sehr gut', gut: 'Gut', ok: 'Ok', schlecht: 'Schlecht' };
  username = username || 'Unbekannt';

  return `
  <div class="admin-card" id="admin-card-${s.id}">
    <div class="admin-card-header">
      <div class="admin-card-name">${escHtml(s.name)}</div>
      <div class="admin-card-date">${date}</div>
    </div>
    ${s.address ? `<div class="admin-card-row">${ic('pin',13)} ${escHtml(s.address)}</div>` : ''}
    <div class="admin-card-coords">📍 ${Number(s.lat).toFixed(6)}, ${Number(s.lng).toFixed(6)}</div>
    <div class="admin-card-tags">
      <span class="admin-tag">${typeTag}</span>
      ${s.table_count ? `<span class="admin-tag">🏓 ${s.table_count} Tisch${s.table_count > 1 ? 'e' : ''}</span>` : ''}
      ${s.condition ? `<span class="admin-tag">Zustand: ${condMap[s.condition] || s.condition}</span>` : ''}
    </div>
    ${s.image_url ? `<div class="admin-card-img"><img src="${escHtml(s.image_url)}" alt="Foto" loading="lazy"></div>` : ''}
    ${s.description ? `<div class="admin-card-desc">${escHtml(s.description)}</div>` : ''}
    <div class="admin-card-meta">Eingereicht von <strong>${escHtml(username)}</strong></div>
    <div class="admin-card-actions" id="admin-actions-${s.id}">
      <button class="btn btn-secondary btn-sm admin-reject-btn" onclick="adminReject(${s.id})">✕ Ablehnen</button>
      <button class="btn btn-sm admin-approve-btn" onclick="adminApprove(${s.id})" style="flex:1;">✓ Übernehmen</button>
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
    showToast('Fehler beim Ablehnen', '❌');
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
    icon:        '🏓',
    description: s.description || ''
  });

  if (insertErr) {
    _setCardLoading(card, false);
    console.error('Approve insert error:', insertErr);
    showToast('Fehler beim Übernehmen — RLS prüfen', '❌');
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
  showToast('Platte übernommen!', '✅');
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
    list.innerHTML = '<div class="admin-empty">🎉 Keine Bilder zur Freigabe</div>';
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
    } catch(e) {}
  }

  // Uploader-Namen batch-laden
  const uploaderIds = [...new Set(images.map(i => i.uploaded_by).filter(Boolean))];
  const uploaderMap = {};
  if (uploaderIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${uploaderIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { uploaderMap[p.id] = p.username; });
    } catch(e) {}
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
        onerror="this.src='images/placeholders/plate_outdoor.png'" loading="lazy">
    </div>
    <div class="admin-card-header" style="margin-top:8px;">
      <div class="admin-card-name">📍 ${escHtml(tableName)}</div>
      <div class="admin-card-date">${date}</div>
    </div>
    <div class="admin-card-row">von <strong>${escHtml(uploaderName)}</strong></div>
    <div class="admin-card-actions" id="admin-img-actions-${imgId}">
      <button class="btn btn-secondary btn-sm admin-reject-btn" onclick="rejectTableImage('${imgId}')">✕ Ablehnen</button>
      <button class="btn btn-sm admin-approve-btn" onclick="approveTableImage('${imgId}')" style="flex:1;">✓ Freigeben</button>
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
    showToast('Fehler beim Freigeben', '❌');
    return;
  }
  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkImagesEmpty(); }, 400);
  showToast('Bild freigegeben ✅');
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
    showToast('Fehler beim Ablehnen', '❌');
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
    list.innerHTML = '<div class="admin-empty">🎉 Keine Bilder zur Freigabe</div>';
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
    showToast('Fehler beim Ändern der Rolle', '❌');
    return;
  }

  const label = { user: 'Spieler', moderator: 'Moderator', admin: 'Admin' };
  showToast(`Rolle auf ${label[newRole] || newRole} gesetzt`, '✅');
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
  const list = document.getElementById('admin-suggestions-list');
  if (list && !list.querySelector('.admin-card')) {
    list.innerHTML = '<div class="admin-empty">🎉 Keine offenen Vorschläge</div>';
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
  delete_image:          '🗑 Bild gelöscht',
  delete_comment:        '🗑 Kommentar gelöscht',
  delete_event_message:  '🗑 Event-Nachricht gelöscht',
  delete_dm:             '🗑 DM gelöscht',
  delete_event:          '🗑 Event gelöscht',
  delete_player_search:  '🗑 Mitspieler-Gesuch gelöscht',
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
    } catch(e) {}
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
    list.innerHTML = '<div class="admin-empty">🎉 Keine offenen Meldungen</div>';
    return;
  }

  const repIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
  const repMap = {};
  if (repIds.length) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username&id=in.(${repIds.join(',')})`;
      const { data } = await fetchWithRefresh(url, { headers: dbHeaders() });
      if (Array.isArray(data)) data.forEach(p => { repMap[p.id] = p.username; });
    } catch(e) {}
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
  if (!ok) { if (card) _setCardLoading(card, false); showToast('Fehler', '❌'); return; }
  if (card) { card.classList.add('admin-card-done'); setTimeout(() => { card.remove(); _checkReportsEmpty(); }, 400); }
  showToast(status === 'dismissed' ? 'Meldung ignoriert' : 'Erledigt');
}

function _checkReportsEmpty() {
  const list = document.getElementById('admin-reports-list');
  if (list && !list.querySelector('.admin-report-card')) {
    list.innerHTML = '<div class="admin-empty">🎉 Keine offenen Meldungen</div>';
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
      if (!tableId) { showToast('Kommentar nicht gefunden', '⚠️'); return; }
      closeAllSheets();
      showTableDetail(tableId);
    } catch(e) { showToast('Fehler beim Laden', '❌'); }
    return;
  }

  if (contentType === 'event_message') {
    try {
      const { data } = await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/event_messages?select=event_id&id=eq.${encodeURIComponent(contentId)}`,
        { headers: dbHeaders() }
      );
      const eventId = data?.[0]?.event_id;
      if (!eventId) { showToast('Nachricht nicht gefunden', '⚠️'); return; }
      const ev = typeof allEvents !== 'undefined' && allEvents.find(e => e.id === eventId);
      closeAllSheets();
      if (ev && ev.type === 'player_search') showPlayerSearchDetail(eventId);
      else showEventDetail(eventId);
    } catch(e) { showToast('Fehler beim Laden', '❌'); }
    return;
  }

  showToast('Kein direkter Kontext verfügbar', 'ℹ️');
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
    showToast(`Löschen für "${contentType}" nicht unterstützt`, '⚠️');
    return;
  }

  // 1. Inhalt löschen
  const { ok: delOk } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(contentId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!delOk) { _setCardLoading(card, false); showToast('Fehler beim Löschen', '❌'); return; }

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
  if (!confirm('Event und alle zugehörigen Nachrichten wirklich löschen?')) return;
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }
  _logModAction('delete_event', 'event', eventId);
  showToast('Event gelöscht');
  closeAllSheets();
  await loadEvents();
  renderEvents();
  renderHome();
}

async function deletePlayerSearch(psId) {
  if (!confirm('Mitspieler-Gesuch und alle zugehörigen Nachrichten wirklich löschen?')) return;
  const { ok } = await fetchWithRefresh(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(psId)}`,
    { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
  );
  if (!ok) { showToast('Fehler beim Löschen', '❌'); return; }
  _logModAction('delete_player_search', 'player_search', psId);
  showToast('Gesuch gelöscht');
  closeAllSheets();
  await loadEvents();
  renderEvents();
  renderHome();
}

// ── Report-Modal ──────────────────────────────────────────────────────

let _reportData = { contentType: null, contentId: null, reason: null };

function openReportFromBtn(btn) {
  openReport(btn.dataset.type, btn.dataset.id, btn.dataset.preview);
}

function openReport(contentType, contentId, preview) {
  if (!sb.isLoggedIn()) { showToast('Bitte melde dich an, um Inhalte zu melden.', '⚠️'); return; }
  _reportData = { contentType, contentId, reason: null };
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
  if (!_reportData.reason) { showToast('Bitte wähle einen Grund aus.', '⚠️'); return; }
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
  closeAllSheets();
  if (ok) {
    PTAnalytics.track('report_submitted', { content_type: _reportData.contentType });
    showToast('Danke, wir prüfen den Inhalt.');
  } else showToast('Fehler beim Melden', '❌');
}

function closeReportSheet() {
  closeAllSheets();
}
