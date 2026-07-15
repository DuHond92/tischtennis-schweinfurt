// ╔══════════════════════════════════════════════════════════════╗
// ║           MITSPIELER-GESUCH DETAIL + CHAT                   ║
// ╚══════════════════════════════════════════════════════════════╝
let currentPsEventId = null;
let psChatPollTimer  = null;

function showPlayerSearchDetail(psId) {
  const allSrc = allPlayerSearches.length ? allPlayerSearches : FALLBACK_PLAYER_SEARCHES;
  const ps = allSrc.find(p => p.id === psId);
  if(!ps) return;
  currentPsEventId = psId;

  const pClick = ps.userId
    ? `event.stopPropagation();showPlayerProfile('${escAttr(ps.userId)}','${escAttr(ps.username||'')}','${escAttr(ps.avatarEmoji||'')}',null,'${escAttr(ps.avatarUrl||'')}')`
    : '';

  // Avatar
  const avHtml = `<div class="${pClick?'pp-clickable':''}" style="flex-shrink:0;cursor:${pClick?'pointer':'default'};" ${pClick?`onclick="${pClick}"`:''}>${getAvatarHtml({ avatar_url: ps.avatarUrl || null, avatar_emoji: ps.avatarEmoji, username: ps.username }, { size: 52, extraStyle: 'border:2px solid var(--border);' })}</div>`;

  // Zeitpunkt + Entfernung/Radius (neue Hierarchie)
  const wann   = ps.wann    && ps.wann    !== 'Egal' ? ps.wann    : null;
  const distParts = [];
  if (ps.umkreis && ps.umkreis !== 'Egal') distParts.push(`sucht im Umkreis ${escHtml(ps.umkreis)}`);

  document.getElementById('psd-hero').innerHTML = `
    <div class="psd-hero-inner">
      ${avHtml}
      <div class="psd-hero-body">
        <div class="psc-type-row">
          <span class="fc-type-badge fc-type-badge--gesuch">MITSPIELER</span>
          ${gameTypePill(ps.spielart)}
        </div>
        <div class="psd-hero-name ${pClick ? 'pp-clickable' : ''}" ${pClick ? `onclick="${pClick}"` : ''}>${escHtml(ps.username || 'Spieler')}</div>
        ${wann        ? `<div class="psd-hero-meta">${ic('clock',13)} ${escHtml(wann)}</div>`          : ''}
        ${distParts.length ? `<div class="psd-hero-meta">${ic('pin',13)} ${distParts.join(' · ')}</div>` : ''}
      </div>
    </div>
`;

  // Beschreibung (message)
  const psdDescSection = document.getElementById('psd-desc-section');
  const psdDescEl = document.getElementById('psd-desc');
  if(ps.message && ps.message.trim() && psdDescSection && psdDescEl) {
    psdDescEl.innerHTML = _descHtml(ps.message);
    psdDescSection.style.display = '';
  } else if(psdDescSection) {
    psdDescSection.style.display = 'none';
  }

  // Mod-Delete-Button
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  const modDelEl = document.getElementById('psd-mod-actions');
  if (modDelEl) modDelEl.innerHTML = isMod
    ? `<div class="sheet-action-bar"><button class="btn btn-error btn-full btn-sm" onclick="deletePlayerSearch(${psId})"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Gesuch löschen</button></div>`
    : '';

  // Chat state
  const isReal = allPlayerSearches.some(p => p.id === psId);
  const inputRow = document.getElementById('psd-chat-input-row');
  document.getElementById('psd-chat-feed').innerHTML = '<div class="chat-empty">Lade Kommentare…</div>';

  openSheet('ps-detail-sheet');
  const psdShareBtn = document.getElementById('psd-share-btn');
  if (psdShareBtn) psdShareBtn.onclick = () => sharePlayerSearch(ps);
  markEventSeen(psId);

  if(isReal) {
    loadPsChat(psId);
    startPsChatPolling(psId);
    inputRow.style.display = '';
  } else {
    document.getElementById('psd-chat-feed').innerHTML = '<div class="chat-empty">Kommentare nur für echte Gesuche verfügbar.</div>';
    inputRow.style.display = 'none';
  }
}

