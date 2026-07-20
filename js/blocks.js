// ╔══════════════════════════════════════════════════════════════╗
// ║           BLOCKIERUNGEN — zentraler Service                  ║
// ╠══════════════════════════════════════════════════════════════╣
// ║  Alle Block-Prüfungen laufen über dieses Modul.              ║
// ║  Nie direkt auf user_blocks zugreifen — immer diese API.     ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Cache ──────────────────────────────────────────────────────────────
// _blockedByMe  : Set<userId>  — IDs die ICH blockiert habe
// _blockingMe   : Set<userId>  — IDs die MICH blockiert haben (via RPC)
// null = noch nicht geladen; Set() = geladen, aber leer
let _blockedByMe  = null;   // eigene Blockierungen (aus user_blocks SELECT)
let _blockCache   = null;   // kombiniertes Set für schnelle Prüfung

// ── Laden ──────────────────────────────────────────────────────────────

async function loadBlockedUsers() {
  if (!sb.isLoggedIn()) { _blockedByMe = new Set(); _blockCache = new Set(); return; }
  try {
    const url = `${SUPABASE_URL}/rest/v1/user_blocks?select=blocked_id&blocker_id=eq.${sb.getUserId()}`;
    const { ok, data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (ok && Array.isArray(data)) {
      _blockedByMe = new Set(data.map(r => r.blocked_id));
    } else {
      _blockedByMe = new Set();
    }
  } catch(e) {
    _blockedByMe = new Set();
  }
  _blockCache = new Set(_blockedByMe);
}

// Cache invalidieren (nach Block/Unblock sofort aufrufen)
async function _refreshBlockCache() {
  _blockedByMe = null;
  _blockCache  = null;
  await loadBlockedUsers();
}

// ── Prüfungen ──────────────────────────────────────────────────────────

// Gibt true wenn MEINE Seite diese Person blockiert hat
function isBlockedByMe(userId) {
  if (!userId || !_blockCache) return false;
  return _blockCache.has(userId);
}

// Gibt true wenn eine Blockierung in irgendeiner Richtung besteht
// (für clientseitige Schnellprüfung — RLS sichert serverseitig ab)
function isInteractionBlocked(userId) {
  return isBlockedByMe(userId);
}

// Gibt true wenn zwei Accounts miteinander interagieren dürfen
function canUsersInteract(userIdA, userIdB) {
  const myId = sb.getUserId();
  if (userIdA === myId) return !isBlockedByMe(userIdB);
  if (userIdB === myId) return !isBlockedByMe(userIdA);
  return true; // Drittparteien nicht lokal prüfbar
}

// Filtert ein Array und entfernt alle Einträge mit blockierten User-IDs.
// idFn(item) muss die User-ID aus dem Item zurückgeben.
function filterBlocked(items, idFn) {
  if (!_blockCache || !_blockCache.size) return items;
  return items.filter(item => !_blockCache.has(idFn(item)));
}

// Gibt alle blockierten IDs als Array zurück (für Listen)
function getBlockedUserIds() {
  return _blockedByMe ? [..._blockedByMe] : [];
}

// ── Blockieren ─────────────────────────────────────────────────────────

async function blockUser(userId, source) {
  if (!sb.isLoggedIn()) { showToast('Bitte melde dich an.', 'info'); return false; }
  const myId = sb.getUserId();
  if (!userId || userId === myId) return false;

  try {
    // 1. Block-Eintrag anlegen
    const { ok } = await fetchWithRefresh(`${SUPABASE_URL}/rest/v1/user_blocks`, {
      method:  'POST',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ blocker_id: myId, blocked_id: userId })
    });
    if (!ok) { showToast('Fehler beim Blockieren.', 'error'); return false; }

    // 2. Cache sofort aktualisieren
    await _refreshBlockCache();

    // 3. Bestehende Spielpartner-Verbindung entfernen
    await _removeConnectionWith(userId);

    // 4. Analytics (keine personenbezogene fremde ID senden)
    if (typeof PTAnalytics !== 'undefined') {
      PTAnalytics.track('user_blocked', { source: source || 'unknown' });
    }

    return true;
  } catch(e) {
    showToast('Fehler beim Blockieren.', 'error');
    return false;
  }
}

async function unblockUser(userId) {
  if (!sb.isLoggedIn()) return false;
  const myId = sb.getUserId();
  try {
    const url = `${SUPABASE_URL}/rest/v1/user_blocks?blocker_id=eq.${myId}&blocked_id=eq.${encodeURIComponent(userId)}`;
    const { ok } = await fetchWithRefresh(url, {
      method:  'DELETE',
      headers: { ...dbHeaders(), 'Prefer': 'return=minimal' }
    });
    if (!ok) { showToast('Fehler beim Aufheben.', 'error'); return false; }

    await _refreshBlockCache();

    if (typeof PTAnalytics !== 'undefined') {
      PTAnalytics.track('user_unblocked', { source: 'settings' });
    }
    return true;
  } catch(e) {
    showToast('Fehler beim Aufheben.', 'error');
    return false;
  }
}

