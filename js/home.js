// ╔══════════════════════════════════════════════════════════════╗
// ║           HOME                                               ║
// ╚══════════════════════════════════════════════════════════════╝

// Zentraler Helper: liefert Ortsname oder null (Fallback: "in deiner Nähe")
// Priorität: Profil-Stadt → localStorage-Cache (6 h) → null
function getCurrentLocationLabel() {
  if (typeof currentUser !== 'undefined' && currentUser?.city) return currentUser.city;
  try {
    const c = JSON.parse(localStorage.getItem('tt_hero_city') || 'null');
    if (c?.city && Date.now() - c.ts < 6 * 60 * 60 * 1000) return c.city;
  } catch(_) {}
  return null;
}

function updateHeroLocation() {
  const el = document.getElementById('hero-city');
  if (!el) return;
  const label = getCurrentLocationLabel();
  el.textContent = label ? `in ${label}` : 'in deiner Nähe';
  if (label && typeof currentUser !== 'undefined' && currentUser?.city === label) {
    try { localStorage.setItem('tt_hero_city', JSON.stringify({ city: label, ts: Date.now() })); } catch(_) {}
  }
}

updateHeroLocation();

function initWelcomeCard() {
  const el = document.getElementById('home-welcome-card');
  if (currentUser) {
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
    return;
  }
  if (localStorage.getItem('tt_welcomed')) return;
  if (!el) return;
  el.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-card-title">Willkommen bei PlattenTreff</div>
      <div class="welcome-card-body">Entdecke Tischtennisplatten, finde Mitspieler und starte dein nächstes Spiel.</div>
      <button class="welcome-card-btn" onclick="dismissWelcomeCard()">Verstanden</button>
    </div>`;
  el.style.display = '';
}

function dismissWelcomeCard() {
  localStorage.setItem('tt_welcomed', '1');
  const el = document.getElementById('home-welcome-card');
  if (el) el.style.display = 'none';
}

// ── SHARED SECTION HELPERS ────────────────────────────────────────

function _homeSectionHeaderHtml(title, count, linkAttrs, linkText) {
  const badge = count > 0 ? `<span class="act-badge">${count}</span>` : '';
  return `
    <div class="section-header">
      <div class="section-title">${escHtml(title)}${badge ? ' ' + badge : ''}</div>
      <button type="button" class="section-link" ${linkAttrs}>${linkText}</button>
    </div>`;
}

function _homeSectionSkeleton(title) {
  return `
    <div class="section-header"><div class="section-title">${escHtml(title)}</div></div>
    <div class="home-section-skeleton"><div class="skeleton-card"></div></div>`;
}

// ── „IN DEINER NÄHE"-HEADER (mit globalem Radius-Filter) ─────────

function _nearbyTableCount() {
  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const c   = (typeof _psCenter === 'function') ? _psCenter() : null;
  if (!c) return src.length;
  const r = (typeof _psRadius !== 'undefined') ? _psRadius : 5;
  return src.filter(t => t.lat != null && t.lng != null && calcDistance(c.lat, c.lng, t.lat, t.lng) / 1000 <= r).length;
}

function _nearbyPsCount() {
  if (typeof _psGetFiltered !== 'function') return allPlayerSearches.length;
  return _psGetFiltered(allPlayerSearches).list.length;
}

function _nearbyEventCount() {
  return _eventsForHome().length;
}

function renderHomeNearbyHeader() {
  const el = document.getElementById('home-nearby-header');
  if (!el) return;

  const r   = (typeof _psRadius    !== 'undefined') ? _psRadius    : 5;
  const lbl = (typeof _psChipLabel === 'function')  ? _psChipLabel() : `${r} km Umkreis`;

  let countsHtml   = '';
  let actHintHtml  = '';

  if (window._eventsLoaded) {
    const tCount  = _nearbyTableCount();
    const psCount = _nearbyPsCount();
    const evCount = _nearbyEventCount();
    const parts = [];
    if (tCount  > 0) parts.push(`${tCount} ${tCount  === 1 ? 'Platte'  : 'Platten'}`);
    if (psCount > 0) parts.push(`${psCount} Mitspieler`);
    if (evCount > 0) parts.push(`${evCount} ${evCount === 1 ? 'Spiel'   : 'Spiele'}`);
    if (parts.length) {
      countsHtml = `<div class="home-nearby-counts">${escHtml(parts.join(' · '))}</div>`;
    }

    // Kompakte Aktivitäts-Nachricht — nur der relevanteste Wert, Priorität: Mitspieler → Spiele heute → Neue Platten
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayEvCount = _eventsForHome().filter(e => e.dateStr === todayStr).length;

    const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const c2 = (typeof _psCenter === 'function') ? _psCenter() : null;
    const rKm = (typeof _psRadius !== 'undefined') ? _psRadius : 5;
    let newTabSrc = (tablesLoaded ? tables : []).filter(t => !t.osmId && t.createdAt && t.createdAt.slice(0, 10) >= sevenAgo);
    if (c2) newTabSrc = newTabSrc.filter(t => t.lat != null && t.lng != null && calcDistance(c2.lat, c2.lng, t.lat, t.lng) / 1000 <= rKm);
    const newCount = newTabSrc.length;

    let msg = '', hintIcon = 'users', hintAction = '';
    if (psCount > 0) {
      msg        = psCount === 1 ? 'Ein Spieler sucht gerade Mitspieler.' : `${psCount} Spieler suchen gerade Mitspieler.`;
      hintIcon   = 'users';
      hintAction = `onclick="navStat('searches')"`;
    } else if (todayEvCount > 0) {
      msg        = todayEvCount === 1 ? 'Heute findet ein Spiel in deiner Nähe statt.' : `Heute finden ${todayEvCount} Spiele in deiner Nähe statt.`;
      hintIcon   = 'calendar';
      hintAction = `onclick="navStat('events')"`;
    } else if (newCount > 0) {
      msg        = newCount === 1 ? 'In den letzten 7 Tagen wurde eine neue Platte entdeckt.' : `In den letzten 7 Tagen wurden ${newCount} neue Platten entdeckt.`;
      hintIcon   = 'pin';
      hintAction = `onclick="navStat('map')"`;
    }
    if (msg) {
      actHintHtml = `
        <div class="act-hint" ${hintAction} role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' ')this.click()">
          <span class="act-hint-icon">${ic(hintIcon, 14)}</span>
          <span class="act-hint-msg">${escHtml(msg)}</span>
        </div>`;
    }
  }

  el.innerHTML = `
    <div class="home-nearby-header-inner">
      <div class="home-nearby-titlerow">
        <span class="home-nearby-title">In deiner Nähe</span>
        <button class="home-radius-chip" onclick="openPsRadiusSheet()" aria-label="Suchradius ändern">
          ${ic('navigate', 13)} ${escHtml(lbl)} ▾
        </button>
      </div>
      <div class="home-nearby-subtitle">Gilt für Platten, Mitspieler und Spiele.</div>
      ${countsHtml}
      ${actHintHtml}
    </div>`;
}

// ── KOMMENDE SPIELE ───────────────────────────────────────────────

function _eventsForHome() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const src = allEvents.filter(e =>
    e.type !== 'player_search' && e.dateStr >= todayStr && !isEventCompleted(e)
  ).sort((a, b) => (a.dateStr + (a.time || '')).localeCompare(b.dateStr + (b.time || '')));

  const c = (typeof _psCenter === 'function') ? _psCenter() : null;
  if (!c) return src;

  const radiusKm = (typeof _psRadius !== 'undefined') ? _psRadius : 5;
  const tMap = new Map((tables || []).map(t => [t.id, t]));
  return src.filter(e => {
    const t = tMap.get(e.tid);
    if (!t || t.lat == null || t.lng == null) return true;
    return calcDistance(c.lat, c.lng, t.lat, t.lng) / 1000 <= radiusKm;
  });
}

function renderHomeEventsSection() {
  const el = document.getElementById('home-events-section');
  if (!el) return;

  if (!window._eventsLoaded) {
    el.innerHTML = _homeSectionSkeleton('Kommende Spiele');
    return;
  }

  const events = _eventsForHome();
  const header = _homeSectionHeaderHtml(
    'Kommende Spiele', events.length,
    `onclick="showPage('events')"`, 'Alle anzeigen →'
  );

  if (!events.length) {
    el.innerHTML = `${header}<div class="home-section-empty">Keine Spiele im Umkreis gefunden.</div>`;
    return;
  }

  el.innerHTML = `${header}<div class="home-preview-card-wrap">${renderEventCard(events[0], 0)}</div>`;
}

// ── MITSPIELER GESUCHT ────────────────────────────────────────────

function renderHomePsSection() {
  const el = document.getElementById('home-ps-section');
  if (!el) return;

  if (!window._eventsLoaded) {
    el.innerHTML = _homeSectionSkeleton('Mitspieler gesucht');
    return;
  }

  const { list: filtered } = (typeof _psGetFiltered === 'function')
    ? _psGetFiltered(allPlayerSearches)
    : { list: allPlayerSearches };

  const header = _homeSectionHeaderHtml(
    'Mitspieler gesucht', filtered.length,
    `onclick="activateMitspielerFilter()"`, 'Alle anzeigen →'
  );

  if (!filtered.length) {
    el.innerHTML = `${header}<div class="home-section-empty">Keine Gesuche im Umkreis gefunden.</div>`;
    return;
  }

  const first = filtered[0];
  const cardHtml = typeof renderPlayerSearchCard === 'function'
    ? renderPlayerSearchCard(first)
    : '';

  el.innerHTML = `${header}<div class="home-ps-card-wrap">${cardHtml}</div>`;
}

// ── PLATTEN IN DER NÄHE ───────────────────────────────────────────

// Öffnet die Kartenansicht und fokussiert die gewählte Platte mit Pin-Highlight + Floating Preview.
function openMapAndFocusTable(tableId) {
  showPage('map');
  const _doFocus = () => {
    if (typeof leafletMap !== 'undefined' && leafletMap) {
      if (typeof focusTableOnMap === 'function') focusTableOnMap(tableId);
    } else {
      setTimeout(_doFocus, 80);
    }
  };
  setTimeout(_doFocus, 60);
}

function renderHomeTablesSection() {
  const el = document.getElementById('home-tables-section');
  if (!el) return;

  const src = tablesLoaded ? tables : FALLBACK_TABLES;
  const c   = (typeof _psCenter === 'function') ? _psCenter() : null;
  const radiusKm = (typeof _psRadius !== 'undefined') ? _psRadius : 5;

  let items; // [{t, distM}]
  if (c) {
    items = src
      .filter(t => t.lat != null && t.lng != null)
      .map(t => ({ t, distM: calcDistance(c.lat, c.lng, t.lat, t.lng) }))
      .filter(({ distM }) => distM / 1000 <= radiusKm)
      .sort((a, b) => a.distM - b.distM);
  } else {
    items = src.map(t => ({ t, distM: t.distance != null ? t.distance : null }));
  }

  const header = _homeSectionHeaderHtml(
    'Beliebte Platten', items.length,
    `onclick="showPage('map')"`, 'Zur Karte →'
  );

  if (!items.length) {
    el.innerHTML = `${header}<div class="home-section-empty">Keine Platten im Umkreis gefunden.</div>`;
    return;
  }

  const _today = typeof _localTodayISO === 'function' ? _localTodayISO() : new Date().toISOString().slice(0, 10);
  const cardsHtml = items.map(({ t, distM }, i) => {
    const plateFb    = t.type === 'indoor' ? 'images/placeholders/plate_indoor.webp' : 'images/placeholders/plate_outdoor.webp';
    const loadAttr   = i < 2 ? 'eager' : 'lazy';
    const thumbInner = (t.photos && t.photos.length)
      ? `<img src="${t.photos[0]}" onerror="this.src='${plateFb}'" loading="${loadAttr}" decoding="async">`
      : `<img src="${plateFb}" loading="${loadAttr}" decoding="async" class="thumb-placeholder-img">`;
    const addr     = t.addr || '';
    const metaHtml = typeof _tableCompactMeta === 'function' ? _tableCompactMeta(t) : '';
    const evCount  = (t.events || []).filter(e => (e.dateStr || '') >= _today).length;
    const distTag  = distM != null
      ? `<span class="htt-dist">${ic('pin', 10)}&thinsp;${escHtml(formatDistance(distM))}</span>`
      : '';
    const gamesTag = evCount
      ? `<span class="htt-games map-thumb-games-badge">${ic('calendar', 10)}&thinsp;${evCount}&thinsp;${evCount === 1 ? 'Spiel' : 'Spiele'}</span>`
      : '';
    const tagRow = distTag ? `<div class="home-tag-row">${distTag}</div>` : '';
    return `
      <div class="map-thumb-card" onclick="openMapAndFocusTable(${t.id})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' ')openMapAndFocusTable(${t.id})">
        <div class="map-thumb-img">${thumbInner}${gamesTag}</div>
        <div class="map-thumb-body">
          <div class="map-thumb-name">${escHtml(t.name)}</div>
          ${addr ? `<div class="map-thumb-addr">${escHtml(addr)}</div>` : ''}
          <div class="map-thumb-compact-meta" id="home-meta-${t.id}">${metaHtml}</div>
          ${tagRow}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `${header}<div class="cards-scroll">${cardsHtml}</div>`;

  // Bewertungen asynchron nachladen, Meta-Zeile danach aktualisieren
  if (typeof _loadHomeMeta === 'function') {
    items.forEach(({ t }) => {
      if (t.ratingAvg === undefined) _loadHomeMeta(t.id);
    });
  }
}

