#!/usr/bin/env python3
"""
db/osm-enrich.py  v1
====================
Räumliche Kontextanreicherung für table_candidates.

Warum dieses Skript:
  _candidate_derive_name() liest nur Tags des TT-Knotens selbst.
  Parks, Schulen, Spielplätze usw. sind ANDERE OSM-Objekte — ihr Name
  findet sich nicht in raw_tags. Dieses Skript holt diese Kontextobjekte
  räumlich und speichert den abgeleiteten Namen in table_candidates.

Modi:
  --mode overpass  Targeted Overpass-Abfragen (Standard, kein Download nötig)
  --mode pbf       Lokale Geofabrik-PBF (Vollläufe, benötigt: pip install osmium shapely)

Verwendung:
  # Dry-Run (100 Kandidaten, Overpass, keine DB-Schreibzugriffe):
  python3 db/osm-enrich.py --mode overpass --limit 100

  # Vollständiger Lauf nach PBF-Download:
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf \\
      --supabase-url https://xxx.supabase.co --supabase-key SERVICE_ROLE_KEY

  # Echte Schreibzugriffe aktivieren (Standard ist Dry-Run):
  python3 db/osm-enrich.py --mode overpass --limit 100 --write

PBF-Download (~3,8 GB):
  curl -L -o db/germany-latest.osm.pbf \\
       https://download.geofabrik.de/europe/germany-latest.osm.pbf

Namens-Priorität:
  1. Enthaltensein in benanntem Polygon (Park, Schule, Spielplatz, Sportanlage …)
  2. Benannter Kontext in plausibler Nähe
  3. Nächste Straße (≤ 60 m)
  4. Stadtteil / Gemeinde (≤ 1500 m)
  5. Fallback "Tischtennisplatte"

Namens-Vorlagen:
  park/recreation  → "Tischtennis im {name}"
  playground       → "Tischtennis am {name}"
  school/sports    → "Tischtennis an der {name}"
  pool/camping     → "Tischtennis bei {name}"
  street           → "Tischtennisplatte an der {name}"
  suburb/city      → "Tischtennisplatte in {name}"
"""

import argparse
import json
import math
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

# ── Haversine ─────────────────────────────────────────────────────────────────

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return int(round(R * c))

# ── Kontext-Konfiguration ─────────────────────────────────────────────────────
# Format: (priority, max_dist_m, contain_radius_m, name_template)
# priority:        kleiner = besser
# max_dist_m:      Maximale Distanz für "nearby"-Treffer (Mittelpunkt→Mittelpunkt)
# contain_radius_m: Wenn Distanz ≤ contain_radius → method='contains' (Näherung für Overpass-Mode)
# name_template:   {name} wird ersetzt

CONTEXT_CONFIG = {
    'park':       (1, 200,  100, 'Tischtennis im {name}'),
    'playground': (1,  80,   30, 'Tischtennis am {name}'),
    'school':     (1, 100,   60, 'Tischtennis an der {name}'),
    'sports':     (1, 150,   80, 'Tischtennis an der {name}'),
    'pool':       (2,  65,   40, 'Tischtennis bei {name}'),
    'camping':    (2, 100,   80, 'Tischtennis bei {name}'),
    'recreation': (2, 150,  100, 'Tischtennis im {name}'),
    'square':     (2,  50,   25, 'Tischtennis am {name}'),
    'street':     (3,  60,    0, 'Tischtennisplatte an der {name}'),
    'suburb':     (4, 1500,   0, 'Tischtennisplatte in {name}'),
}

# Generische TT-Namen, die übersprungen werden sollen (identisch mit SQL-Funktion)
_GENERIC_TT = {
    'tischtennisplatte', 'tischtennis', 'tischtennisfeld', 'tischtennistisch',
    'tt-platte', 'tt platte', 'tt-tisch', 'table tennis', 'ping pong',
}

# Straßentypen, die für Kontextnamen geeignet sind
_STREET_INCLUDE = {
    'residential', 'living_street', 'service', 'footway', 'pedestrian',
    'unclassified', 'tertiary', 'track', 'path', 'cycleway', 'secondary',
}

