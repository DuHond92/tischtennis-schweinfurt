// ╔══════════════════════════════════════════════════════════════╗
// ║           STARTUP                                            ║
// ╚══════════════════════════════════════════════════════════════╝
window.addEventListener('load', async () => {
  // Passwort-Recovery aus URL-Hash erkennen (Supabase Magic Link)
  checkPasswordRecovery();

  // Token beim Start sofort prüfen und ggf. erneuern
  if(sb.isLoggedIn()) {
    await sb.refreshToken();
  }
  // Alle 50 Minuten automatisch erneuern (Token läuft nach 60min ab)
  setInterval(() => {
    if(sb.isLoggedIn()) sb.refreshToken();
  }, 50 * 60 * 1000);

  applyTheme();

  // 1. Platten-Fallback zeigen (keine Demo-Events — events-list bleibt leer bis echte Daten da sind)
  tables = FALLBACK_TABLES;
  renderHome();

  // 2. Supabase-Daten laden (OSM wird parallel im Hintergrund geladen)
  try {
    await loadTables();
    if(mapInit) _applyMapFilters();
    await Promise.all([loadEvents(), loadPlayers()]);
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
    renderHome();
    renderEvents(currentFilter);
    // Select-Optionen befüllen
    const opts = (tables.length?tables:FALLBACK_TABLES).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    ['ev-table'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
  } catch(e) {
    console.warn('Supabase nicht erreichbar, zeige Fallback-Daten', e);
  }

  // 3. OSM-Platten im Hintergrund laden — blockiert weder Events noch Home
  loadOSMTables().then(() => {
    if(!mapInit) return;
    const known = new Set(markers.map(m => m.id));
    tables.filter(t => t.osmId && !known.has(t.id)).forEach(t => addMarker(t));
    _applyMapFilters();
  }).catch(() => {});
});