// Hilfsfunktion: Spielpartner-Verbindung mit einer blockierten Person löschen
async function _removeConnectionWith(otherUserId) {
  if (typeof _myConnections === 'undefined' || _myConnections === null) return;
  const myId = sb.getUserId();
  const conn = (_myConnections || []).find(c =>
    (c.requester_id === myId && c.receiver_id === otherUserId) ||
    (c.receiver_id  === myId && c.requester_id === otherUserId)
  );
  if (conn) {
    try {
      await fetchWithRefresh(
        `${SUPABASE_URL}/rest/v1/player_connections?id=eq.${encodeURIComponent(conn.id)}`,
        { method: 'DELETE', headers: { ...dbHeaders(), 'Prefer': 'return=minimal' } }
      );
      if (typeof loadMyConnections === 'function') {
        _myConnections = null;
        await loadMyConnections();
      }
    } catch(e) {
      if (window.PT_DEBUG || location.hostname === 'localhost') console.warn('[blocks] connection removal failed', e);
    }
  }
}

// ── Blockierte Personen laden (für Einstellungsseite) ──────────────────

async function getBlockedList() {
  if (!sb.isLoggedIn()) return [];
  const myId = sb.getUserId();
  try {
    // Blockierte IDs laden
    const url = `${SUPABASE_URL}/rest/v1/user_blocks?select=id,blocked_id,created_at&blocker_id=eq.${myId}&order=created_at.desc`;
    const { ok, data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if (!ok || !Array.isArray(data) || !data.length) return [];

    // Profile in einem Batch laden
    const ids = data.map(r => r.blocked_id).join(',');
    const profUrl = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${ids})`;
    const { data: profs } = await fetchWithRefresh(profUrl, { headers: dbHeaders() });
    const profMap = {};
    if (Array.isArray(profs)) profs.forEach(p => { profMap[p.id] = p; });

    return data.map(r => ({
      blockId:   r.id,
      userId:    r.blocked_id,
      createdAt: r.created_at,
      profile:   profMap[r.blocked_id] || null
    }));
  } catch(e) {
    return [];
  }
}

// ── Block-Dialog ───────────────────────────────────────────────────────

function confirmBlockUser(userId, username, source, afterBlock) {
  if (!sb.isLoggedIn()) { openSheet('auth-sheet'); return; }
  showConfirmDialog({
    title:        'Person blockieren?',
    body:         `Ihr könnt euch danach nicht mehr finden, Nachrichten senden oder gegenseitige Spiele und Gesuche sehen. Die Person wird nicht darüber informiert.`,
    confirmLabel: 'Blockieren',
    cancelLabel:  'Abbrechen',
    danger:       true,
    iconVisible:  false,
    onConfirm:    async () => {
      const ok = await blockUser(userId, source);
      if (ok) {
        showToast('Person wurde blockiert.');
        if (typeof afterBlock === 'function') afterBlock();
      }
    }
  });
}

function confirmUnblockUser(userId, blockId, onSuccess) {
  showConfirmDialog({
    title:        'Blockierung aufheben?',
    body:         'Die Person kann dein Profil und deine öffentlichen Inhalte anschließend wieder finden.',
    confirmLabel: 'Blockierung aufheben',
    cancelLabel:  'Abbrechen',
    danger:       false,
    iconVisible:  false,
    onConfirm:    async () => {
      const ok = await unblockUser(userId);
      if (ok) {
        showToast('Blockierung wurde aufgehoben.');
        if (typeof onSuccess === 'function') onSuccess();
      }
    }
  });
}

// ── Einstellungsseite: Blockierte Personen ─────────────────────────────

async function openBlockedUsersSheet() {
  openSheet('blocked-users-sheet');
  await renderBlockedUsersList();
}

async function renderBlockedUsersList() {
  const el = document.getElementById('blocked-users-list');
  if (!el) return;
  el.innerHTML = `<div class="pt-loader pt-loader--sm"><div class="pt-loader-ball"></div><div class="pt-loader-shadow"></div><div class="pt-loader-text">Lade…</div></div>`;

  const list = await getBlockedList();

  if (!list.length) {
    el.innerHTML = `<div class="blocked-empty">
      <div class="blocked-empty-icon">${ic('shield-check', 40)}</div>
      <div class="blocked-empty-title">Keine blockierten Personen</div>
      <div class="blocked-empty-sub">Personen, die du blockierst, erscheinen hier.</div>
    </div>`;
    return;
  }

  el.innerHTML = list.map(entry => {
    const p      = entry.profile;
    const uid    = escAttr(entry.userId);
    const bid    = escAttr(entry.blockId);
    const name   = escHtml(p?.username || 'Gelöschter Account');
    const avatar = p ? getAvatarHtml(p, { size: 44 }) : initAvatar('?', 44);
    return `<div class="blocked-row" data-user-id="${uid}">
      <div class="blocked-av">${avatar}</div>
      <div class="blocked-name">${name}</div>
      <button class="btn btn-secondary btn-sm blocked-unblock-btn"
        onclick="confirmUnblockUser('${uid}','${bid}',() => renderBlockedUsersList())"
        aria-label="Blockierung von ${name} aufheben">
        Aufheben
      </button>
    </div>`;
  }).join('');
}
