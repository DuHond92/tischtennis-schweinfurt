// ╔══════════════════════════════════════════════════════════════╗
// ║           DATEN LADEN (Supabase)                             ║
// ╚══════════════════════════════════════════════════════════════╝
async function loadTables() {
  selectableEventTables = [];
  try {
    const qb = new QueryBuilder('tables');
    qb._select = 'id,name,address,lat,lng,type,icon,description,tables_count,access_type,access_note,opening_hours,created_at';
    const {data} = await qb.order('name').execute();
    // Auch leeres Array [] ist ein gültiges Supabase-Ergebnis — nicht mit "nicht geladen" gleichsetzen
    if(data) {
      tables = data.map(t => ({
        id: t.id, name: t.name, addr: t.address,
        lat: t.lat, lng: t.lng,
        type: t.type,
        description: t.description || '',
        tablesCount: t.tables_count || null,
        accessType: t.access_type || 'public',
        accessNote: t.access_note || null,
        openingHours: t.opening_hours || null,
        createdAt: t.created_at || null,
        photos: [], comments: [], osmId: null, events: []
      }));
      selectableEventTables = [...tables];
    }
  } catch(e) { console.warn('Supabase tables error', e); }
  // Immer setzen — auch bei Fehler oder leerem Ergebnis; runSearch() wartet auf dieses Flag
  tablesLoaded = true;

  await _loadApprovedTableImagesForTables(tables);

  const opts = tables.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  const matchTableSelect = document.getElementById('match-table-sel');
  if (matchTableSelect) matchTableSelect.innerHTML = opts;
}

async function _loadApprovedTableImagesForTables(tableItems) {
  const tableIds = tableItems.map(t => t.id).filter(Boolean);
  if(!tableIds.length) return;

  try {
    const url = `${SUPABASE_URL}/rest/v1/table_images?select=table_id,image_url&status=eq.approved&table_id=in.(${tableIds.join(',')})&order=created_at.asc`;
    const { ok, data } = await fetchWithRefresh(url, { headers: dbHeaders() });
    if(!ok || !Array.isArray(data)) return;

    const imageMap = {};
    data.forEach(img => {
      if(!img.table_id || !img.image_url) return;
      imageMap[img.table_id] = imageMap[img.table_id] || [];
      imageMap[img.table_id].push(img.image_url);
    });

    tableItems.forEach(t => {
      t.photos = imageMap[t.id] || t.photos || [];
    });
  } catch(e) {
    console.warn('Table image load error', e);
  }
}

const _TT_GENERIC_NAMES = new Set([
  'tischtennisplatte','tischtennis','tischtennisfeld','tischtennistisch',
  'tt-platte','tt platte','tt-tisch','table tennis','ping pong'
]);
function _deriveTTName(tags) {
  const tr = v => (typeof v === 'string' ? v.trim() : '') || null;
  const n  = tr(tags.name);
  const nd = tr(tags['name:de']);
  const op = tr(tags.operator);
  const st = tr(tags['addr:street']);
  const ci = tr(tags['addr:city']);
  if (n  && !_TT_GENERIC_NAMES.has(n.toLowerCase()))  return n;
  if (nd && !_TT_GENERIC_NAMES.has(nd.toLowerCase())) return nd;
  if (op) return `Tischtennis bei ${op}`;
  if (st) return `Tischtennisplatte an der ${st}`;
  if (ci) return `Tischtennisplatte in ${ci}`;
  return 'Tischtennisplatte';
}