def classify_osm_tags(tags):
    """Gibt den Kontexttyp zurück oder None."""
    leisure  = tags.get('leisure', '')
    amenity  = tags.get('amenity', '')
    landuse  = tags.get('landuse', '')
    tourism  = tags.get('tourism', '')
    place    = tags.get('place', '')
    highway  = tags.get('highway', '')

    if leisure in ('park', 'garden') or landuse == 'park':
        return 'park'
    if leisure == 'playground':
        return 'playground'
    if amenity in ('school', 'university', 'college', 'kindergarten'):
        return 'school'
    if leisure == 'sports_centre' or landuse == 'sport':
        return 'sports'
    if leisure == 'swimming_pool' or amenity == 'swimming_pool':
        return 'pool'
    if tourism == 'camp_site':
        return 'camping'
    if leisure == 'recreation_ground':
        return 'recreation'
    if place == 'square':
        return 'square'
    if highway in _STREET_INCLUDE and tags.get('name'):
        return 'street'
    if place in ('suburb', 'neighbourhood', 'quarter', 'village', 'town', 'city'):
        return 'suburb'
    return None

def derive_display_name(ctx_type, ctx_name):
    config = CONTEXT_CONFIG.get(ctx_type)
    if not config:
        return 'Tischtennisplatte'
    return config[3].format(name=ctx_name)

# ── Bestes Kontext-Match finden ───────────────────────────────────────────────

METHOD_RANK = {'contains': 0, 'nearest': 1, 'street': 2, 'administrative': 3}

def find_best_context(cand_lat, cand_lng, context_objects):
    """
    Findet den besten Kontext für einen Kandidaten.
    context_objects: Liste von {'name', 'type', 'osm_id', 'lat', 'lng'}
    Gibt ein Enrichment-Dict zurück oder None bei Fallback.
    """
    candidates = []

    for obj in context_objects:
        ctx_type = obj.get('type')
        if not ctx_type or ctx_type not in CONTEXT_CONFIG:
            continue

        priority, max_dist, contain_radius, _ = CONTEXT_CONFIG[ctx_type]
        dist = haversine_m(cand_lat, cand_lng, obj['lat'], obj['lng'])

        if dist > max_dist:
            continue

        # Method bestimmen (Overpass-Mode: Näherungslösung für contains)
        if contain_radius > 0 and dist <= contain_radius:
            method = 'contains'
            confidence = round(0.95 - 0.25 * (dist / max(1, contain_radius)), 2)
        elif ctx_type == 'suburb':
            method = 'administrative'
            confidence = 0.4
        elif ctx_type == 'street':
            method = 'street'
            confidence = round(0.75 - 0.25 * (dist / max_dist), 2)
        else:
            method = 'nearest'
            confidence = round(0.65 - 0.25 * (dist / max_dist), 2)

        candidates.append((
            METHOD_RANK[method], priority, dist,
            {
                'context_name':          obj['name'],
                'context_type':          ctx_type,
                'context_osm_id':        obj['osm_id'],
                'context_distance_m':    dist,
                'context_method':        method,
                'context_confidence':    max(0.1, confidence),
                'enriched_display_name': derive_display_name(ctx_type, obj['name']),
                'enriched_name_source':  f'osm_{ctx_type}',
            }
        ))

    if not candidates:
        return None

    # Sortierung: method_rank ASC, priority ASC, Distanz ASC
    candidates.sort(key=lambda x: (x[0], x[1], x[2]))
    return candidates[0][3]

# ── Stichproben-Auswahl ───────────────────────────────────────────────────────