async function loadPsChat(eventId) {
  const el = document.getElementById('psd-chat-feed');
  if(!el) return;
  try {
    const qb = new QueryBuilder('event_messages');
    qb._select = 'id,message,created_at,user_id,profiles(username,avatar_emoji,avatar_url)';
    qb.eq('event_id', eventId).order('created_at');
    const {data, error} = await qb.execute();
    if(error) { el.innerHTML = '<div class="chat-empty">Kommentare nicht verfügbar.</div>'; return; }
    _renderPsChatMessages(data || []);
  } catch(e) {
    el.innerHTML = '<div class="chat-empty">Kommentare nicht verfügbar.</div>';
  }
}

function _renderPsChatMessages(messages) {
  const el = document.getElementById('psd-chat-feed');
  if (!el) return;
  if (!messages.length) {
    el.innerHTML = '<div class="chat-empty">Noch keine Kommentare – schreib als Erster!</div>';
    return;
  }
  const myId  = sb.getUserId();
  const isMod = currentUser && ['moderator', 'admin'].includes(currentUser.role);
  el.innerHTML = messages.map(m => {
    const isOwn   = m.user_id === myId;
    const name    = m.profiles?.username || 'Anonym';
    const _d      = new Date(m.created_at);
    const date    = _d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    const time    = _d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const av      = getAvatarHtml(m.profiles, { size: 34 });
    const preview = escAttr((m.message || '').slice(0, 80));
    const showDot = sb.isLoggedIn() && (isMod || !isOwn);
    const dotBtn  = showDot
      ? `<button class="comment-dot-btn" aria-label="Kommentaroptionen"
           data-cid="${escAttr(m.id)}"
           data-content-type="event_message"
           data-ctx="ps"
           data-own="${isOwn ? '1' : ''}"
           data-preview="${preview}"
           onclick="openCommentDotMenu(this)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>`
      : '';
    return `<div class="comment-item">
      <div class="comment-av">${av}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${escHtml(name)}</span>
          <span class="comment-date">· ${date} · ${time}</span>
          ${dotBtn}
        </div>
        <div class="comment-text">${escHtml(m.message)}</div>
      </div>
    </div>`;
  }).join('');
}

async function sendPsChatMessage() {
  if(!sb.isLoggedIn()) { showAuthPrompt(); return; }
  const input = document.getElementById('psd-chat-input');
  const msg   = input.value.trim();
  if(!msg || !currentPsEventId) return;
  input.value = '';
  const qb = new QueryBuilder('event_messages');
  const {error} = await qb.insert({
    event_id: currentPsEventId,
    user_id:  sb.getUserId(),
    message:  msg
  });
  if(error) { showToast('Fehler beim Senden','error'); input.value = msg; return; }
  await loadPsChat(currentPsEventId);
  markEventSeen(currentPsEventId);
}

function startPsChatPolling(eventId) {
  stopPsChatPolling();
  psChatPollTimer = setInterval(() => {
    if(currentPsEventId === eventId) loadPsChat(eventId);
  }, 4000);
}
function stopPsChatPolling() {
  if(psChatPollTimer) { clearInterval(psChatPollTimer); psChatPollTimer = null; }
}

// ── SHARE ─────────────────────────────────────────────────────────
function buildPsShareUrl(ps) {
  const url = new URL(_getShareBase());
  url.searchParams.set('search', ps.id);
  return url.toString();
}

async function sharePlayerSearch(ps) {
  const name = ps.username ? `${ps.username} sucht Mitspieler` : 'Mitspieler gesucht';
  const url  = buildPsShareUrl(ps);
  if (navigator.share) {
    try {
      await navigator.share({
        title: name,
        text:  `${name} – auf PlattenTreff`,
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
