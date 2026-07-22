#!/usr/bin/env python3
"""
db/osm-enrich.py  v2
====================
Räumliche Kontextanreicherung für table_candidates.

DATENQUELLEN
------------
Produktiver Lauf:
  Geofabrik-Deutschland-PBF (germany-latest.osm.pbf, ~3,8 GB).
  Download: curl -L -o db/germany-latest.osm.pbf \\
                 https://download.geofabrik.de/europe/germany-latest.osm.pbf

  Der PBF wird einmal geparst; extrahierte Geodaten werden als Cache
  (db/osm-context-cache.pkl) gespeichert. Während der eigentlichen
  Kandidatenverarbeitung entstehen NULL Netzwerkaufrufe.

Testlauf (wenige Kandidaten, kein PBF-Download):
  --mode overpass  Überpass-API, eine Abfrage pro Kandidat (around:1600 m).
  NUR für Tests. Für 19.206 Kandidaten nicht geeignet (= 19.206 Requests).

MODI
----
  pbf      Produktiv — lokal, deterministisch, null Netzwerkaufrufe
  overpass Test — nützlich für schnelle Stichproben (<= 20 Kandidaten)

VERWENDUNG
----------
  # 1. Cache aus PBF bauen (einmalig, dauert ~5–15 min):
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf --build-cache

  # 2. 200-Kandidaten-Testlauf (kein DB-Schreiben):
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf --limit 200 \\
      --out db/enrichment-test-200.csv

  # 3. Vollständiger Lauf (alle 19.206, kein DB-Schreiben, CSV zur Prüfung):
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf \\
      --out db/enrichment-all.csv

  # 4. Nach manueller Prüfung der CSV: in DB schreiben
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf \\
      --out db/enrichment-all.csv --write \\
      --supabase-url https://xxx.supabase.co --supabase-key SERVICE_ROLE_KEY

  # 5. Lauf fortsetzbar: bereits geschriebene external_ids werden übersprungen
  python3 db/osm-enrich.py --mode pbf --pbf db/germany-latest.osm.pbf \\
      --out db/enrichment-all.csv --resume --write ...

NAMENS-PRIORITÄT
----------------
  1. Echte Polygon-Enthaltensein: Park, Spielplatz, Schule, Sportanlage, Freibad, Camping
  2. Nächstes benanntes Polygon (Mittelpunkt-Näherung) innerhalb Typ-spezifischer Grenze
  3. Straße: kürzeste Distanz Punkt→Linie ≤ 60 m
  4. Administrative Grenze (place=suburb/neighbourhood/…): nur via Polygon-Enthaltensein
  5. Fallback "Tischtennisplatte" (keine Anreicherung)

KONFIDENZ
---------
  contains:      0.90 – 0.10*(dist/max_dist_m) → 0.80–0.90
  nearest:       0.70 – 0.30*(dist/max_dist_m) → 0.40–0.70
  street:        0.70 – 0.30*(dist/max_dist_m) → 0.40–0.70  (dist = Punkt→Linie)
  administrative:0.50 (fix; Polygon-Enthaltensein aber große unspezifische Fläche)

ABHÄNGIGKEITEN
--------------
  pip install osmium shapely   (für --mode pbf)
  pip install requests          (für --mode overpass, optional)

PBF-QUELLE
----------
  Geofabrik Deutschland: https://download.geofabrik.de/europe/germany-latest.osm.pbf
  Letzte OSM-Daten: Versionsdatum steht im PBF-Header (osmium fileinfo --extended).
  Wird im Cache als pbf_source und pbf_timestamp gespeichert.
"""

import argparse
import csv
import json
import math
import os
import pickle
import random
import sys
import time
from collections import defaultdict
from pathlib import Path


# ══════════════════════════════════════════════════════════════════════════════
# HAVERSINE
# ══════════════════════════════════════════════════════════════════════════════

def haversine_m(lat1, lng1, lat2, lng2):
    """Luftlinien-Distanz in Metern (Haversine, Erdradius 6 371 000 m)."""
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


# ══════════════════════════════════════════════════════════════════════════════
# KONTEXT-KLASSIFIZIERUNG
# ══════════════════════════════════════════════════════════════════════════════

# Generische TT-Namen — identisch mit SQL-Funktion und JS-Helper
_GENERIC_TT = frozenset({
    'tischtennisplatte', 'tischtennis', 'tischtennisfeld', 'tischtennistisch',
    'tt-platte', 'tt platte', 'tt-tisch', 'table tennis', 'ping pong',
})

# Straßentypen, die für Kontext geeignet sind (keine Autobahnen / Bundesstraßen)
_STREET_HIGHWAY = frozenset({
    'residential', 'living_street', 'service', 'footway', 'pedestrian',
    'unclassified', 'tertiary', 'track', 'path', 'cycleway', 'secondary',
    'steps',
})

