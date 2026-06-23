// ╔══════════════════════════════════════════════════════════════╗
// ║           STARTUP                                            ║
// ╚══════════════════════════════════════════════════════════════╝
window.addEventListener('load', async () => {
  // Token beim Start sofort prüfen und ggf. erneuern
  if(sb.isLoggedIn()) {
    await sb.refreshToken();
  }
  // Alle 50 Minuten automatisch erneuern (Token läuft nach 60min ab)
  setInterval(() => {
    if(sb.isLoggedIn()) sb.refreshToken();
  }, 50 * 60 * 1000);

  applyTheme();

  // 1. Sofort Fallback zeigen damit App nicht leer wirkt
  tables = FALLBACK_TABLES;
  renderHome();
  renderEvents('all');
  renderLeaderboard();

  // 2. Supabase-Daten laden (parallel)
  try {
    await Promise.all([loadTables(), loadEvents(), loadPlayers()]);
    // Wenn eingeloggt: User-Daten laden
    if(sb.isLoggedIn()) {
      await loadCurrentUser();
      await loadMyMatches();
      updateTopBarForUser();
    }
    // UI mit echten Daten aktualisieren
    renderHome();
    renderEvents(currentFilter);
    renderLeaderboard();
    renderMatchHistory();
    // Select-Optionen befüllen
    const opts = (tables.length?tables:FALLBACK_TABLES).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    ['ev-table','match-table-sel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
  } catch(e) {
    console.warn('Supabase nicht erreichbar, zeige Fallback-Daten', e);
  }
});