def sample_candidates(elements, limit, seed=42):
    """Stratifizierte Stichprobe nach 2°×2°-Rasterzellen."""
    random.seed(seed)

    def _coords(el):
        lat = el.get('lat') or (el.get('center') or {}).get('lat')
        lon = el.get('lon') or (el.get('center') or {}).get('lon')
        return lat, lon

    by_cell = defaultdict(list)
    for el in elements:
        lat, lon = _coords(el)
        if lat is None or lon is None:
            continue
        cell = (int(lat // 2), int(lon // 2))
        by_cell[cell].append(el)

    cells = sorted(by_cell.keys())
    per_cell = max(1, math.ceil(limit / len(cells)))

    result = []
    for cell in cells:
        pool = by_cell[cell]
        n = min(per_cell, len(pool))
        result.extend(random.sample(pool, n))

    random.shuffle(result)
    return result[:limit]

# ── Overpass-Abfragen ─────────────────────────────────────────────────────────

_OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
]

# around: Radius in Metern — muss ≥ max(CONTEXT_CONFIG max_dist_m) sein.
# Lokale Filterung in find_best_context übernimmt den Rest.
_OVERPASS_AROUND_RADIUS = 1600

# Overpass-around-Abfrage für einen einzelnen Punkt.
# {lat}, {lng}, {r} werden per .format() ersetzt.
_OVERPASS_AROUND_TMPL = (
    '[out:json][timeout:20];'
    '('
    # Parks, Gärten, Spielplätze, Sportanlagen, Bäder, Camping
    '  nwr["leisure"~"^(park|playground|sports_centre|swimming_pool|garden|recreation_ground)$"]'
    '     ["name"](around:{r},{lat},{lng});'
    # Schulen, Unis, Kitas
    '  nwr["amenity"~"^(school|university|college|kindergarten)$"]["name"](around:{r},{lat},{lng});'
    # Landnutzung Sport/Park
    '  nwr["landuse"~"^(park|sport)$"]["name"](around:{r},{lat},{lng});'
    # Campingplätze
    '  nwr["tourism"="camp_site"]["name"](around:{r},{lat},{lng});'
    # Lokale Straßen
    '  way["highway"~"^(residential|living_street|service|footway|pedestrian|'
    '      unclassified|tertiary|track|path|cycleway|secondary)$"]'
    '     ["name"](around:80,{lat},{lng});'
    # Stadtteile / Ortschaften
    '  nwr["place"~"^(suburb|neighbourhood|quarter|village|town)$"]'
    '     ["name"](around:{r},{lat},{lng});'
    ');'
    'out center;'
)

def _overpass_request(query, retries=2, delay=5):
    body = ('data=' + urllib.parse.quote(query)).encode()
    last_err = None
    for endpoint in _OVERPASS_ENDPOINTS:
        for attempt in range(retries):
            try:
                req = urllib.request.Request(
                    endpoint, data=body, method='POST',
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent':   'PlattenTreff-Enrich/1.0',
                    }
                )
                with urllib.request.urlopen(req, timeout=25) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    remark = data.get('remark', '')
                    if remark:
                        print(f'   [Overpass remark: {remark[:120]}]', file=sys.stderr)
                    return data
            except Exception as e:
                last_err = e
                if attempt < retries - 1:
                    time.sleep(delay)
        time.sleep(delay)
    raise RuntimeError(f'Overpass fehlgeschlagen: {last_err}')

def _parse_overpass_context(data):
    """Extrahiert Kontextobjekte aus Overpass-Ergebnis."""
    objects = []
    for el in data.get('elements', []):
        tags = el.get('tags') or {}
        name = tags.get('name') or tags.get('name:de') or ''
        name = name.strip()
        if not name:
            continue

        ctx_type = classify_osm_tags(tags)
        if not ctx_type:
            continue

        el_type = el.get('type', 'node')
        el_id   = el.get('id', 0)
        center  = el.get('center') or {}

        lat = el.get('lat') or center.get('lat')
        lon = el.get('lon') or center.get('lon')
        if lat is None or lon is None:
            continue

        objects.append({
            'name':   name,
            'type':   ctx_type,
            'osm_id': f'{el_type}/{el_id}',
            'lat':    float(lat),
            'lng':    float(lon),
        })
    return objects

def fetch_context_for_point(lat, lng, request_delay=2.5):
    """Holt alle Kontextobjekte in _OVERPASS_AROUND_RADIUS Metern um einen Punkt."""
    query = _OVERPASS_AROUND_TMPL.format(
        lat=f'{lat:.6f}', lng=f'{lng:.6f}', r=_OVERPASS_AROUND_RADIUS
    )
    data = _overpass_request(query)
    time.sleep(request_delay)
    return _parse_overpass_context(data)

# ── Originalname aus OSM-Tags ─────────────────────────────────────────────────

def original_osm_name(tags):
    n  = (tags.get('name', '') or '').strip()
    nd = (tags.get('name:de', '') or '').strip()
    if n and n.lower() not in _GENERIC_TT:
        return n
    if nd and nd.lower() not in _GENERIC_TT:
        return nd
    op = (tags.get('operator', '') or '').strip()
    if op:
        return f'[Betreiber: {op}]'
    return '(kein Name)'

# ── Overpass-Modus ────────────────────────────────────────────────────────────