def classify_osm_tags(tags):
    """
    Klassifiziert OSM-Tags in einen Kontexttyp.
    Rückgabe: 'park'|'playground'|'school'|'kindergarten'|'sports'|
              'pool'|'camping'|'recreation'|'square'|'street'|'suburb'|None
    """
    leisure = tags.get('leisure', '')
    amenity = tags.get('amenity', '')
    landuse = tags.get('landuse', '')
    tourism = tags.get('tourism', '')
    place   = tags.get('place', '')
    highway = tags.get('highway', '')
    natural = tags.get('natural', '')

    # Parks und Gärten (Priorität 1)
    if leisure in ('park', 'garden') or (landuse == 'recreation_ground' and tags.get('name')):
        return 'park'
    if landuse == 'park':
        return 'park'

    # Spielplätze (Priorität 1)
    if leisure == 'playground':
        return 'playground'

    # Schulen ohne Kindergarten (Priorität 1)
    if amenity in ('school', 'university', 'college'):
        return 'school'

    # Kindergärten / Kitas (Priorität 1, eigener Typ wegen Namensvorlage)
    if amenity == 'kindergarten':
        return 'kindergarten'

    # Sportanlagen (Priorität 1)
    if leisure in ('sports_centre', 'stadium', 'sports_hall'):
        return 'sports'
    if landuse == 'sport':
        return 'sports'

    # Schwimmbäder / Freibäder (Priorität 1)
    if leisure == 'swimming_pool' or amenity in ('swimming_pool',):
        return 'pool'

    # Campingplätze (Priorität 2)
    if tourism == 'camp_site':
        return 'camping'

    # Erholungsflächen (Priorität 2)
    if leisure == 'recreation_ground':
        return 'recreation'

    # Plätze / Squares (Priorität 2)
    if leisure == 'pitch' and tags.get('name'):
        return 'square'
    if place == 'square':
        return 'square'

    # Straßen (Priorität 3) — nur wenn benannt
    if highway in _STREET_HIGHWAY and tags.get('name'):
        return 'street'

    # Administrative Grenzen / Stadtteile (Priorität 4)
    # NUR über Polygon-Enthaltensein, nie über Distanz
    if place in ('suburb', 'neighbourhood', 'quarter', 'borough'):
        return 'suburb'

    return None


# ══════════════════════════════════════════════════════════════════════════════
# NAMENS-VORLAGEN  (grammatisch korrekt, ohne Duplikate)
# ══════════════════════════════════════════════════════════════════════════════

# Straßen-Endungen und ihr bestimmter Artikel
_STREET_FEMININE = (
    'straße', 'allee', 'gasse', 'brücke', 'promenade',
    'reihe', 'zeile', 'passage', 'chaussee', 'heide', 'aue',
)
_STREET_MASC_NEUT = (
    'weg', 'platz', 'damm', 'ring', 'berg', 'pfad', 'stieg', 'steig',
    'park', 'feld', 'tal', 'horn', 'tor', 'graben', 'bach', 'ufer',
    'dorf', 'gut', 'hof', 'rain', 'anger', 'grund',
)

def _street_name(name):
    """Wählt die richtige Artikel-Form für den Straßennamen."""
    lower = name.lower()
    if any(lower.endswith(s) for s in _STREET_FEMININE):
        return f'Tischtennisplatte an der {name}'
    if any(lower.endswith(s) for s in _STREET_MASC_NEUT):
        return f'Tischtennisplatte am {name}'
    # Unbekannter Typ (Ortsname, Abkürzung, fremdsprachlich): neutral
    return f'Tischtennisplatte – {name}'

# Bezeichnungen, die Freibäder / Hallenbäder in ihrem Namen tragen
_POOL_PREFIXES = (
    'freibad', 'hallenbad', 'schwimmbad', 'naturbad', 'waldbad',
    'strandbad', 'erlebnisbad', 'flussbad', 'seebad', 'thermalbad',
    'bad ',
)

def _pool_name(name):
    lower = name.lower()
    if any(lower.startswith(p) for p in _POOL_PREFIXES) or lower.endswith('bad'):
        return f'Tischtennis im {name}'
    return f'Tischtennis im Freibad {name}'

# Campingplatz-Bezeichnungen — verhindert "Campingplatz Campingplatz …"
_CAMPING_PREFIXES = ('campingplatz', 'camping-platz', 'camping ', 'zeltplatz')

def _camping_name(name):
    lower = name.lower()
    if any(lower.startswith(p) for p in _CAMPING_PREFIXES):
        return f'Tischtennis auf dem {name}'
    return f'Tischtennis auf dem Campingplatz {name}'

# Kindergarten-Bezeichnungen
_KINDER_PREFIXES = (
    'kindergarten', 'kita', 'kinderhaus', 'kinderkrippe',
    'kindertagesstätte', 'kinder', 'kiga',
)

def _school_name(name):
    """Wählt Vorlage: Kindergarten-ähnlich → 'am'; Schule → 'an der'."""
    lower = name.lower()
    if any(lower.startswith(p) for p in _KINDER_PREFIXES):
        return f'Tischtennis am {name}'
    return f'Tischtennis an der {name}'

def derive_display_name(ctx_type, ctx_name):
    """Erzeugt den Anzeigenamen aus Kontexttyp und OSM-Name."""
    if ctx_type == 'park':
        return f'Tischtennis im {ctx_name}'
    if ctx_type == 'playground':
        return f'Tischtennis am {ctx_name}'
    if ctx_type in ('school', 'kindergarten'):
        return _school_name(ctx_name)
    if ctx_type == 'sports':
        return f'Tischtennis an der {ctx_name}'
    if ctx_type == 'pool':
        return _pool_name(ctx_name)
    if ctx_type == 'camping':
        return _camping_name(ctx_name)
    if ctx_type == 'recreation':
        return f'Tischtennis im {ctx_name}'
    if ctx_type == 'square':
        return f'Tischtennis am {ctx_name}'
    if ctx_type == 'street':
        return _street_name(ctx_name)
    if ctx_type == 'suburb':
        return f'Tischtennisplatte in {ctx_name}'
    return 'Tischtennisplatte'


# ══════════════════════════════════════════════════════════════════════════════
# KONFIDENZ
# ══════════════════════════════════════════════════════════════════════════════

