// ╔══════════════════════════════════════════════════════════════╗
// ║           APP STATE                                          ║
// ╚══════════════════════════════════════════════════════════════╝
let currentUser   = null;  // eingeloggtes Profil aus profiles-Tabelle
let tables        = [];    // aus Supabase + OSM geladen
let allEvents     = [];    // aus Supabase geladen (mit table-Join)
let allPlayers    = [];    // Rangliste aus Supabase
let myMatches     = [];    // Match-History des eingeloggten Users
let currentFilter     = 'all';
let allPlayerSearches = [];  // Mitspieler-Gesuche (mode='player_search' aus events-Tabelle)