async function loadOSMTables() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const OSM_ENDPOINTS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
  ];
  try {
    const query = '[out:json][timeout:10];(node["leisure"="table_tennis"](49.85,10.05,50.15,10.45);way["leisure"="table_tennis"](49.85,10.05,50.15,10.45););out body center;';
    let res;
    for (const endpoint of OSM_ENDPOINTS) {
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });
        if (res.ok) break;
      } catch(_) { res = null; }
    }
    clearTimeout(timeout);
    if (!res || !res.ok) return;
    const data = await res.json();
    if(!data.elements || !data.elements.length) return;

    const osmTables = data.elements.map((el, i) => {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      const tags = el.tags || {};
      const name = _deriveTTName(tags);
      const isIndoor = tags.indoor === 'yes' || tags.location === 'indoor';
      const addr = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' ') || null;
      return {
        id: 10000 + el.id % 9000,
        osmId: el.id,
        name, addr, lat, lng,
        type: isIndoor ? 'indoor' : 'outdoor',
        
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
      if (window.PT_DEBUG || location.hostname === 'localhost') console.log(`OSM: ${osmTables.length} Platten geladen`);
      const statusEl = document.getElementById('osm-status');
      if(statusEl) {
        statusEl.innerHTML = `<div style="background:rgba(34,197,94,0.9);color:#fff;border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:700;">${osmTables.length} Platten von OpenStreetMap</div>`;
        setTimeout(() => statusEl.innerHTML = '', 4000);
      }
    }
  } catch(e) {
    clearTimeout(timeout);
    if (window.PT_DEBUG || location.hostname === 'localhost') console.log('OSM nicht erreichbar, nutze Supabase/Fallback');
  }
}