def compute_confidence(method, dist_m, max_dist_m):
    """
    Konfidenzwert 0.0–1.0.

    contains:       0.90 – 0.10*(dist/max_dist)
      Basis-Konfidenz hoch weil echter Point-in-Polygon (PBF-Modus)
      bzw. Näherung durch contain_radius (Overpass-Modus).
      Kleiner Abzug bei sehr großen Polygonen (Mittelpunkt weit weg).

    nearest/street: 0.70 – 0.30*(dist/max_dist)
      Nahe Objekte haben hohe Konfidenz; lineare Abstufung nach Distanz.
      street: dist = echte Punkt→Linie-Distanz (PBF), nicht Centroid-Distanz.

    administrative: 0.50 (fest)
      Polygon-Enthaltensein bestätigt, aber Stadtteile sind oft groß und
      wenig spezifisch → niedrige Basisconfidenz.
    """
    if method == 'contains':
        ratio = min(1.0, dist_m / max(1, max_dist_m))
        return round(max(0.10, 0.90 - 0.10 * ratio), 2)
    if method in ('nearest', 'street'):
        ratio = min(1.0, dist_m / max(1, max_dist_m))
        return round(max(0.10, 0.70 - 0.30 * ratio), 2)
    if method == 'administrative':
        return 0.50
    return 0.10


# ══════════════════════════════════════════════════════════════════════════════
# KONTEXT-KONFIGURATION  (priority, max_dist_m)
# ══════════════════════════════════════════════════════════════════════════════
# priority: 1 = höchste Priorität (gewinnt bei gleichem method-rank)
# max_dist_m: maximale Distanz Kandidat→Objekt-Mittelpunkt für 'nearest';
#             für 'contains' wird dieser Wert nur für die Konfidenzberechnung
#             verwendet (Polygon-Enthaltensein hat keine Distanz-Obergrenze).
# administrative hat max_dist_m=None → nie via Distanz, nur via Polygon.

CONTEXT_CONFIG = {
    # Typ           priority  max_dist_m
    'park':         (1,  300),
    'playground':   (1,   80),
    'school':       (1,  150),
    'kindergarten': (1,   80),
    'sports':       (1,  150),
    'pool':         (1,  100),
    'camping':      (2,  150),
    'recreation':   (2,  200),
    'square':       (2,   80),
    'street':       (3,   60),   # Distanz = Punkt→Linie (nicht Centroid)
    'suburb':       (4, None),   # nur via Polygon-Enthaltensein
}


# ══════════════════════════════════════════════════════════════════════════════
# STICHPROBE
# ══════════════════════════════════════════════════════════════════════════════

