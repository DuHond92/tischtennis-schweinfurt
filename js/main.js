// ╔══════════════════════════════════════════════════════════════╗
// ║           STARTUP                                            ║
// ╚══════════════════════════════════════════════════════════════╝
function hideSplash() {
  const el = document.getElementById('app-splash');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
}

// Nativer iOS-Callback: App wird via Custom-URL-Scheme de.plattentreff.app:// geöffnet.
// SFSafariViewController schließt sich automatisch, App bekommt die Tokens im URL-Hash.
function _initNativeOAuthCallback() {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  const { App, Browser } = window.Capacitor.Plugins;
  App.addListener('appUrlOpen', async (event) => {
    const url = event.url || '';
    if (!url.startsWith('de.plattentreff.app://')) return;
    // Hash aus der URL extrahieren (de.plattentreff.app://login-callback#access_token=...)
    const hash = url.includes('#') ? '#' + url.split('#')[1] : '';
    if (hash && hash.includes('access_token')) {
      await Browser.close().catch(() => {});
      await handleNativeOAuthCallback(hash);
    }
  });
}

// PWA-Session-Recovery: greift, wenn der User nach OAuth in Safari zur installierten App
// zurückkehrt. iOS 16.4+ isoliert localStorage zwischen Safari und PWA — daher prüfen wir
// zuerst ob ein serverseitiger handoff_key eingelöst werden kann.
async function _recoverPwaSession() {
  if (currentUser) return; // bereits eingeloggt

  // ── Handoff-Einlösung (iOS PWA ↔ Safari) ──────────────────────────────────
  const handoffKey = localStorage.getItem('_pt_handoff_key');
  if (handoffKey) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/auth-handoff`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'redeem', handoff_key: handoffKey }),
      });
      if (r.ok) {
        const { access_token, refresh_token } = await r.json();
        if (access_token) {
          localStorage.removeItem('_pt_handoff_key');
          const fakeHash = `#access_token=${access_token}&refresh_token=${encodeURIComponent(refresh_token)}&expires_in=3600`;
          const result = sb.handleOAuthSession(fakeHash);
          if (result) {
            if (typeof clearOAuthLoadingState === 'function') clearOAuthLoadingState();
            await _finishSessionRecovery();
            return;
          }
        }
      } else {
        // nicht gefunden, abgelaufen oder bereits eingelöst — Key entfernen
        const status = r.status;
        if (status === 404 || status === 410) localStorage.removeItem('_pt_handoff_key');
      }
    } catch (_) { /* Netzwerkfehler — Key behalten, beim nächsten Mal erneut versuchen */ }
  }

  // ── Fallback: Token bereits im PWA-localStorage (kein localStorage-Sharing) ──
  if (!sb.isLoggedIn()) return;
  if (typeof clearOAuthLoadingState === 'function') clearOAuthLoadingState();
  await _finishSessionRecovery();
}

async function _finishSessionRecovery() {
  await loadCurrentUser();
  if (typeof loadMyConnections === 'function') await loadMyConnections();
  updateTopBarForUser();
  if (typeof renderProfile === 'function') renderProfile();
  if (typeof checkNotifications === 'function') checkNotifications();
  if (typeof startNotifPolling === 'function') startNotifPolling();
  if (typeof checkDmNotifications === 'function') checkDmNotifications();
  closeAllSheets();
  if (typeof showWelcomeSuccess === 'function') showWelcomeSuccess();
}

// visibilitychange: App wird sichtbar, nachdem Safari für OAuth geöffnet war
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  _recoverPwaSession();
});

// pageshow: Seite kommt aus dem bfcache zurück (iOS Safari Restore)
window.addEventListener('pageshow', () => {
  if (typeof clearOAuthLoadingState === 'function') clearOAuthLoadingState();
  _recoverPwaSession();
});

window.addEventListener('load', async () => {
  // Nativen OAuth-Listener sofort registrieren (vor allem anderen)
  _initNativeOAuthCallback();

  // URL-Hash auf Auth-Callbacks prüfen (OAuth-Redirect oder Passwort-Recovery)
  await checkOAuthCallback();
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
      if (typeof renderProfile === 'function') renderProfile();
      checkNotifications();
      startNotifPolling();
      if (typeof checkDmNotifications === 'function') checkDmNotifications();
      if (typeof loadMySuggestions   === 'function') loadMySuggestions();
    }
    // UI mit echten Daten aktualisieren
    window._eventsLoaded = true;
    renderHome();
    renderEvents();
    hideSplash();
    // Select-Optionen befüllen
    const opts = tables.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    ['ev-table'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });

    // 2b. Deep-Link auflösen — nach allen Daten, URL danach säubern
    if (_dlTable || _dlEvent || _dlSearch) {
      history.replaceState(null, '', window.location.pathname);

      // IDs sind numerisch — NaN/negative/float abweisen bevor find() läuft
      const _dlParseId = (raw, label) => {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          if (window.PT_DEBUG || location.hostname === 'localhost') {
            console.warn(`[main] Ungültige ${label}-Deep-Link-ID:`, raw);
          }
          return null;
        }
        return n;
      };

      if (_dlTable) {
        const id = _dlParseId(_dlTable, 'table');
        if (id !== null) {
          if (tables.find(t => t.id === id)) { showPage('map'); showTableDetail(id); }
          else showToast('Platte nicht gefunden', 'error');
        }
      } else if (_dlEvent) {
        const id = _dlParseId(_dlEvent, 'event');
        if (id !== null) {
          if (allEvents.find(e => e.id === id)) { showPage('events'); showEventDetail(id); }
          else showToast('Spiel nicht gefunden', 'error');
        }
      } else if (_dlSearch) {
        const id = _dlParseId(_dlSearch, 'search');
        if (id !== null) {
          if (allPlayerSearches.find(p => p.id === id)) { showPage('events'); showPlayerSearchDetail(id); }
          else showToast('Gesuch nicht gefunden', 'error');
        }
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