// ── DEINE AKTIVITÄTEN ─────────────────────────────────────────────

function getMyActiveEvents() {
  if (!sb.isLoggedIn()) return [];
  const myId     = String(sb.getUserId());
  const todayStr = new Date().toISOString().slice(0, 10);
  return allEvents
    .filter(ev =>
      ev.dateStr >= todayStr &&
      !isEventCompleted(ev) &&
      (ev.participants.some(p => String(p.id) === myId) || String(ev.creatorId) === myId)
    )
    .sort((a, b) => (a.dateStr + (a.time || '')).localeCompare(b.dateStr + (b.time || '')));
}

function getMyActiveRequests() {
  if (!sb.isLoggedIn()) return [];
  const myId = String(sb.getUserId());
  return allPlayerSearches.filter(ps => String(ps.userId) === myId);
}

function renderHomeActivities() {
  const container = document.getElementById('home-activities-section');
  if (!container) return;
  if (!sb.isLoggedIn() || !currentUser) { container.innerHTML = ''; return; }

  if (!window._eventsLoaded) {
    container.innerHTML = `<div class="home-act-section">
      <div class="home-act-head"><div class="home-act-headrow"><span class="home-act-headtitle">Deine Aktivitäten</span></div></div>
      <div class="skeleton-card"></div><div class="skeleton-card" style="opacity:0.6"></div>
    </div>`;
    return;
  }

  const myEvents   = getMyActiveEvents();
  const myRequests = getMyActiveRequests();
  const total      = myEvents.length + myRequests.length;
  if (total === 0) { container.innerHTML = ''; return; }

  const subtitleParts = [];
  if (myEvents.length)   subtitleParts.push(`${myEvents.length} ${myEvents.length === 1 ? 'Spiel' : 'Spiele'}`);
  if (myRequests.length) subtitleParts.push(`${myRequests.length} ${myRequests.length === 1 ? 'Gesuch' : 'Gesuche'}`);

  const MAX = 3;
  const allItems = [
    ...myEvents.map(e   => ({ kind: 'event',   data: e  })),
    ...myRequests.map(ps => ({ kind: 'request', data: ps }))
  ];
  const visible = allItems.slice(0, MAX);
  const hasMore = total > MAX;
  const myId = sb.isLoggedIn() ? String(sb.getUserId()) : null;

  const cardsHtml = visible.map(item => {
    if (item.kind === 'event') {
      const e = item.data;
      const isCreator  = myId && String(e.creatorId) === myId;
      const isParticipating = myId && Array.isArray(e.participants) && e.participants.some(p => String(p.id) === myId);
      return `
        <div class="home-act-card${isCreator ? ' is-own-content' : ''}" onclick="showEventDetail(${e.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showEventDetail(${e.id})}">
          <div class="home-act-body">
            <div class="home-act-title-row">
              <div class="home-act-title">${escHtml(e.name)}</div>
              ${eventRelationFloatBadge(isCreator, isParticipating)}
            </div>
            ${gameTypePill(e.type) ? `<div class="home-act-badges">${gameTypePill(e.type)}</div>` : ''}
            <div class="home-act-event-meta">
              <div class="home-act-meta">${ic('calendar', 10)} ${formatEventDate(e)}</div>
              <div class="home-act-meta-bottom">
                <div class="home-act-meta home-act-location">${icPlate(10)} ${escHtml(e.tname || '–')}</div>
                <div class="home-act-meta home-act-participants">${ic('users', 10)} ${e.p}/${e.max}</div>
              </div>
            </div>
            ${eventStatusBlock(e)}
          </div>
          <span class="home-act-chevron">›</span>
        </div>`;
    } else {
      const ps = item.data;
      const metaParts = [];
      if (ps.wann    && ps.wann    !== 'Egal') metaParts.push(`${ic('clock', 10)} ${escHtml(ps.wann)}`);
      if (ps.umkreis && ps.umkreis !== 'Egal') metaParts.push(`${ic('pin', 10)} ${escHtml(ps.umkreis)} Umkreis`);
      return `
        <div class="home-act-card is-own-content" onclick="showPlayerSearchDetail(${ps.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPlayerSearchDetail(${ps.id})}">
          <div class="home-act-body">
            <div class="home-act-title-row">
              <div class="home-act-title">Mitspieler gesucht</div>
              ${creatorFloatBadge(true)}
            </div>
            ${(gameTypePill(ps.spielart) || playerSkillPill(ps.skillLevel))
              ? `<div class="home-act-badges">${gameTypePill(ps.spielart)}${playerSkillPill(ps.skillLevel)}</div>`
              : ''}
            ${metaParts.length ? `<div class="home-act-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>` : ''}
          </div>
          <span class="home-act-chevron">›</span>
        </div>`;
    }
  }).join('');

  const moreHtml = hasMore
    ? `<button type="button" class="home-act-more" onclick="showPage('events')">${ic('calendar', 12)} Alle ${total} Aktivitäten ansehen</button>`
    : '';

  container.innerHTML = `
    <div class="home-act-section">
      <div class="home-act-head">
        <div class="home-act-headrow">
          <span class="home-act-headtitle">Deine Aktivitäten</span>
          <span class="act-badge">${total}</span>
        </div>
        <div class="home-act-subtitle">${subtitleParts.join(' · ')}</div>
      </div>
      <div class="home-act-list">${cardsHtml}</div>
      ${moreHtml}
    </div>`;
}

// ── HAUPT-RENDER ──────────────────────────────────────────────────

function renderHome() {
  initWelcomeCard();

  const greetEl = document.querySelector('.hero-greeting');
  if (greetEl) {
    greetEl.textContent = currentUser ? `Hallo, ${currentUser.username}!` : 'Willkommen!';
  }
  updateHeroLocation();

  // Action-Card Icons einmalig befüllen
  const _sacIcons = [['map-pinned', 20], ['users', 20], ['calendar-plus', 20]];
  document.querySelectorAll('.sac-icon-wrap').forEach((el, i) => {
    if (!el.hasChildNodes() && _sacIcons[i]) el.innerHTML = ic(_sacIcons[i][0], _sacIcons[i][1]);
  });

  // ── Persönliche Inhalte ─────────────────────────────────────────
  // 1. Deine Aktivitäten (nur eingeloggte User)
  renderHomeActivities();

  // 2. Meine Einträge (nur bei offenen Vorschlägen)
  if (typeof renderHomeSuggestionsSection === 'function') renderHomeSuggestionsSection();

  // ── Entdecken-Bereiche (mit globalem Radius) ─────────────────────
  // 3. „In deiner Nähe"-Header mit Radius-Chip + kompakter Aktivitäts-Hinweis
  renderHomeNearbyHeader();

  // 4. Platten in deiner Nähe
  renderHomeTablesSection();

  // 5. Mitspieler gesucht
  renderHomePsSection();

  // 6. Kommende Spiele
  renderHomeEventsSection();
}

function navStat(type) {
  if (type === 'map') {
    showPage('map');
  } else if (type === 'events') {
    showPage('events');
    resetEventFilters();
  } else if (type === 'searches') {
    activateMitspielerFilter();
  }
}