def sample_candidates(elements, limit, seed=42):
    """Stratifizierte Stichprobe nach 2°×2°-Rasterzellen über ganz Deutschland."""
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
        cell = (int(float(lat) // 2), int(float(lon) // 2))
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


def original_osm_name(tags):
    """Gibt den Roh-OSM-Namen des TT-Knotens zurück (für den Report)."""
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


# ══════════════════════════════════════════════════════════════════════════════
# PBF-MODUS  (kein Netzwerkaufruf während Kandidaten-Verarbeitung)
# ══════════════════════════════════════════════════════════════════════════════

_DEFAULT_CACHE = Path('db/osm-context-cache.pkl')

def _pbf_timestamp(pbf_path):
    """Liest das OSM-Versionsdatum aus dem PBF-Header (optional, via osmium)."""
    try:
        import osmium
        rf = osmium.io.Reader(str(pbf_path))
        h = rf.header()
        ts = h.get('osmosis_replication_timestamp', '')
        rf.close()
        return ts or 'unbekannt'
    except Exception:
        return 'unbekannt'


def build_context_cache(pbf_path, cache_path=_DEFAULT_CACHE):
    """
    Phase 1: PBF einmalig parsen und Kontextobjekte als Cache speichern.

    Extrahiert:
      polygons: [(name, ctx_type, osm_id, shapely_polygon)]
                Parks, Spielplätze, Schulen, Sportanlagen, Bäder, Camping,
                Stadtteile (als Polygone, nicht Punkte)
      streets:  [(name, ctx_type, osm_id, shapely_linestring)]
      points:   [(name, ctx_type, osm_id, lat, lng)]
                Punkte (z.B. einzelne benannte Nodes), nur als Fallback

    Kein Netzwerkaufruf — ausschließlich lokale PBF-Verarbeitung.
    """
    try:
        import osmium
        from osmium.geom import WKBFactory
        import shapely.wkb
        from shapely.geometry import Point, LineString
    except ImportError:
        print('FEHLER: pip install osmium shapely', file=sys.stderr)
        sys.exit(1)

    print(f'── PBF: {pbf_path}', file=sys.stderr)
    pbf_ts = _pbf_timestamp(pbf_path)
    print(f'── OSM-Datenstand: {pbf_ts}', file=sys.stderr)

    wkb_fac = WKBFactory()

    class _Handler(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.polygons = []   # (name, ctx_type, osm_id, geom)
            self.streets  = []   # (name, 'street', osm_id, geom)
            self.points   = []   # (name, ctx_type, osm_id, lat, lng)
            self._n_areas = 0
            self._n_ways  = 0
            self._n_nodes = 0

        def area(self, a):
            """Wege und Relations als Polygon-Geometrie."""
            self._n_areas += 1
            if self._n_areas % 100_000 == 0:
                print(f'   … {self._n_areas:,} Flächen verarbeitet …', file=sys.stderr)
            tags = dict(a.tags)
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            ctx_type = classify_osm_tags(tags)
            if not ctx_type:
                return
            if ctx_type == 'street':
                return   # Straßen als Way, nicht als Area
            try:
                wkb  = wkb_fac.create_multipolygon(a)
                geom = shapely.wkb.loads(wkb, hex=True)
                if not geom.is_valid or geom.is_empty:
                    return
                oid = f'{"way" if a.from_way() else "relation"}/{a.orig_id()}'
                self.polygons.append((name, ctx_type, oid, geom))
            except Exception:
                pass

        def way(self, w):
            """Straßen als Linestring-Geometrie."""
            self._n_ways += 1
            tags = dict(w.tags)
            if not tags.get('highway') in _STREET_HIGHWAY:
                return
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            try:
                coords = [(n.location.lon, n.location.lat)
                          for n in w.nodes if n.location.valid()]
                if len(coords) < 2:
                    return
                from shapely.geometry import LineString
                geom = LineString(coords)
                self.streets.append((name, 'street', f'way/{w.id}', geom))
            except Exception:
                pass

        def node(self, n):
            """Benannte Punkte (Schulen, Parks als Nodes, Stadtteile)."""
            self._n_nodes += 1
            tags = dict(n.tags)
            name = (tags.get('name') or tags.get('name:de') or '').strip()
            if not name:
                return
            ctx_type = classify_osm_tags(tags)
            if not ctx_type:
                return
            if ctx_type == 'street':
                return   # Straßen nur als Way
            if ctx_type == 'suburb':
                return   # Stadtteile nur als Polygon (Node = nur Centroid, keine Grenze)
            self.points.append((name, ctx_type, f'node/{n.id}',
                                 n.location.lat, n.location.lon))

    print('── Parsing PBF … (Polygone, Straßen, Punkte)', file=sys.stderr)
    h = _Handler()
    h.apply_file(str(pbf_path), locations=True, idx='flex_mem')

    print(f'── Extrahiert: {len(h.polygons):,} Polygone  '
          f'{len(h.streets):,} Straßen  {len(h.points):,} Punkte', file=sys.stderr)

    cache = {
        'pbf_source': str(pbf_path),
        'pbf_timestamp': pbf_ts,
        'polygons': h.polygons,
        'streets':  h.streets,
        'points':   h.points,
    }
    with open(cache_path, 'wb') as f:
        pickle.dump(cache, f, protocol=5)
    print(f'── Cache gespeichert: {cache_path}', file=sys.stderr)
    return cache


def load_context_cache(cache_path=_DEFAULT_CACHE):
    """Lädt den PBF-Cache und gibt (cache_dict, polygon_tree, street_tree, point_tree) zurück."""
    try:
        from shapely.strtree import STRtree
    except ImportError:
        print('FEHLER: pip install shapely', file=sys.stderr)
        sys.exit(1)

    with open(cache_path, 'rb') as f:
        cache = pickle.load(f)

    print(f'── Cache geladen: {cache_path}', file=sys.stderr)
    print(f'   PBF-Quelle:   {cache["pbf_source"]}', file=sys.stderr)
    print(f'   OSM-Datenstand: {cache["pbf_timestamp"]}', file=sys.stderr)
    print(f'   Polygone: {len(cache["polygons"]):,}  '
          f'Straßen: {len(cache["streets"]):,}  '
          f'Punkte: {len(cache["points"]):,}', file=sys.stderr)

    poly_geoms  = [p[3] for p in cache['polygons']]
    street_geoms = [s[3] for s in cache['streets']]
    point_geoms  = []  # für Punkte verwenden wir Bounding-Box-Suche

    poly_tree   = STRtree(poly_geoms)   if poly_geoms   else None
    street_tree = STRtree(street_geoms) if street_geoms else None

    return cache, poly_tree, street_tree


def _deg_per_meter():
    """Näherung: 1 m ≈ 0.000009° (gilt für Deutschland gut genug für Bbox-Vorfilter)."""
    return 0.000009


def find_best_context_pbf(cand_lat, cand_lng, cache, poly_tree, street_tree):
    """
    Findet den besten Kontext für einen Kandidaten — ausschließlich lokal.

    Priorität:
      1. Polygon-Enthaltensein (contains)      — höchste Priorität
      2. Nächstes benanntes Polygon/Punkt (nearest) innerhalb max_dist_m
      3. Nächste Straße (street) Punkt→Linie ≤ 60 m
      4. Stadtteile nur via Polygon-Enthaltensein (administrative)
         → KEIN Distanz-Fallback für suburb

    Restaurants, Geschäfte, allgemeine POIs werden nicht berücksichtigt
    (classify_osm_tags() gibt None zurück).
    """
    from shapely.geometry import Point

    cand_pt  = Point(cand_lng, cand_lat)
    deg      = _deg_per_meter()

    candidates = []   # (method_rank, priority, dist_m, enrichment_dict)
    METHOD_RANK = {'contains': 0, 'nearest': 1, 'street': 2, 'administrative': 3}

    # ── 1. Polygon-Enthaltensein ───────────────────────────────────────────────
    if poly_tree:
        polys = cache['polygons']
        # Suchbox: groß genug für alle Polygon-Typen (max max_dist_m = 300 m)
        search_box = cand_pt.buffer(300 * deg * 2)
        for idx in poly_tree.query(search_box):
            name, ctx_type, oid, geom = polys[idx]
            cfg = CONTEXT_CONFIG.get(ctx_type)
            if not cfg:
                continue

            priority, max_dist_m = cfg

            if geom.contains(cand_pt):
                # Echtes Enthaltensein — Distanz = Centroid zum Kandidaten (für Konfidenz)
                centroid    = geom.centroid
                dist_deg    = centroid.distance(cand_pt)
                dist_m      = dist_deg / deg
                method      = 'contains' if ctx_type != 'suburb' else 'administrative'
                conf_dist_m = max_dist_m if max_dist_m else 5000
                confidence  = compute_confidence(method, dist_m, conf_dist_m)
                candidates.append((
                    METHOD_RANK[method], priority, dist_m,
                    {
                        'context_name':          name,
                        'context_type':          ctx_type,
                        'context_osm_id':        oid,
                        'context_distance_m':    int(dist_m),
                        'context_method':        method,
                        'context_confidence':    confidence,
                        'enriched_display_name': derive_display_name(ctx_type, name),
                        'enriched_name_source':  f'osm_{ctx_type}',
                    }
                ))
                continue

            # ── 2. Nearest (kein Enthaltensein, aber in der Nähe) ─────────────
            if ctx_type == 'suburb':
                continue   # suburb: NUR via Enthaltensein, kein nearest

            if max_dist_m is None:
                continue

            centroid = geom.centroid
            dist_m   = haversine_m(cand_lat, cand_lng,
                                    centroid.y, centroid.x)
            if dist_m > max_dist_m:
                continue

            confidence = compute_confidence('nearest', dist_m, max_dist_m)
            candidates.append((
                METHOD_RANK['nearest'], priority, dist_m,
                {
                    'context_name':          name,
                    'context_type':          ctx_type,
                    'context_osm_id':        oid,
                    'context_distance_m':    int(dist_m),
                    'context_method':        'nearest',
                    'context_confidence':    confidence,
                    'enriched_display_name': derive_display_name(ctx_type, name),
                    'enriched_name_source':  f'osm_{ctx_type}',
                }
            ))

    # ── 3. Punkt-POIs (Schulen, Parks als Nodes) ──────────────────────────────
    for name, ctx_type, oid, pt_lat, pt_lng in cache['points']:
        cfg = CONTEXT_CONFIG.get(ctx_type)
        if not cfg:
            continue
        priority, max_dist_m = cfg
        if max_dist_m is None:
            continue
        dist_m = haversine_m(cand_lat, cand_lng, pt_lat, pt_lng)
        if dist_m > max_dist_m:
            continue
        confidence = compute_confidence('nearest', dist_m, max_dist_m)
        candidates.append((
            METHOD_RANK['nearest'], priority, dist_m,
            {
                'context_name':          name,
                'context_type':          ctx_type,
                'context_osm_id':        oid,
                'context_distance_m':    int(dist_m),
                'context_method':        'nearest',
                'context_confidence':    confidence,
                'enriched_display_name': derive_display_name(ctx_type, name),
                'enriched_name_source':  f'osm_{ctx_type}',
            }
        ))

    # ── 4. Straßen: Punkt→Linie-Distanz ──────────────────────────────────────
    street_max = CONTEXT_CONFIG['street'][1]  # 60 m
    if street_tree:
        streets   = cache['streets']
        box_deg   = street_max * deg * 1.5
        search_box = cand_pt.buffer(box_deg)
        for idx in street_tree.query(search_box):
            name, _, oid, geom = streets[idx]
            # Echte Punkt→Linie-Distanz (Lot-Abstand, nicht Centroid)
            dist_deg = geom.distance(cand_pt)
            dist_m   = dist_deg / deg
            if dist_m > street_max:
                continue
            confidence = compute_confidence('street', dist_m, street_max)
            candidates.append((
                METHOD_RANK['street'], CONTEXT_CONFIG['street'][0], dist_m,
                {
                    'context_name':          name,
                    'context_type':          'street',
                    'context_osm_id':        oid,
                    'context_distance_m':    int(dist_m),
                    'context_method':        'street',
                    'context_confidence':    confidence,
                    'enriched_display_name': derive_display_name('street', name),
                    'enriched_name_source':  'osm_street',
                }
            ))

    if not candidates:
        return None

    # Sortierung: method_rank ASC, priority ASC, dist_m ASC
    candidates.sort(key=lambda x: (x[0], x[1], x[2]))
    return candidates[0][3]


# ══════════════════════════════════════════════════════════════════════════════
# AUSGABE  (CSV + JSON)
# ══════════════════════════════════════════════════════════════════════════════

_CSV_FIELDS = [
    'external_id', 'lat', 'lng', 'osm_name',
    'context_name', 'context_type', 'context_osm_id',
    'context_distance_m', 'context_method', 'context_confidence',
    'enriched_display_name', 'enriched_name_source',
]

def _write_csv_row(writer, r):
    e = r.get('enrichment') or {}
    writer.writerow({
        'external_id':          r['external_id'],
        'lat':                  f"{r['lat']:.6f}",
        'lng':                  f"{r['lng']:.6f}",
        'osm_name':             r['osm_name'],
        'context_name':         e.get('context_name', ''),
        'context_type':         e.get('context_type', ''),
        'context_osm_id':       e.get('context_osm_id', ''),
        'context_distance_m':   e.get('context_distance_m', ''),
        'context_method':       e.get('context_method', ''),
        'context_confidence':   e.get('context_confidence', ''),
        'enriched_display_name': e.get('enriched_display_name', ''),
        'enriched_name_source': e.get('enriched_name_source', ''),
    })


def load_already_done(out_path):
    """Liest externe IDs aus bestehender CSV (für --resume)."""
    done = set()
    p = Path(out_path)
    if not p.exists():
        return done
    with open(p, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row.get('external_id'):
                done.add(row['external_id'])
    return done


# ══════════════════════════════════════════════════════════════════════════════
# REPORT
# ══════════════════════════════════════════════════════════════════════════════

def _print_report(results):
    total    = len(results)
    enriched = [r for r in results if r['enrichment']]
    fallback = [r for r in results if not r['enrichment']]

    by_type   = defaultdict(list)
    by_method = defaultdict(list)
    dists_by_type = defaultdict(list)
    for r in enriched:
        e = r['enrichment']
        by_type[e['context_type']].append(r)
        by_method[e['context_method']].append(r)
        d = e['context_distance_m']
        if d is not None:
            dists_by_type[e['context_type']].append(d)

    print('\n' + '═' * 78)
    print(f'ENRICHMENT AUSWERTUNG  —  {total} Kandidaten')
    print('═' * 78)

    print(f'\n■ Ergebnis gesamt')
    print(f'  Mit Kontext: {len(enriched)} ({100*len(enriched)/max(1,total):.0f} %)')
    print(f'  Fallback:    {len(fallback)} ({100*len(fallback)/max(1,total):.0f} %)')

    print('\n■ Methoden')
    for method in ('contains', 'nearest', 'street', 'administrative'):
        n = len(by_method.get(method, []))
        if n:
            print(f'  {method:16s} {n:5d} ({100*n/max(1,total):.0f} %)')

    print('\n■ Kontexttypen + Distanzstatistik')
    hdr = f'  {"Typ":<14} {"Anzahl":>6}  {"min_m":>6}  {"med_m":>6}  {"max_m":>6}'
    print(hdr)
    print('  ' + '─' * 46)
    for ctx_type in sorted(by_type, key=lambda t: -len(by_type[t])):
        n    = len(by_type[ctx_type])
        ds   = sorted(dists_by_type.get(ctx_type, []))
        if ds:
            med  = ds[len(ds) // 2]
            s_dist = f'{ds[0]:>6.0f}  {med:>6.0f}  {ds[-1]:>6.0f}'
        else:
            s_dist = f'{"—":>6}  {"—":>6}  {"—":>6}'
        print(f'  {ctx_type:<14} {n:>6}  {s_dist}')

    print('\n■ Stichprobe — Treffer (erste 30)')
    hdr2 = (f'  {"OSM-Name":<22} {"Typ":<13} {"Methode":<15} {"Dist":>5}  '
            f'{"Konf":>5}  Anzeigename')
    print(hdr2)
    print('  ' + '─' * 100)
    for r in enriched[:30]:
        e = r['enrichment']
        orig = r['osm_name'][:21]
        dist_str = f"{e['context_distance_m']:4d}m" if e['context_distance_m'] is not None else 'enth.'
        print(f"  {orig:<22} {e['context_type']:<13} {e['context_method']:<15} "
              f"{dist_str:>6}  {e['context_confidence']:>5.2f}  "
              f"{e['enriched_display_name'][:50]}")

    if fallback:
        print(f'\n■ Fallback — kein Kontext ({len(fallback)} Kandidaten)')
        for r in fallback[:15]:
            print(f"  {r['external_id']}  {r['lat']:.4f},{r['lng']:.4f}  ({r['osm_name']})")

    # Grammatisch verdächtige Namen
    suspicious = []
    for r in enriched:
        dn = r['enrichment']['enriched_display_name']
        # Prüfung auf häufige Dopplungen und Fehlformen
        issues = []
        lower = dn.lower()
        if 'campingplatz campingplatz' in lower:
            issues.append('Dopplung "Campingplatz"')
        if 'an der ' in lower:
            # Prüfe, ob das Wort nach "an der" ein bekanntes Maskulinum/Neutrum ist
            rest = dn.split('an der ', 1)[-1].lower()
            bad_endings = ('weg', 'platz', 'park', 'feld', 'damm', 'ring', 'berg',
                           'pfad', 'stieg', 'hof', 'dorf')
            if any(rest.endswith(e2) for e2 in bad_endings):
                issues.append(f'"an der" bei mask./neutr. Suffix')
        if issues:
            suspicious.append((dn, ', '.join(issues)))

    if suspicious:
        print(f'\n■ Grammatisch prüfenswert ({len(suspicious)})')
        for name, issue in suspicious[:20]:
            print(f'  [{issue}] {name}')

    print('\n' + '═' * 78)


# ══════════════════════════════════════════════════════════════════════════════
# PBF-MODUS  (Hauptlauf)
# ══════════════════════════════════════════════════════════════════════════════

def run_pbf_mode(args):
    cache_path = Path(args.cache or _DEFAULT_CACHE)

    # Cache bauen oder laden
    if args.build_cache or not cache_path.exists():
        if not args.pbf:
            print('FEHLER: --pbf PATH ist erforderlich.', file=sys.stderr)
            sys.exit(1)
        build_context_cache(args.pbf, cache_path)

    cache, poly_tree, street_tree = load_context_cache(cache_path)

    # Kandidaten laden
    print(f'── Lade Kandidaten aus {args.input} …', file=sys.stderr)
    with open(args.input, encoding='utf-8') as f:
        raw = json.load(f)
    elements = raw.get('elements', raw) if isinstance(raw, dict) else raw

    sample = sample_candidates(elements, args.limit) if args.limit else elements
    print(f'── {len(sample)} Kandidaten', file=sys.stderr)

    # Resume: bereits verarbeitete überspringen
    already_done = set()
    if args.resume and args.out:
        already_done = load_already_done(args.out)
        if already_done:
            print(f'── Resume: {len(already_done)} bereits verarbeitet, werden übersprungen.',
                  file=sys.stderr)

    # CSV öffnen (append wenn resume, sonst neu)
    csv_file   = None
    csv_writer = None
    if args.out:
        mode = 'a' if (args.resume and Path(args.out).exists()) else 'w'
        csv_file = open(args.out, mode, newline='', encoding='utf-8')
        csv_writer = csv.DictWriter(csv_file, fieldnames=_CSV_FIELDS)
        if mode == 'w':
            csv_writer.writeheader()

    results = []
    n_skip  = 0
    try:
        for i, el in enumerate(sample, 1):
            cand_lat = el.get('lat') or (el.get('center') or {}).get('lat')
            cand_lon = el.get('lon') or (el.get('center') or {}).get('lon')
            if cand_lat is None or cand_lon is None:
                continue
            cand_lat = float(cand_lat)
            cand_lng = float(cand_lon)

            el_type    = el.get('type', 'node')
            el_id      = el.get('id', 0)
            external_id = f'{el_type}/{el_id}'
            tags       = el.get('tags') or {}
            osm_name   = original_osm_name(tags)

            if external_id in already_done:
                n_skip += 1
                continue

            enrichment = find_best_context_pbf(
                cand_lat, cand_lng, cache, poly_tree, street_tree
            )

            r = {
                'external_id': external_id,
                'lat': cand_lat, 'lng': cand_lng,
                'osm_name': osm_name,
                'enrichment': enrichment,
            }
            results.append(r)

            if csv_writer:
                _write_csv_row(csv_writer, r)

            if i % 500 == 0:
                print(f'   … {i}/{len(sample)} verarbeitet …', file=sys.stderr)

    finally:
        if csv_file:
            csv_file.close()

    if n_skip:
        print(f'── {n_skip} Kandidaten übersprungen (--resume).', file=sys.stderr)

    if args.out:
        print(f'── Ergebnisse gespeichert: {args.out}', file=sys.stderr)

    _print_report(results)

    if args.write:
        if not args.supabase_url or not args.supabase_key:
            print('\nFEHLER: --supabase-url und --supabase-key erforderlich für --write',
                  file=sys.stderr)
            sys.exit(1)
        _write_to_supabase(results, args)


# ══════════════════════════════════════════════════════════════════════════════
# OVERPASS-MODUS  (nur für kleine Tests, NICHT für Produktionslauf)
# ══════════════════════════════════════════════════════════════════════════════
# Für 19.206 Kandidaten nicht geeignet — erzeugt 19.206 Netzwerkabfragen.
# Datenqualität eingeschränkt: around: liefert nur Mittelpunkte, keine
# echten Polygon-Geometrien → 'contains' ist eine Näherung.

import socket as _socket
import urllib.error
import urllib.parse
import urllib.request

_OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
]

_OVERPASS_AROUND_RADIUS = 1600

_OVERPASS_AROUND_TMPL = (
    '[out:json][timeout:20];'
    '('
    'nwr["leisure"~"^(park|playground|sports_centre|swimming_pool|garden|recreation_ground)$"]'
    '   ["name"](around:{r},{lat},{lng});'
    'nwr["amenity"~"^(school|university|college|kindergarten)$"]["name"](around:{r},{lat},{lng});'
    'nwr["landuse"~"^(park|sport)$"]["name"](around:{r},{lat},{lng});'
    'nwr["tourism"="camp_site"]["name"](around:{r},{lat},{lng});'
    'way["highway"~"^(residential|living_street|service|footway|pedestrian|'
    '    unclassified|tertiary|track|path|cycleway|secondary)$"]'
    '   ["name"](around:80,{lat},{lng});'
    'nwr["place"~"^(suburb|neighbourhood|quarter)$"]["name"](around:{r},{lat},{lng});'
    ');'
    'out center;'
)

def _overpass_request(query, delay=3):
    body = ('data=' + urllib.parse.quote(query)).encode()
    last_err = None
    for endpoint in _OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(
                endpoint, data=body, method='POST',
                headers={
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent':   'PlattenTreff-Enrich/2.0',
                }
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                remark = data.get('remark', '')
                if remark:
                    print(f'   [Overpass: {remark[:80]}]', file=sys.stderr)
                time.sleep(delay)
                return data
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                time.sleep(10)
        except (_socket.timeout, OSError) as e:
            last_err = e
    raise RuntimeError(f'Overpass fehlgeschlagen: {last_err}')


def _parse_overpass_context(data):
    objects = []
    for el in data.get('elements', []):
        tags = el.get('tags') or {}
        name = (tags.get('name') or tags.get('name:de') or '').strip()
        if not name:
            continue
        ctx_type = classify_osm_tags(tags)
        if not ctx_type:
            continue
        center = el.get('center') or {}
        lat = el.get('lat') or center.get('lat')
        lon = el.get('lon') or center.get('lon')
        if lat is None or lon is None:
            continue
        ot  = el.get('type', 'node')
        eid = el.get('id', 0)
        objects.append({
            'name': name, 'type': ctx_type,
            'osm_id': f'{ot}/{eid}',
            'lat': float(lat), 'lng': float(lon),
        })
    return objects


def _find_best_context_overpass(cand_lat, cand_lng, ctx_objects):
    """Overpass-Näherung: keine echten Polygone; contains = Abstand ≤ contain_radius."""
    _CONTAIN_RADIUS = {'park': 150, 'playground': 40, 'school': 80, 'kindergarten': 50,
                       'sports': 100, 'pool': 60, 'camping': 100, 'recreation': 120,
                       'square': 40}
    METHOD_RANK = {'contains': 0, 'nearest': 1, 'street': 2, 'administrative': 3}

    candidates = []
    for obj in ctx_objects:
        ctx_type = obj['type']
        cfg = CONTEXT_CONFIG.get(ctx_type)
        if not cfg:
            continue
        priority, max_dist_m = cfg
        if max_dist_m is None:
            continue
        dist_m = haversine_m(cand_lat, cand_lng, obj['lat'], obj['lng'])
        if dist_m > max_dist_m:
            continue
        cr = _CONTAIN_RADIUS.get(ctx_type, 0)
        if cr > 0 and dist_m <= cr:
            method = 'contains'
        elif ctx_type == 'suburb':
            method = 'administrative'
        elif ctx_type == 'street':
            method = 'street'
        else:
            method = 'nearest'
        conf = compute_confidence(method, dist_m, max_dist_m)
        candidates.append((METHOD_RANK[method], priority, dist_m, {
            'context_name':          obj['name'],
            'context_type':          ctx_type,
            'context_osm_id':        obj['osm_id'],
            'context_distance_m':    int(dist_m),
            'context_method':        method,
            'context_confidence':    conf,
            'enriched_display_name': derive_display_name(ctx_type, obj['name']),
            'enriched_name_source':  f'osm_{ctx_type}',
        }))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x[0], x[1], x[2]))
    return candidates[0][3]


def run_overpass_mode(args):
    print('HINWEIS: Overpass-Modus — nur für Tests mit wenigen Kandidaten geeignet.',
          file=sys.stderr)
    print(f'         {args.limit} Kandidaten → {args.limit} HTTP-Abfragen an öffentliche API.',
          file=sys.stderr)

    with open(args.input, encoding='utf-8') as f:
        raw = json.load(f)
    elements = raw.get('elements', raw) if isinstance(raw, dict) else raw

    sample = sample_candidates(elements, args.limit)
    print(f'── {len(sample)} Kandidaten', file=sys.stderr)

    csv_file   = None
    csv_writer = None
    if args.out:
        csv_file = open(args.out, 'w', newline='', encoding='utf-8')
        csv_writer = csv.DictWriter(csv_file, fieldnames=_CSV_FIELDS)
        csv_writer.writeheader()

    results = []
    try:
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

            print(f'   [{i:3d}/{len(sample)}] {el_type}/{el_id} …', file=sys.stderr, end='')
            try:
                q = _OVERPASS_AROUND_TMPL.format(
                    lat=f'{cand_lat:.6f}', lng=f'{cand_lng:.6f}', r=_OVERPASS_AROUND_RADIUS
                )
                ctx_objects = _parse_overpass_context(_overpass_request(q))
                enrichment  = _find_best_context_overpass(cand_lat, cand_lng, ctx_objects)
                tag = (f' → {enrichment["enriched_display_name"][:55]}'
                       if enrichment else ' → (kein Kontext)')
                print(tag, file=sys.stderr)
            except Exception as e:
                print(f' FEHLER: {e}', file=sys.stderr)
                enrichment = None

            r = {
                'external_id': f'{el_type}/{el_id}',
                'lat': cand_lat, 'lng': cand_lng,
                'osm_name': osm_name, 'enrichment': enrichment,
            }
            results.append(r)
            if csv_writer:
                _write_csv_row(csv_writer, r)
    finally:
        if csv_file:
            csv_file.close()

    if args.out:
        print(f'── Ergebnisse: {args.out}', file=sys.stderr)

    _print_report(results)

    if args.write:
        print('FEHLER: --write im Overpass-Modus nicht unterstützt. '
              'Bitte PBF-Modus verwenden.', file=sys.stderr)
        sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE SCHREIBEN  (nach manueller Prüfung der CSV)
# ══════════════════════════════════════════════════════════════════════════════

def _write_to_supabase(results, args):
    """PATCH enriched_* Felder in table_candidates per external_id."""
    import datetime

    base_url = args.supabase_url.rstrip('/')
    headers  = {
        'Content-Type':  'application/json',
        'apikey':        args.supabase_key,
        'Authorization': f'Bearer {args.supabase_key}',
        'Prefer':        'return=minimal',
    }

    ok_count  = 0
    err_count = 0
    ts_now    = datetime.datetime.utcnow().isoformat() + 'Z'

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
            'enriched_at':           ts_now,
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

        if (ok_count + err_count) % 500 == 0:
            print(f'  … {ok_count} OK, {err_count} Fehler', file=sys.stderr)

    print(f'── Supabase: {ok_count} geschrieben, {err_count} Fehler.')


# ══════════════════════════════════════════════════════════════════════════════
# main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    p = argparse.ArgumentParser(
        description='Räumliche Kontextanreicherung für TT-Kandidaten (v2)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument('--mode', choices=['pbf', 'overpass'], default='pbf',
        help='Datenquelle (Standard: pbf)')
    p.add_argument('--pbf', metavar='PATH',
        help='Geofabrik-PBF-Datei (für --mode pbf)')
    p.add_argument('--build-cache', action='store_true',
        help='PBF-Cache (db/osm-context-cache.pkl) neu bauen auch wenn vorhanden')
    p.add_argument('--cache', metavar='PATH',
        help=f'Cache-Pfad (Standard: {_DEFAULT_CACHE})')
    p.add_argument('--input', default='db/export.json', metavar='PATH',
        help='Kandidaten-JSON (Standard: db/export.json)')
    p.add_argument('--limit', type=int, default=0, metavar='N',
        help='Maximale Kandidatenzahl (0 = alle, Standard: 0)')
    p.add_argument('--out', metavar='PATH',
        help='Ausgabe-CSV (empfohlen; ohne: nur Konsolenreport)')
    p.add_argument('--resume', action='store_true',
        help='Bereits in --out vorhandene external_ids überspringen')
    p.add_argument('--write', action='store_true',
        help='Ergebnisse in Supabase schreiben (Standard: Dry-Run)')
    p.add_argument('--supabase-url', metavar='URL',
        help='Supabase REST URL (für --write)')
    p.add_argument('--supabase-key', metavar='KEY',
        help='Service-Role-Key (für --write; NIE committen!)')

    args = p.parse_args()

    if args.mode == 'overpass':
        if not args.limit:
            args.limit = 20
            print(f'HINWEIS: --limit auf {args.limit} gesetzt (Overpass-Modus).',
                  file=sys.stderr)
        run_overpass_mode(args)
    else:
        run_pbf_mode(args)


if __name__ == '__main__':
    main()
