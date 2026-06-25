// ╔══════════════════════════════════════════════════════════════╗
// ║           MODERATION — VORSCHLÄGE & NUTZERVERWALTUNG         ║
// ╚══════════════════════════════════════════════════════════════╝

let _adminData = {};
let _usersData = {};

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
  list.innerHTML = '<div class="admin-loading">Lade Vorschläge…</div>';

  const qb = new QueryBuilder('table_suggestions');
  qb._filters.push('status=eq.pending');
  qb.select('*,profiles!submitted_by(username)');
  const { data, error } = await qb.order('created_at').execute();

  if (error) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden — RLS-Policy prüfen</div>';
    return;
  }
  if (!data.length) {
    list.innerHTML = '<div class="admin-empty">🎉 Keine offenen Vorschläge</div>';
    return;
  }

  _adminData = {};
  data.forEach(s => { _adminData[s.id] = s; });
  list.innerHTML = data.map(s => _renderSuggestionCard(s)).join('');
}

function _renderSuggestionCard(s) {
  const date     = new Date(s.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const typeTag  = s.type === 'indoor' ? '🏠 Indoor' : '☀️ Outdoor';
  const condMap  = { sehr_gut: 'Sehr gut', gut: 'Gut', ok: 'Ok', schlecht: 'Schlecht' };
  const username = s.profiles?.username || 'Unbekannt';

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

  card.classList.add('admin-card-done');
  setTimeout(() => { card.remove(); _checkEmpty(); }, 400);
  showToast('Platte übernommen!', '✅');
  delete _adminData[id];
}

// --- Nutzerverwaltung (nur Admin) ---

async function _loadUserManagement() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading">Lade Nutzer…</div>';

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
