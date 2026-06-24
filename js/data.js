// ╔══════════════════════════════════════════════════════════════╗
// ║           DATEN LADEN (Supabase)                             ║
// ╚══════════════════════════════════════════════════════════════╝
async function loadTables() {
  try {
    const qb = new QueryBuilder('tables');
    qb._select = 'id,name,address,lat,lng,type,icon';
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

  await loadOSMTables();

  const src = tables.length ? tables : FALLBACK_TABLES;
  const opts = src.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  ['ev-table','match-table-sel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}

async function loadOSMTables() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const query = '[out:json][timeout:10];(node["leisure"="table_tennis"](49.85,10.05,50.15,10.45);way["leisure"="table_tennis"](49.85,10.05,50.15,10.45););out body center;';
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if(!res.ok) return;
    const data = await res.json();
    if(!data.elements || !data.elements.length) return;

    const osmTables = data.elements.map((el, i) => {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags['name:de'] || `Tischtennis-Platte ${i+1}`;
      const isIndoor = tags.indoor === 'yes' || tags.location === 'indoor';
      const addr = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' ') || 'Schweinfurt';
      return {
        id: 10000 + el.id % 9000,
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
      const supabaseIds = new Set(tables.map(t => t.osmId).filter(Boolean));
      const newOSM = osmTables.filter(t => !supabaseIds.has(t.osmId));
      tables = [...tables, ...newOSM];
      console.log(`OSM: ${osmTables.length} Platten geladen`);
      const statusEl = document.getElementById('osm-status');
      if(statusEl) {
        statusEl.innerHTML = `<div style="background:rgba(34,197,94,0.9);color:#fff;border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:700;">✅ ${osmTables.length} Platten von OpenStreetMap</div>`;
        setTimeout(() => statusEl.innerHTML = '', 4000);
      }
    }
  } catch(e) {
    clearTimeout(timeout);
    console.log('OSM nicht erreichbar, nutze Supabase/Fallback');
  }
}

async function loadEvents() {
  // 1. Events – einfacher Select, kein verschachtelter Join
  const qbE = new QueryBuilder('events');
  qbE._select = 'id,title,table_id,creator_id,event_date,event_time,mode,max_participants,description';
  const {data: evData} = await qbE.order('event_date').execute();
  if(!evData || !evData.length) return;

  // 2. Teilnehmer-Anzahl + Profile für Avatar-Stack
  const pCounts       = {};
  const pParticipants = {};
  try {
    const qbP = new QueryBuilder('event_participants');
    qbP._select = 'event_id,profiles(id,username,avatar_emoji)';
    const {data: pData} = await qbP.execute();
    if(pData) pData.forEach(p => {
      pCounts[p.event_id] = (pCounts[p.event_id] || 0) + 1;
      if(!pParticipants[p.event_id]) pParticipants[p.event_id] = [];
      if(p.profiles) pParticipants[p.event_id].push(p.profiles);
    });
  } catch(e) {}

  // 3. Platten-Info für Name + Icon (einfacher Select)
  const tableMap = {};
  try {
    const qbT = new QueryBuilder('tables');
    qbT._select = 'id,name,icon';
    const {data: tData} = await qbT.execute();
    if(tData) tData.forEach(t => { tableMap[t.id] = t; });
  } catch(e) {}

  // 4. Profile für Ersteller-Usernamen (einfacher Select)
  const profileMap = {};
  try {
    const qbProf = new QueryBuilder('profiles');
    qbProf._select = 'id,username';
    const {data: pData} = await qbProf.execute();
    if(pData) pData.forEach(p => { profileMap[p.id] = p; });
  } catch(e) {}

  // 5. Daten im JS zusammensetzen
  const months = ['JAN','FEB','MÄR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ'];
  allEvents = evData.map(e => {
    const d   = new Date(e.event_date);
    const tbl = tableMap[e.table_id]   || {};
    const prof = profileMap[e.creator_id] || {};
    return {
      id:        e.id,
      name:      e.title,
      day:       String(d.getDate()).padStart(2,'0'),
      mon:       months[d.getMonth()],
      time:      e.event_time?.slice(0,5) || '??:??',
      type:      e.mode,
      tname:     tbl.name  || '?',
      ticon:     tbl.icon  || '🏓',
      tid:       e.table_id,
      creator:   prof.username || 'Anonym',
      creatorId: e.creator_id,
      desc:         e.description || '',
      p:            pCounts[e.id] || 0,
      max:          e.max_participants,
      participants: pParticipants[e.id] || []
    };
  });

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

  // 1. Matches – einfacher Select, kein verschachtelter Join
  // played_at existiert laut Schema (zurück von created_at)
  const qb = new QueryBuilder('matches');
  qb._select = 'id,winner_id,loser_id,score_winner,score_loser,elo_change,confirmed,played_at';
  qb.order('played_at', true);
  qb.limit(10);
  const {data} = await qb.execute();
  if(!data || !data.length) return;

  // 2. Usernamen aus allPlayers (bereits geladen) oder frisch abfragen
  const profileMap = {};
  if(allPlayers.length) {
    allPlayers.forEach(p => { profileMap[p.id] = p; });
  } else {
    try {
      const qbP = new QueryBuilder('profiles');
      qbP._select = 'id,username';
      const {data: pData} = await qbP.execute();
      if(pData) pData.forEach(p => { profileMap[p.id] = p; });
    } catch(e) {}
  }

  // 3. Daten im JS zusammensetzen
  myMatches = data
    .filter(m => m.winner_id || m.loser_id)
    .map(m => {
      const iWon = m.winner_id === uid;
      return {
        opp:  iWon ? (profileMap[m.loser_id]?.username  || '?')
                   : (profileMap[m.winner_id]?.username || '?'),
        res:  iWon ? 'win' : 'loss',
        elo:  iWon ? +(m.elo_change) : -(m.elo_change),
        sets: `${m.score_winner}:${m.score_loser}`,
        date: m.played_at
          ? new Date(m.played_at).toLocaleDateString('de-DE',{day:'numeric',month:'short'})
          : '–'
      };
    });
}
