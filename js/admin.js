// ╔══════════════════════════════════════════════════════════════╗
// ║           ADMIN — VORSCHLÄGE PRÜFEN                          ║
// ╚══════════════════════════════════════════════════════════════╝

let _adminData = {};  // id → suggestion object

function showAdminPage() {
  showPage('admin');
  loadAdminPage();
}

async function loadAdminPage() {
  const list = document.getElementById('admin-suggestions-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading">Lade Vorschläge…</div>';

  const qb = new QueryBuilder('table_suggestions');
  qb._filters.push('status=eq.pending');
  const { data, error } = await qb.order('created_at').execute();

  if (error) {
    list.innerHTML = '<div class="admin-empty">Fehler beim Laden — RLS-Policy fehlt?</div>';
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
  const date    = new Date(s.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const typeTag = s.type === 'indoor' ? '🏠 Indoor' : '☀️ Outdoor';
  const condLabels = { sehr_gut: 'Sehr gut', gut: 'Gut', ok: 'Ok', schlecht: 'Schlecht' };

  return `
  <div class="admin-card" id="admin-card-${s.id}">
    <div class="admin-card-header">
      <div class="admin-card-name">${escHtml(s.name)}</div>
      <div class="admin-card-date">${date}</div>
    </div>
    ${s.address ? `<div class="admin-card-row">${ic('pin', 13)} ${escHtml(s.address)}</div>` : ''}
    <div class="admin-card-tags">
      <span class="admin-tag">${typeTag}</span>
      ${s.table_count ? `<span class="admin-tag">🏓 ${s.table_count} Tisch${s.table_count > 1 ? 'e' : ''}</span>` : ''}
      ${s.condition ? `<span class="admin-tag">Zustand: ${condLabels[s.condition] || s.condition}</span>` : ''}
    </div>
    <div class="admin-card-coords">${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}</div>
    ${s.description ? `<div class="admin-card-desc">${escHtml(s.description)}</div>` : ''}
    <div class="admin-card-actions">
      <button class="btn btn-secondary btn-sm admin-reject-btn" onclick="adminReject(${s.id})">
        ✕ Ablehnen
      </button>
      <button class="btn btn-sm admin-approve-btn" onclick="adminApprove(${s.id})" style="flex:1;">
        ✓ Übernehmen
      </button>
    </div>
  </div>`;
}

async function adminApprove(id) {
  const s    = _adminData[id];
  const card = document.getElementById(`admin-card-${id}`);
  if (!s || !card) return;

  _setCardLoading(card, true);

  const qbT = new QueryBuilder('tables');
  const { error: insertErr } = await qbT.insert({
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
    console.error('Admin approve insert error:', insertErr);
    showToast('Fehler beim Übernehmen — RLS-Policy prüfen', '❌');
    return;
  }

  const qbS = new QueryBuilder('table_suggestions');
  await qbS.eq('id', id).update({ status: 'approved' });

  card.classList.add('admin-card-done');
  setTimeout(() => {
    card.remove();
    _checkEmpty();
  }, 400);
  showToast('Platte übernommen!', '✅');
  delete _adminData[id];
}

async function adminReject(id) {
  const card = document.getElementById(`admin-card-${id}`);
  if (!card) return;

  _setCardLoading(card, true);

  const qb = new QueryBuilder('table_suggestions');
  const { error } = await qb.eq('id', id).update({ status: 'rejected' });

  if (error) {
    _setCardLoading(card, false);
    showToast('Fehler beim Ablehnen', '❌');
    return;
  }

  card.classList.add('admin-card-done');
  setTimeout(() => {
    card.remove();
    _checkEmpty();
  }, 400);
  showToast('Vorschlag abgelehnt');
  delete _adminData[id];
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
