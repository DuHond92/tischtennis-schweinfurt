// ╔══════════════════════════════════════════════════════════════╗
// ║           MAP                                                ║
// ╚══════════════════════════════════════════════════════════════╝
let leafletMap, markers=[];
function initMap() {
  leafletMap = L.map('map',{center:[50.0490,10.2310],zoom:14,zoomControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap', maxZoom:19
  }).addTo(leafletMap);
  const src = tables.length ? tables : FALLBACK_TABLES;
  src.forEach(t => addMarker(t));
  renderMapList(src);
}

function addMarker(t) {
  const color = t.type==='indoor'?'#3B7CF4':'#22C55E';
  const evCount = t.events?.length || 0;
  const icon = L.divIcon({
    className:'',
    html:`<div style="background:${color};color:#fff;width:36px;height:36px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:1rem;
      box-shadow:0 3px 12px rgba(0,0,0,0.25);border:2px solid #fff;cursor:pointer;position:relative;">
      🏓${evCount?`<span style="position:absolute;top:-5px;right:-5px;background:#EF4444;
        color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;
        display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">${evCount}</span>`:''}
    </div>`,
    iconSize:[36,36], iconAnchor:[18,18]
  });
  const m = L.marker([t.lat,t.lng],{icon}).addTo(leafletMap);
  m.on('click',()=>{ showTableDetail(t.id); selectMapItem(t.id); });
  markers.push({id:t.id,m});
}

let userLat = null, userLng = null, userMarker = null;

function centerMap() {
  if(leafletMap) leafletMap.setView([50.0490,10.2310],14,{animate:true});
}

function locateUser() {
  if(!navigator.geolocation) { showToast('Standort nicht verfügbar','⚠️'); return; }
  const btn = document.getElementById('locate-btn');
  btn?.classList.add('locating');
  navigator.geolocation.getCurrentPosition(pos => {
    btn?.classList.remove('locating');
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    if(leafletMap) {
      // Genauigkeitskreis
      if(userMarker) leafletMap.removeLayer(userMarker);
      userMarker = L.circle([userLat,userLng], {
        radius: pos.coords.accuracy,
        color: '#3B7CF4', fillColor: '#3B7CF4', fillOpacity: 0.1, weight: 2
      }).addTo(leafletMap);
      L.circleMarker([userLat,userLng], {
        radius: 8, color: '#fff', weight: 3,
        fillColor: '#3B7CF4', fillOpacity: 1
      }).addTo(leafletMap).bindPopup('📍 Du bist hier');
      leafletMap.setView([userLat,userLng], 15, {animate:true});
    }
    // Entfernungen neu berechnen und Liste sortieren
    updateDistances();
    showToast('📍 Standort gefunden!');
  }, err => {
    btn?.classList.remove('locating');
    showToast('Standort konnte nicht ermittelt werden','⚠️');
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Meter
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function formatDistance(m) {
  if(m < 1000) return `${m}m`;
  return `${(m/1000).toFixed(1)}km`;
}

function updateDistances() {
  if(!userLat || !userLng) return;
  const src = tables.length ? tables : FALLBACK_TABLES;
  src.forEach(t => { t.distance = calcDistance(userLat, userLng, t.lat, t.lng); });
  src.sort((a,b) => (a.distance||99999) - (b.distance||99999));
  renderMapList(src);
  renderHome();
}

function selectMapItem(id) {
  document.querySelectorAll('.map-list-item').forEach(el=>
    el.classList.toggle('selected', el.dataset.id==id));
  const src = tables.length ? tables : FALLBACK_TABLES;
  const t = src.find(x=>x.id===id);
  if(t && leafletMap) leafletMap.setView([t.lat,t.lng],16,{animate:true});
}

function renderMapList(list) {
  const c = document.getElementById('map-list-container');
  if(!list.length) {
    c.innerHTML = `<div class="osm-loading"><div class="search-spinner"></div>Lade Platten von OpenStreetMap…</div>`;
    return;
  }
  const PH = 'images/placeholders/placeholder-plate.webp';
  c.innerHTML = list.map(t=>{
    const thumb = (t.photos && t.photos.length) ? t.photos[0] : PLATE_TEST_IMAGES[0];
    const evCount = t.events?.length || 0;
    return `
    <div class="map-list-item" data-id="${t.id}" onclick="selectMapItem(${t.id});showTableDetail(${t.id})">
      <div class="mli-thumb">
        <img src="${thumb}" onerror="this.src='${PH}'" loading="lazy">
      </div>
      <div class="map-list-info">
        <div class="mli-title-row">
          <div class="map-list-name">${t.name}</div>
          <span class="mli-badge ${t.type==='indoor'?'badge-in':'badge-out'}">${t.type==='indoor'?'Indoor':'Outdoor'}</span>
        </div>
        <div class="map-list-sub">${ic('pin')} ${t.addr||'Schweinfurt'}${t.distance!=null?' · '+formatDistance(t.distance)+' entfernt':''}</div>
        ${evCount?`<div class="map-list-ev">${ic('calendar',13)} ${evCount} Event${evCount>1?'s':''} geplant</div>`:''}
      </div>
      <div class="map-list-chevron">›</div>
    </div>`;
  }).join('');
}