async function loadEvents() {
  // 1. Events – einfacher Select, kein verschachtelter Join
  const qbE = new QueryBuilder('events');
  qbE._select = 'id,title,table_id,creator_id,event_date,event_time,mode,max_participants,description,lat,lng,location_label,search_radius_km';
  const {data: evData} = await qbE.order('event_date').execute();
  if(!evData || !evData.length) return;

  const eventIds = evData.map(e => e.id).filter(Boolean);

  // 2–5. Alle unabhängigen Fetches parallel nach dem Events-Request
  const [
    { pCounts, pParticipants },
    tableMap,
    profileMap,
    eventImageMap,
  ] = await Promise.all([

    // 2. Teilnehmer + Avatar-Profile (zweistufig, aber als Einheit parallel zu 3–5)
    (async () => {
      const pCounts = {}, pParticipants = {};
      try {
        const qbP = new QueryBuilder('event_participants');
        qbP._select = 'event_id,user_id';
        const {data: pData} = await qbP.order('event_id').execute();
        if (pData && pData.length) {
          const userIds = [...new Set(pData.map(p => p.user_id).filter(Boolean))];
          const profMap = {};
          if (userIds.length) {
            try {
              const url = `${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_emoji,avatar_url&id=in.(${userIds.join(',')})`;
              const {data: profs} = await fetchWithRefresh(url, { headers: dbHeaders() });
              if (Array.isArray(profs)) profs.forEach(p => { profMap[p.id] = p; });
            } catch(e) { console.warn('Profil-Fetch fehlgeschlagen', e); }
          }
          pData.forEach(p => {
            pCounts[p.event_id] = (pCounts[p.event_id] || 0) + 1;
            if (!pParticipants[p.event_id]) pParticipants[p.event_id] = [];
            const prof = profMap[p.user_id];
            if (prof) pParticipants[p.event_id].push(prof);
          });
        }
      } catch(e) { console.warn('Teilnehmer laden fehlgeschlagen', e); }
      return { pCounts, pParticipants };
    })(),

    // 3. Tischbilder (mutiert Objekte im globalen tables-Array in-place)
    (async () => {
      const tableMap = Object.fromEntries((tables || []).map(t => [t.id, t]));
      const tableItems = Object.values(tableMap);
      if (tableItems.length) {
        const needPhotos = tableItems.filter(t => !Array.isArray(t.photos) || !t.photos.length);
        if (needPhotos.length) await _loadApprovedTableImagesForTables(needPhotos);
      } else {
        try {
          const qbT = new QueryBuilder('tables');
          qbT._select = 'id,name,icon';
          const {data: tData} = await qbT.execute();
          if (tData) tData.forEach(t => { tableMap[t.id] = t; });
          await _loadApprovedTableImagesForTables(Object.values(tableMap));
        } catch(e) {}
      }
      return tableMap;
    })(),

    // 4. Creator-Profile
    (async () => {
      const profileMap = {};
      try {
        const qbProf = new QueryBuilder('profiles');
        qbProf._select = 'id,username,avatar_emoji,avatar_url,skill_level';
        const {data: pData} = await qbProf.execute();
        if (pData) pData.forEach(p => { profileMap[p.id] = p; });
      } catch(e) {}
      return profileMap;
    })(),

    // 5. Event-Bilder
    (async () => {
      const eventImageMap = {};
      try {
        if (eventIds.length) {
          const url = `${SUPABASE_URL}/rest/v1/event_images?select=event_id,image_url,status,uploaded_by,created_at&event_id=in.(${eventIds.join(',')})&order=created_at.desc`;
          const { data: imageData } = await fetchWithRefresh(url, { headers: dbHeaders() });
          if (Array.isArray(imageData)) imageData.forEach(image => {
            if (!image.event_id || !image.image_url) return;
            const visible = image.status === 'approved' ||
              (image.status === 'pending' && image.uploaded_by === sb.getUserId());
            if (!visible) return;
            eventImageMap[image.event_id] = eventImageMap[image.event_id] || [];
            eventImageMap[image.event_id].push(image.image_url);
          });
        }
      } catch(e) { console.warn('Eventbilder laden fehlgeschlagen', e); }
      return eventImageMap;
    })(),
  ]);

  // 6. Daten im JS zusammensetzen
  const months = ['JAN','FEB','MÄR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ'];
  const _evRaw = evData.map(e => {
    const d   = new Date(e.event_date);
    const tbl = tableMap[e.table_id]   || {};
    const prof = profileMap[e.creator_id] || {};
    return {
      id:        e.id,
      name:      e.title,
      dateStr:   e.event_date,
      day:       String(d.getDate()).padStart(2,'0'),
      mon:       months[d.getMonth()],
      time:      e.event_time?.slice(0,5) || '??:??',
      endTime:   null,
      status:    null,
      type:      e.mode,
      tname:     tbl.name  || '?',
      
      tid:       e.table_id,
      creator:      prof.username    || 'Anonym',
      creatorId:    e.creator_id,
      creatorEmoji:    prof.avatar_emoji || '',
      creatorAvatarUrl: prof.avatar_url  || null,
      creatorSkillLevel: prof.skill_level || '',
      desc:         e.description || '',
      p:            pCounts[e.id] || 0,
      max:          e.max_participants,
      participants: pParticipants[e.id] || [],
      eventPhotos:  eventImageMap[e.id] || [],
      photos:       eventImageMap[e.id]?.length ? eventImageMap[e.id] : (tbl.photos || []),
      // echte DB-Spalten (nach Migration); null wenn Spalten noch nicht existieren
      colLat:            e.lat              != null ? +e.lat              : null,
      colLng:            e.lng              != null ? +e.lng              : null,
      colLocationLabel:  e.location_label   || null,
      colSearchRadiusKm: e.search_radius_km != null ? +e.search_radius_km : null
    };
  });

  // Mitspieler-Gesuche herauslösen — erst trennen, dann atomar zuweisen
  const playerSearchRaw = _evRaw.filter(e => e.type === 'player_search');
  allEvents = _evRaw.filter(e => e.type !== 'player_search');
  allPlayerSearches = playerSearchRaw
    .map(e => {
      let extra = {};
      try { extra = JSON.parse(e.desc || '{}'); } catch(_) {}
      return {
        id:          e.id,
        type:        'player_search',
        userId:      e.creatorId,
        username:    e.creator,
        avatarEmoji:  e.creatorEmoji    || extra.avatarEmoji  || '',
        avatarUrl:    e.creatorAvatarUrl || extra.avatarUrl || null,
        skillLevel:   e.creatorSkillLevel || extra.skillLevel || '',
        spielart:    extra.spielart  || 'casual',
        wann:        extra.wann === 'Egal' ? 'Zeitlich flexibel' : (extra.wann || 'Zeitlich flexibel'),
        umkreis:     extra.umkreis   || '5 km',
        message:     extra.message   || '',
        // Spalte bevorzugen; JSON als Fallback für alte Gesuche
        lat:             e.colLat  != null ? e.colLat  : (extra.lat  != null ? +extra.lat  : null),
        lng:             e.colLng  != null ? e.colLng  : (extra.lng  != null ? +extra.lng  : null),
        location_label:  e.colLocationLabel  || extra.location_label  || '',
        search_radius_km: e.colSearchRadiusKm != null ? e.colSearchRadiusKm : (extra.search_radius_km ? +extra.search_radius_km : null)
      };
    });

  tables.forEach(t => t.events = allEvents.filter(e => e.tid === t.id));
}
