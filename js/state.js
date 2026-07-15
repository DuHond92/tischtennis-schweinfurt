// ╔══════════════════════════════════════════════════════════════╗
// ║           APP STATE                                          ║
// ╚══════════════════════════════════════════════════════════════╝
let currentUser   = null;  // eingeloggtes Profil aus profiles-Tabelle
let tables        = [];    // aus Supabase + OSM geladen
let tablesLoaded  = false; // true sobald loadTables() abgeschlossen (auch bei leerem Ergebnis oder Fehler)
let allEvents     = [];    // aus Supabase geladen (mit table-Join)
let currentFilter     = 'all';
let currentTimeFilter = 'all'; // 'all' | 'today' | 'week' | 'weekend'
let currentTypeFilter = 'all'; // 'all' | 'casual' | 'training' | 'punktspiel'
let currentSort       = 'date'; // 'date' | 'dist'
let _editingEventId     = null;   // gesetzt wenn Event bearbeitet wird, sonst null
let _createEventFromTds = false;  // true wenn create-event-sheet als TDS-Unterseite geöffnet wurde
let allPlayerSearches = [];  // Mitspieler-Gesuche (mode='player_search' aus events-Tabelle)