def run_overpass_mode(args):
    print('── Lade Kandidaten …', file=sys.stderr)
    with open(args.input) as f:
        raw = json.load(f)
    elements = raw.get('elements', raw) if isinstance(raw, dict) else raw

    sample = sample_candidates(elements, args.limit)
    n_total = len(elements)
    print(f'── Stichprobe: {len(sample)} Kandidaten aus {n_total} Gesamtkandidaten', file=sys.stderr)
    print(f'── {len(sample)} around-Abfragen (~{len(sample) * 2.5:.0f}s mit Rate-Limit)', file=sys.stderr)

    results = []
    for i, el in enumerate(sample, 1):
        cand_lat = el.get('lat') or (el.get('center') or {}).get('lat')
        cand_lon = el.get('lon') or (el.get('center') or {}).get('lon')
        if cand_lat is None or cand_lon is None:
            continue
        cand_lat = float(cand_lat)
        cand_lng = float(cand_lon)

        el_type  = el.get('type', 'node')
        el_id    = el.get('id', 0)
        tags     = el.get('tags') or {}
        osm_name = original_osm_name(tags)

        print(f'   [{i:3d}/{len(sample)}] {el_type}/{el_id} '
              f'({cand_lat:.4f},{cand_lng:.4f}) …', file=sys.stderr, end='')

        try:
            ctx_objects = fetch_context_for_point(cand_lat, cand_lng)
            enrichment  = find_best_context(cand_lat, cand_lng, ctx_objects)
            tag = (f' → {enrichment["enriched_display_name"][:45]}'
                   if enrichment else ' → (kein Kontext)')
            print(tag, file=sys.stderr)
        except Exception as e:
            print(f' FEHLER: {e}', file=sys.stderr)
            enrichment = None

        results.append({
            'external_id': f'{el_type}/{el_id}',
            'lat': cand_lat,
            'lng': cand_lng,
            'osm_name':   osm_name,
            'enrichment': enrichment,
        })

    _print_report(results, args)

    if args.write:
        if not args.supabase_url or not args.supabase_key:
            print('\nFEHLER: --supabase-url und --supabase-key erforderlich für --write', file=sys.stderr)
            sys.exit(1)
        _write_to_supabase(results, args)

# ── PBF-Modus ─────────────────────────────────────────────────────────────────

