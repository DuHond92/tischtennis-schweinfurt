// ╔══════════════════════════════════════════════════════════════╗
// ║           DATEN LADEN (Supabase)                             ║
// ╚══════════════════════════════════════════════════════════════╝
async function loadTables() {
  // 1. Supabase laden
  try {
    const qb = new QueryBuilder('tables');
    const {data} = await qb.order('name').execute();
    if(data && data.length) {
      tables = data.map(t => ({
        id: t.id, name: t.name, addr: t.address,
        lat: t.lat, lng: t.lng,
        type: t.type, icon: t.icon || '🏓',
        photos: [], comments: [], osmId: null, events: []
      }));
    }
  } catch(e) { console.warn('Supabase tables error', e); }

  // 2. OSM Overpass API: echte Platten in Schweinfurt laden
  await loadOSMTables();

  // Fill selects
  const src = tables.length ? tables : FALLBACK_TABLES;
  const opts = src.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  ['ev-table','match-table-sel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}

async function loadOSMTables() {
  try {
    // Overpass Query: alle Tischtennis-Platten im Umkreis Schweinfurt
    const query = `
      [out:json][timeout:25];
      (
        node["leisure"="table_tennis"](49.85,10.05,50.15,10.45);
        way["leisure"="table_tennis"](49.85,10.05,50.15,10.45);
      );
      out body center;
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query)
    });
    const data = await res.json();
    if(!data.elements || !data.elements.length) {
      console.log('Keine OSM-Platten gefunden, nutze Fallback');
      return;
    }

    // OSM-Elemente in App-Format konvertieren
    const osmTables = data.elements.map((el, i) => {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags['name:de'] || `Tischtennis-Platte ${i+1}`;
      const isIndoor = tags.indoor === 'yes' || tags.location === 'indoor';
      const addr = [
        tags['addr:street'], tags['addr:housenumber'], tags['addr:city']
      ].filter(Boolean).join(' ') || 'Schweinfurt';

      return {
        id: 10000 + el.id % 9000, // eindeutige ID
        osmId: el.id,
        name, addr, lat, lng,
        type: isIndoor ? 'indoor' : 'outdoor',
        icon: isIndoor ? '🏢' : '🏓',
        photos: tags.image ? [tags.image] : [],
        surface: tags.surface || null,
        access: tags.access || 'public',
        operator: tags.operator || null,
        events: [],
        comments: []
      };
    }).filter(t => t.lat && t.lng);

    if(osmTables.length > 0) {
      // OSM-Platten mit Supabase-Daten mergen
      // (Supabase-Einträge haben Vorrang falls doppelt)
      const supabaseIds = new Set(tables.map(t => t.osmId).filter(Boolean));
      const newOSM = osmTables.filter(t => !supabaseIds.has(t.osmId));
      tables = [...tables, ...newOSM];
      console.log(`✅ ${osmTables.length} Platten von OSM geladen`);

      // OSM-Status anzeigen
      const statusEl = document.getElementById('osm-status');
      if(statusEl) {
        statusEl.innerHTML = `<div style="background:rgba(34,197,94,0.9);color:#fff;
          border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:700;">
          ✅ ${osmTables.length} Platten von OpenStreetMap
        </div>`;
        setTimeout(() => statusEl.innerHTML = '', 4000);
      }
    }
  } catch(e) {
    console.warn('OSM Overpass nicht erreichbar:', e);
  }
}

async function loadEvents() {
  // Events mit Tischtennis-Platte und Ersteller-Profil joinen
  const qb = new QueryBuilder('events');
  qb._select = `id,title,event_date,event_time,mode,max_participants,description,creator_id,
    tables(id,name,icon),
    profiles(username,avatar_emoji),
    event_participants(count)`;
  const {data} = await qb.order('event_date').execute();
  if(!data) return;

  allEvents = data.map(e => {
    const d = new Date(e.event_date);
    const months = ['JAN','FEB','MÄR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ'];
    return {
      id:        e.id,
      name:      e.title,
      day:       String(d.getDate()).padStart(2,'0'),
      mon:       months[d.getMonth()],
      time:      e.event_time?.slice(0,5) || '??:??',
      type:      e.mode,
      tname:     e.tables?.name || '?',
      ticon:     e.tables?.icon || '🏓',
      tid:       e.tables?.id,
      creator:   e.profiles?.username || 'Anonym',
      creatorId: e.creator_id,
      desc:      e.description || '',
      p:         e.event_participants?.[0]?.count || 0,
      max:       e.max_participants
    };
  });

  // Events den Platten zuordnen (für Karte)
  tables.forEach(t => t.events = allEvents.filter(e => e.tid === t.id));
}

async function loadPlayers() {
  const qb = new QueryBuilder('profiles');
  qb._select = 'id,username,avatar_emoji,elo,wins,losses';
  const {data} = await qb.order('elo', true).limit(20).execute();
  if(data) allPlayers = data;
}

async function loadMyMatches() {
  if(!sb.isLoggedIn()) return;
  const uid = sb.getUserId();
  // Matches wo ich Gewinner oder Verlierer bin
  const qb = new QueryBuilder('matches');
  qb._select = `id,score_winner,score_loser,elo_change,confirmed,played_at,
    winner:profiles!winner_id(username),
    loser:profiles!loser_id(username)`;
  qb.order('played_at', true);
  qb.limit(10);
  const {data} = await qb.execute();
  if(!data) return;
  const myId = uid;
  myMatches = data
    .filter(m => m.winner?.username || m.loser?.username)
    .map(m => {
      const iWon = m.winner_id === myId;
      return {
        opp:  iWon ? m.loser?.username  : m.winner?.username,
        res:  iWon ? 'win' : 'loss',
        elo:  iWon ? +(m.elo_change) : -(m.elo_change),
        sets: `${m.score_winner}:${m.score_loser}`,
        date: new Date(m.played_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
      };
    });
}
