// ╔══════════════════════════════════════════════════════════════╗
// ║           STARTUP                                            ║
// ╚══════════════════════════════════════════════════════════════╝
function hideSplash() {
  const el = document.getElementById('app-splash');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
}

window.addEventListener('load', async () => {
  // Passwort-Recovery aus URL-Hash erkennen (Supabase Magic Link)
  checkPasswordRecovery();

  // Deep-Link-Parameter einmalig auslesen, bevor URL gesäubert wird
  const _dlParams  = new URLSearchParams(window.location.search);
  const _dlTable   = _dlParams.get('table');
  const _dlEvent   = _dlParams.get('event');
  const _dlSearch  = _dlParams.get('search') || _dlParams.get('request');

  // Token beim Start sofort prüfen und ggf. erneuern
  if(sb.isLoggedIn()) {
    await sb.refreshToken();
  }
  // Alle 50 Minuten automatisch erneuern (Token läuft nach 60min ab)
  setInterval(() => {
    if(sb.isLoggedIn()) sb.refreshToken();
  }, 50 * 60 * 1000);

  applyTheme();
  _initAnalyticsToggle();
  PTAnalytics.track('app_open');

  // 1. Platten-Fallback zeigen (keine Demo-Events — events-list bleibt leer bis echte Daten da sind)
  tables = FALLBACK_TABLES;
  renderHome();

  // 2. Supabase-Daten laden (OSM wird parallel im Hintergrund geladen)
  try {
    await loadTables();
    if(mapInit) _applyMapFilters();
    await Promise.all([loadEvents()]);
    if(mapInit) { _applyMapFilters(); _refreshMarkerIcons(); }
    // Wenn eingeloggt: User-Daten laden
    if(sb.isLoggedIn()) {
      await loadCurrentUser();
      updateTopBarForUser();
      checkNotifications();
      startNotifPolling();
      if (typeof checkDmNotifications === 'function') checkDmNotifications();
    }
    // UI mit echten Daten aktualisieren
    window._eventsLoaded = true;
    renderHome();
    renderEvents();
    hideSplash();
    // Select-Optionen befüllen
    const opts = (tables.length?tables:FALLBACK_TABLES).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    ['ev-table'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });

    // 2b. Deep-Link auflösen — nach allen Daten, URL danach säubern
    if (_dlTable || _dlEvent || _dlSearch) {
      history.replaceState(null, '', window.location.pathname);
      if (_dlTable) {
        const id = parseInt(_dlTable);
        if (tables.find(t => t.id === id)) { showPage('map'); showTableDetail(id); }
        else showToast('Platte nicht gefunden', 'error');
      } else if (_dlEvent) {
        const id = parseInt(_dlEvent);
        if (allEvents.find(e => e.id === id)) { showPage('events'); showEventDetail(id); }
        else showToast('Spiel nicht gefunden', 'error');
      } else if (_dlSearch) {
        const id = parseInt(_dlSearch);
        if (allPlayerSearches.find(p => p.id === id)) { showPage('events'); showPlayerSearchDetail(id); }
        else showToast('Gesuch nicht gefunden', 'error');
      }
    }
  } catch(e) {
    console.warn('Supabase nicht erreichbar, zeige Fallback-Daten', e);
    window._eventsLoaded = true;
    renderEvents();
    hideSplash();
    showToast('Offline – Inhalte könnten veraltet sein', 'warning');
  }

  // 3. OSM-Platten im Hintergrund laden — blockiert weder Events noch Home
  loadOSMTables().then(() => {
    if(!mapInit) return;
    const known = new Set(markers.map(m => m.id));
    tables.filter(t => t.osmId && !known.has(t.id)).forEach(t => addMarker(t));
    _applyMapFilters();
  }).catch(() => {});
});

function _initAnalyticsToggle() {
  const toggle = document.getElementById('analytics-toggle');
  if (!toggle) return;
  toggle.checked = !PTAnalytics.isOptedOut();
}