def run_pbf_mode(args):
    """
    Vollständiger Lauf mit lokalem Geofabrik-PBF.
    Benötigt: pip install osmium shapely

    Download (~3,8 GB):
      curl -L -o db/germany-latest.osm.pbf \\
           https://download.geofabrik.de/europe/germany-latest.osm.pbf
    """
    try:
        import osmium
        from osmium.geom import WKBFactory
    except ImportError:
        print('FEHLER: pyosmium nicht installiert. pip install osmium', file=sys.stderr)
        sys.exit(1)

    try:
        import shapely.wkb
        from shapely.geometry import Point
        from shapely.strtree import STRtree
    except ImportError:
        print('FEHLER: shapely nicht installiert. pip install shapely', file=sys.stderr)
        sys.exit(1)

    if not args.pbf:
        print('FEHLER: --pbf PATH erforderlich im PBF-Modus.', file=sys.stderr)
        sys.exit(1)

    print('── Lade Kandidaten …', file=sys.stderr)
    with open(args.input) as f:
        raw = json.load(f)
    elements = raw.get('elements', raw) if isinstance(raw, dict) else raw

    sample = sample_candidates(elements, args.limit) if args.limit else elements
    print(f'── {len(sample)} Kandidaten', file=sys.stderr)

    # PBF parsen — Polygone und Punkte getrennt sammeln
    wkb_factory = WKBFactory()

    class ContextHandlerArea(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.polygons  = []  # [(name, ctx_type, osm_id, shapely_geom)]
            self.points    = []  # [(name, ctx_type, osm_id, lat, lng)]

        def area(self, a):
            tags = dict(a.tags)
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            ctx_type = classify_osm_tags(tags)
            if not ctx_type or ctx_type in ('street', 'suburb'):
                return
            try:
                wkb  = wkb_factory.create_multipolygon(a)
                geom = shapely.wkb.loads(wkb, hex=True)
                oid  = f'{"relation" if not a.from_way() else "way"}/{a.orig_id()}'
                self.polygons.append((name, ctx_type, oid, geom))
            except Exception:
                pass

        def node(self, n):
            tags = dict(n.tags)
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            ctx_type = classify_osm_tags(tags)
            if not ctx_type:
                return
            self.points.append((name, ctx_type, f'node/{n.id}',
                                 n.location.lat, n.location.lon))

        def way(self, w):
            tags = dict(w.tags)
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            ctx_type = classify_osm_tags(tags)
            if ctx_type not in ('street', 'suburb'):
                return
            # Für Straßen reicht der erste Knoten als Näherungspunkt
            try:
                first = w.nodes[0]
                self.points.append((name, ctx_type, f'way/{w.id}',
                                     first.location.lat, first.location.lon))
            except Exception:
                pass

    print('── Lese PBF …', file=sys.stderr)
    handler = ContextHandlerArea()
    handler.apply_file(args.pbf, locations=True, idx='flex_mem')
    print(f'── {len(handler.polygons)} Polygone, {len(handler.points)} Punkte extrahiert',
          file=sys.stderr)

    # Räumliche Indizes
    polygon_geoms = [p[3] for p in handler.polygons]
    polygon_tree  = STRtree(polygon_geoms) if polygon_geoms else None

    point_geoms = [Point(p[4], p[3]) for p in handler.points]  # lon,lat → x,y
    point_tree  = STRtree(point_geoms) if point_geoms else None

    results = []
    for el in sample:
        lat = float(el.get('lat') or (el.get('center') or {}).get('lat'))
        lng = float(el.get('lon') or (el.get('center') or {}).get('lon'))
        tags = el.get('tags') or {}
        osm_name = original_osm_name(tags)
        cand_pt  = Point(lng, lat)

        ctx_objects = []

        # Polygon-Enthaltensein prüfen (genaue Containment-Prüfung)
        if polygon_tree:
            bbox = cand_pt.buffer(0.002)  # ~220m
            for idx in polygon_tree.query(bbox):
                pg = handler.polygons[idx]
                if polygon_geoms[idx].contains(cand_pt):
                    ctx_objects.append({
                        'name':   pg[0], 'type': pg[1], 'osm_id': pg[2],
                        'lat': lat, 'lng': lng,  # Enthaltensein → Distanz 0
                    })
                    # Dist 0 garantiert method='contains'

        # Nahe Punkte (Straßen, Stadtteile, Punkt-POIs)
        if point_tree:
            search_buf = cand_pt.buffer(0.015)  # ~1.5km grob
            for idx in point_tree.query(search_buf):
                pg = handler.points[idx]
                ctx_objects.append({
                    'name': pg[0], 'type': pg[1], 'osm_id': pg[2],
                    'lat': pg[3], 'lng': pg[4],
                })

        enrichment = find_best_context(lat, lng, ctx_objects)
        results.append({
            'external_id': f"{el.get('type','node')}/{el.get('id',0)}",
            'lat': lat, 'lng': lng,
            'osm_name':   osm_name,
            'enrichment': enrichment,
        })

    _print_report(results, args)

    if args.write:
        if not args.supabase_url or not args.supabase_key:
            print('\nFEHLER: --supabase-url und --supabase-key erforderlich für --write',
                  file=sys.stderr)
            sys.exit(1)
        _write_to_supabase(results, args)

# ── Auswertung ────────────────────────────────────────────────────────────────

def _print_report(results, args):
    total     = len(results)
    enriched  = [r for r in results if r['enrichment']]
    fallback  = [r for r in results if not r['enrichment']]

    by_type   = defaultdict(list)
    by_method = defaultdict(list)
    for r in enriched:
        e = r['enrichment']
        by_type[e['context_type']].append(r)
        by_method[e['context_method']].append(r)

    print('\n' + '═' * 72)
    print(f'ENRICHMENT DRY-RUN  —  {total} Kandidaten')
    print('═' * 72)

    print(f'\n■ Ergebnis gesamt')
    print(f'  Mit Kontext: {len(enriched)} ({100*len(enriched)/max(1,total):.0f} %)')
    print(f'  Fallback:    {len(fallback)} ({100*len(fallback)/max(1,total):.0f} %)')

    print('\n■ Methoden')
    for method in ('contains', 'nearest', 'street', 'administrative'):
        n = len(by_method.get(method, []))
        if n:
            print(f'  {method:15s} {n:4d} ({100*n/max(1,total):.0f} %)')

    print('\n■ Kontexttypen')
    for ctx_type in sorted(by_type, key=lambda t: -len(by_type[t])):
        n = len(by_type[ctx_type])
        print(f'  {ctx_type:12s} {n:4d} ({100*n/max(1,total):.0f} %)')

    print('\n■ Stichprobe — mit Kontext')
    header = f'  {"Orig.Name":<22} {"Kontexttyp":<12} {"Methode":<13} {"Dist":>5}  {"Konfidenz":>9}  Anzeigename'
    print(header)
    print('  ' + '─' * 90)
    for r in enriched[:30]:
        e = r['enrichment']
        orig_col = r['osm_name'][:21]
        dist_str = f"{e['context_distance_m']} m" if e['context_distance_m'] else 'enthält'
        print(f"  {orig_col:<22} {e['context_type']:<12} {e['context_method']:<13} "
              f"{dist_str:>6}  {e['context_confidence']:>9.2f}  "
              f"{e['enriched_display_name']}")

    if fallback:
        print('\n■ Stichprobe — Fallback (kein Kontext gefunden)')
        for r in fallback[:10]:
            print(f"  {r['external_id']}  lat={r['lat']:.4f}  lng={r['lng']:.4f}  "
                  f"({r['osm_name']})")

    print('\n' + '═' * 72)

    if args.write:
        print(f'\n→ --write aktiv: {len(enriched)} Datensätze werden in Supabase geschrieben …')
    else:
        print(f'\n→ Dry-Run. Erneut mit --write ausführen um nach Supabase zu schreiben.')

# ── Supabase-Schreiben ────────────────────────────────────────────────────────

def _write_to_supabase(results, args):
    """Schreibt Enrichment-Felder in table_candidates (PATCH per external_id)."""
    import urllib.error

    base_url = args.supabase_url.rstrip('/')
    headers  = {
        'Content-Type':  'application/json',
        'apikey':        args.supabase_key,
        'Authorization': f'Bearer {args.supabase_key}',
        'Prefer':        'return=minimal',
    }

    ok_count  = 0
    err_count = 0

    for r in results:
        if not r.get('enrichment'):
            continue

        e   = r['enrichment']
        eid = r['external_id']

        payload = json.dumps({
            'context_name':          e['context_name'],
            'context_type':          e['context_type'],
            'context_osm_id':        e['context_osm_id'],
            'context_distance_m':    e['context_distance_m'],
            'context_method':        e['context_method'],
            'context_confidence':    e['context_confidence'],
            'enriched_display_name': e['enriched_display_name'],
            'enriched_name_source':  e['enriched_name_source'],
            'enriched_at':           'now()',
        }, ensure_ascii=False).encode()

        url = (f"{base_url}/rest/v1/table_candidates"
               f"?source=eq.osm&external_id=eq.{urllib.parse.quote(eid)}")
        req = urllib.request.Request(url, data=payload, method='PATCH', headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=15):
                ok_count += 1
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()[:200]
            print(f'  FEHLER {eid}: {exc.code} {body}', file=sys.stderr)
            err_count += 1

        if (ok_count + err_count) % 50 == 0:
            print(f'  … {ok_count} OK, {err_count} Fehler', file=sys.stderr)
            time.sleep(0.2)

    print(f'Supabase: {ok_count} geschrieben, {err_count} Fehler.')

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Räumliche Kontextanreicherung für TT-Kandidaten'
    )
    parser.add_argument('--mode', choices=['overpass', 'pbf'], default='overpass',
        help='Datenquelle (Standard: overpass)')
    parser.add_argument('--limit', type=int, default=100, metavar='N',
        help='Maximale Kandidatenzahl (Standard: 100; 0 = alle)')
    parser.add_argument('--input', default='db/export.json', metavar='PATH',
        help='Eingabedatei (Standard: db/export.json)')
    parser.add_argument('--write', action='store_true',
        help='Ergebnisse nach Supabase schreiben (Standard: Dry-Run)')
    parser.add_argument('--supabase-url', metavar='URL',
        help='Supabase-URL (für --write)')
    parser.add_argument('--supabase-key', metavar='KEY',
        help='Service-Role-Key (für --write; NICHT in Commits einchecken!)')

    # PBF-Modus
    parser.add_argument('--pbf', metavar='PATH',
        help='Geofabrik-PBF-Datei (für --mode pbf)')

    args = parser.parse_args()

    if args.mode == 'pbf':
        run_pbf_mode(args)
    else:
        run_overpass_mode(args)


if __name__ == '__main__':
    main()
