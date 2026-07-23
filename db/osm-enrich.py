#!/usr/bin/env python3
"""
db/osm-enrich.py  v4
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
  1. Polygon-Enthaltensein (alle Typen, Centroid-Distanz ≤ max_dist_m)
  2. Straße: kürzeste Distanz Punkt→Linie ≤ 60 m
  3. Schule / Kindergarten: Centroid-Distanz ≤ 500 m
  4. Park: Centroid-Distanz ≤ 500 m
  5. Administrative Grenze (place=suburb/neighbourhood/…): nur via Polygon-Enthaltensein
  6. Fallback "Tischtennisplatte" (kein plausibler Kontext)

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

    # Friedhöfe: eigener Kontexttyp, nur via contains erlaubt
    name_lower = (tags.get('name', '') or '').lower()
    if amenity == 'grave_yard' or landuse == 'cemetery':
        return 'cemetery' if name_lower else None  # nur benannte Friedhöfe
    if 'friedhof' in name_lower:
        return 'cemetery'  # fängt Fälle wo Friedhof als Park/Garten getaggt ist

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
        return 'sports'
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

# Straßen/Objektnamen die bereits einen Artikel enthalten → Gedankenstrich
_ARTICLE_PREFIXES = (
    'am ', 'an der ', 'an den ', 'auf dem ', 'auf der ',
    'im ', 'in der ', 'in den ', 'zum ', 'zur ', 'beim ',
)

def _street_name(name):
    """Wählt die richtige Artikel-Form für den Straßennamen."""
    lower = name.lower()
    # Doppelten Artikel verhindern: "Am Rothhügel" → Gedankenstrichform
    if any(lower.startswith(p) for p in _ARTICLE_PREFIXES):
        return f'Tischtennisplatte – {name}'
    if any(lower.endswith(s) for s in _STREET_FEMININE):
        return f'Tischtennisplatte an der {name}'
    if any(lower.endswith(s) for s in _STREET_MASC_NEUT):
        return f'Tischtennisplatte am {name}'
    # Unbekannter Typ (Ortsname, Abkürzung, fremdsprachlich): neutral
    return f'Tischtennisplatte – {name}'


def _playground_name(name):
    """Spielplatz: 'beim Spielplatz „Name„' außer Name beginnt bereits mit Spielplatz."""
    if name.lower().startswith('spielplatz'):
        return f'Tischtennis am {name}'
    return f'Tischtennis beim Spielplatz „{name}“'

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

# Substantive die auf feminine Institutionsnamen hinweisen → "an der"
_FEMININE_INSTITUTIONS = (
    'schule', 'halle', 'universität', 'akademie', 'hochschule',
    'einrichtung', 'stätte', 'kirche', 'klinik', 'bibliothek',
)
# Substantive die auf maskuline/neutrale Institutionsnamen hinweisen → "am"
_MASC_NEUT_INSTITUTIONS = (
    'kindergarten', 'hort', 'heim', 'haus', 'garten', 'hof',
    'treff', 'zentrum', 'park', 'forum', 'campus', 'stadion',
    'gelände', 'platz',
)

def _article_for_institution(name):
    """Gibt 'an der' (feminin) oder 'am' (maskulin/neutral/unbekannt) zurück."""
    lower = name.lower()
    if any(s in lower for s in _FEMININE_INSTITUTIONS):
        return 'an der'
    if any(s in lower for s in _MASC_NEUT_INSTITUTIONS):
        return 'am'
    return 'am'   # Im Zweifel neutrale Form

def _school_name(name):
    art = _article_for_institution(name)
    return f'Tischtennis {art} {name}'

# Park-Endungen — nur sichere Fälle; unbekannte Endungen → Gedankenstrich.
# Genus-Regel: Deutsch bestimmt Genus durch den Kopf (letztes Wort im Kompositum).
# Für Bindestrich-Namen ("Seinäjoki-Park") ist das letzte Segment maßgeblich.
# Für Leerzeichen-Namen ohne Treffer im letzten Segment ("Ringpark Sanderglacis")
# wird als Fallback das gesamte Wortfeld auf "im"-Endungen geprüft.
_PARK_IM_ENDINGS = (
    'park', 'garten', 'wäldchen', 'wald', 'hain', 'tälchen', 'tal',
    'holz', 'forst',
)
_PARK_AM_ENDINGS = (
    'platz', 'hof', 'see', 'berg', 'damm', 'ring',
)
_PARK_AN_DER_ENDINGS = (
    'insel', 'wiese', 'aue', 'allee', 'promenade', 'anlage',
)
_PARK_PLURAL_ENDINGS = (
    'anlagen', 'wiesen', 'auen', 'höfe', 'gründe', 'felder',
)


def _park_name(name):
    """Artikel für Park/Grünfläche — nur wenn sicher bestimmbar, sonst Gedankenstrich."""
    lower = name.lower()
    # Pluralformen → Gedankenstrich
    if any(lower.endswith(s) for s in _PARK_PLURAL_ENDINGS):
        return f'Tischtennis – {name}'
    # Namen mit eingebettetem Artikel → kein weiterer Artikel (doppelter Artikel)
    if any(lower.startswith(p) for p in _ARTICLE_PREFIXES):
        return f'Tischtennis – {name}'

    # Genus: letztes Wort des letzten Bindestrich-Segments entscheidet
    last_seg  = lower.split('-')[-1].strip()
    last_word = last_seg.split()[-1] if last_seg.split() else lower

    if any(last_word.endswith(s) for s in _PARK_IM_ENDINGS):
        return f'Tischtennis im {name}'
    if any(last_word.endswith(s) for s in _PARK_AM_ENDINGS):
        return f'Tischtennis am {name}'
    if any(last_word.endswith(s) for s in _PARK_AN_DER_ENDINGS):
        return f'Tischtennis an der {name}'

    # Fallback: alle Wörter auf "im"-Endungen prüfen
    # (fängt "Ringpark Sanderglacis" — "park" steckt im ersten Wort)
    all_words = lower.replace('-', ' ').split()
    if any(w.endswith(s) for w in all_words for s in _PARK_IM_ENDINGS):
        return f'Tischtennis im {name}'

    # Unbekanntes Geschlecht → neutral
    return f'Tischtennis – {name}'


def derive_display_name(ctx_type, ctx_name):
    """Erzeugt den Anzeigenamen aus Kontexttyp und OSM-Name."""
    if ctx_type == 'cemetery':
        return f'Tischtennisplatte – {ctx_name}'
    if ctx_type == 'park':
        return _park_name(ctx_name)
    if ctx_type == 'playground':
        return _playground_name(ctx_name)
    if ctx_type in ('school', 'kindergarten'):
        return _school_name(ctx_name)
    if ctx_type == 'sports':
        return f'Tischtennis {_article_for_institution(ctx_name)} {ctx_name}'
    if ctx_type == 'pool':
        return _pool_name(ctx_name)
    if ctx_type == 'camping':
        return _camping_name(ctx_name)
    if ctx_type == 'recreation':
        return _park_name(ctx_name)
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
    # priority: bestimmt die Reihenfolge innerhalb gleicher Methode (niedriger = besser)
    # Prioritätsreihenfolge gesamt: contains > nearest ≤ 100m > street ≤ 150m > administrative
    # Für nearest: 1=Schule/Kita, 2=Spielplatz/Sport/Pool, 3=Camping/Recreation/Square/Cemetery, 4=Park
    'school':       (1,  500),   # centroid-cap für contains; nearest ≤ NEAREST_HARD_CAP_M
    'kindergarten': (1,   80),
    'playground':   (2,   80),
    'sports':       (2,  150),
    'pool':         (2,  100),
    'camping':      (3,  150),
    'recreation':   (3,  200),
    'square':       (3,   80),
    'cemetery':     (3, None),   # nur via contains; nearest nie erlaubt
    'park':         (4,  500),
    'street':       (1,  150),   # 0–60m: normale Konfidenz + Artikel; 60–150m: street_extended
    'suburb':       (5, None),   # nur via Polygon-Enthaltensein
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


def _deg_per_meter(lat=51.0):
    """Gibt (lat_dpm, lng_dpm) zurück — cosinus-korrigiert für Längengrad."""
    lat_dpm = 0.000009          # ≈ 1/111111 (Breitengrad, konstant)
    lng_dpm = lat_dpm / math.cos(math.radians(lat))
    return lat_dpm, lng_dpm


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
    from shapely.geometry import Point, box as make_box

    cand_pt       = Point(cand_lng, cand_lat)
    lat_dpm, lng_dpm = _deg_per_meter(cand_lat)

    candidates = []   # (method_rank, priority, dist_m, enrichment_dict)
    # Priorität: contains > nearest ≤ 100m > street ≤ 150m > administrative
    METHOD_RANK = {'contains': 0, 'nearest': 1, 'street': 2, 'administrative': 3}
    # Maximale Distanz für nearest-Kontext — unabhängig vom Typ
    NEAREST_HARD_CAP_M = 100
    # Straße: normale Konfidenz + Artikel ≤ 60m; Gedankenstrich + niedrigere Konfidenz 60-150m
    STREET_NORMAL_MAX_M = 60

    # Rechteckige Suchbox: cos-korrigiert, kein redundanter *2-Faktor
    _max_search_m = max(v[1] for v in CONTEXT_CONFIG.values() if v[1])
    _margin_m     = _max_search_m + 100
    _lat_buf      = _margin_m * lat_dpm
    _lng_buf      = _margin_m * lng_dpm

    # ── 1. Polygon-Enthaltensein ───────────────────────────────────────────────
    if poly_tree:
        polys = cache['polygons']
        search_box = make_box(
            cand_pt.x - _lng_buf, cand_pt.y - _lat_buf,
            cand_pt.x + _lng_buf, cand_pt.y + _lat_buf,
        )
        for idx in poly_tree.query(search_box):
            name, ctx_type, oid, geom = polys[idx]
            cfg = CONTEXT_CONFIG.get(ctx_type)
            if not cfg:
                continue

            priority, max_dist_m = cfg

            if geom.contains(cand_pt):
                # Echtes Enthaltensein — Distanz = Centroid zum Kandidaten (haversine)
                centroid    = geom.centroid
                dist_m      = haversine_m(cand_lat, cand_lng, centroid.y, centroid.x)
                # Centroid-Distanz-Cap: sehr große Polygone (z.B. riesige Uni-Campus)
                # werden übersprungen wenn Centroid weiter als max_dist_m entfernt ist
                if max_dist_m and dist_m > max_dist_m:
                    continue
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
            if ctx_type in ('suburb', 'cemetery'):
                continue   # nur via Polygon-Enthaltensein, nie nearest

            if max_dist_m is None:
                continue

            centroid = geom.centroid
            dist_m   = haversine_m(cand_lat, cand_lng,
                                    centroid.y, centroid.x)
            if dist_m > min(max_dist_m, NEAREST_HARD_CAP_M):
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
        if dist_m > min(max_dist_m, NEAREST_HARD_CAP_M):
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

    # ── 4. Straßen: Punkt→Linie-Distanz (bis 150 m) ─────────────────────────
    # 0–60m:   normale Konfidenz + Artikel-Formatierung
    # 60–150m: Gedankenstrich-Form + niedrigere Konfidenz + source=street_extended
    street_max = CONTEXT_CONFIG['street'][1]  # 150 m
    if street_tree:
        streets    = cache['streets']
        _s_lat_buf = street_max * 1.5 * lat_dpm
        _s_lng_buf = street_max * 1.5 * lng_dpm
        search_box = make_box(
            cand_pt.x - _s_lng_buf, cand_pt.y - _s_lat_buf,
            cand_pt.x + _s_lng_buf, cand_pt.y + _s_lat_buf,
        )
        for idx in street_tree.query(search_box):
            name, _, oid, geom = streets[idx]
            # Echte Punkt→Linie-Distanz via nächstem Punkt (haversine)
            nearest_pt = geom.interpolate(geom.project(cand_pt))
            dist_m = haversine_m(cand_lat, cand_lng, nearest_pt.y, nearest_pt.x)
            if dist_m > street_max:
                continue
            is_extended = dist_m > STREET_NORMAL_MAX_M
            if is_extended:
                display_name = f'Tischtennisplatte – {name}'
                name_source  = 'osm_street_extended'
                # Niedrigere Konfidenz: 0.40 → 0.30 über 60–150m
                confidence = round(max(0.10, 0.40 - 0.10 * (dist_m - STREET_NORMAL_MAX_M)
                                       / max(1, street_max - STREET_NORMAL_MAX_M)), 2)
            else:
                display_name = derive_display_name('street', name)
                name_source  = 'osm_street'
                confidence   = compute_confidence('street', dist_m, STREET_NORMAL_MAX_M)
            candidates.append((
                METHOD_RANK['street'], CONTEXT_CONFIG['street'][0], dist_m,
                {
                    'context_name':          name,
                    'context_type':          'street',
                    'context_osm_id':        oid,
                    'context_distance_m':    int(dist_m),
                    'context_method':        'street',
                    'context_confidence':    confidence,
                    'enriched_display_name': display_name,
                    'enriched_name_source':  name_source,
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
        issues = []
        lower = dn.lower()
        if 'campingplatz campingplatz' in lower:
            issues.append('Dopplung "Campingplatz"')
        if 'an der ' in lower:
            # Nur das ERSTE Wort nach "an der" prüfen (nicht verschachtelte Präpositionen)
            rest = dn.split('an der ', 1)[-1]
            first_word = rest.split()[0].lower().rstrip('.,;') if rest.split() else ''
            masc_neut = ('weg', 'damm', 'ring', 'berg', 'hof', 'hort',
                         'heim', 'treff', 'park', 'platz', 'garten', 'campus')
            if any(first_word.endswith(s) for s in masc_neut):
                issues.append(f'"an der" vor mask./neutr.: {first_word}')
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
        if not args.supabase_url:
            print('\nFEHLER: --supabase-url erforderlich für --write', file=sys.stderr)
            sys.exit(1)
        ok, err, skipped, n_tables = _write_to_supabase(results, args)
        print(f'\n── WRITE-ZUSAMMENFASSUNG ─────────────────────────────────────────')
        print(f'   table_candidates geschrieben : {ok:>6,}')
        print(f'   table_candidates Fehler      : {err:>6,}')
        print(f'   übersprungen (Resume)        : {skipped:>6,}')
        print(f'   public.tables nachgepflegt   : {n_tables:>6,}')


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

_FALLBACK_SOURCES = frozenset({
    'fallback', 'enriched', 'osm_addr_street', 'osm_addr_city',
    'osm_park', 'osm_playground', 'osm_school', 'osm_kindergarten',
    'osm_sports', 'osm_pool', 'osm_camping', 'osm_recreation',
    'osm_square', 'osm_suburb', 'osm_street', 'osm_street_extended',
    'osm_cemetery',
})


def _backup_before_write(base_url, headers, external_ids, backup_path):
    """Sicherungsexport: aktuelle Enrichment-Felder vor dem Schreiben."""
    gh = {**headers, 'Prefer': '', 'Accept': 'application/json'}
    fields = ('external_id,matched_table_id,enriched_display_name,'
              'enriched_name_source,context_type,context_name,context_method')
    all_rows = []
    CHUNK = 400
    for i in range(0, len(external_ids), CHUNK):
        batch = external_ids[i:i + CHUNK]
        ids_str = ','.join(batch)
        url = (f"{base_url}/rest/v1/table_candidates"
               f"?source=eq.osm&external_id=in.({urllib.parse.quote(ids_str)})"
               f"&select={fields}")
        try:
            req = urllib.request.Request(url, headers=gh)
            with urllib.request.urlopen(req, timeout=30) as resp:
                all_rows.extend(json.loads(resp.read().decode()))
        except Exception as exc:
            print(f'  BACKUP-WARNUNG (Chunk {i}): {exc}', file=sys.stderr)

    backup_fields = ['external_id', 'matched_table_id', 'enriched_display_name',
                     'enriched_name_source', 'context_type', 'context_name', 'context_method']
    with open(backup_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=backup_fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(all_rows)
    return len(all_rows), {r['external_id']: r for r in all_rows}


def _load_write_done(path):
    done = set()
    p = Path(path)
    if p.exists():
        with open(p, encoding='utf-8') as f:
            for line in f:
                s = line.strip()
                if s:
                    done.add(s)
        print(f'── Resume-Schreiben: {len(done)} bereits erledigt aus {p}', file=sys.stderr)
    return done


def _save_write_done(done, path):
    with open(path, 'w', encoding='utf-8') as f:
        for eid in sorted(done):
            f.write(eid + '\n')


def _update_promoted_tables(base_url, headers, backup_rows, enriched_map, ts_now):
    """
    Aktualisiert public.tables.name für bereits promovierte Kandidaten,
    wenn der bisherige name_source ein automatisch erzeugter Fallback ist.
    Echte und manuelle Namen (osm_name, osm_name_de, osm_operator, admin_input)
    werden NIE überschrieben.
    """
    NEVER_OVERWRITE = frozenset({'osm_name', 'osm_name_de', 'osm_operator', 'admin_input'})

    promoted = {
        row['external_id']: row['matched_table_id']
        for row in backup_rows.values()
        if row.get('matched_table_id')
    }
    if not promoted:
        return 0

    # Aktuelle name_source aus public.tables holen
    gh = {**headers, 'Prefer': '', 'Accept': 'application/json'}
    table_ids = list(set(promoted.values()))
    CHUNK = 400
    tables_info = {}
    for i in range(0, len(table_ids), CHUNK):
        batch = table_ids[i:i + CHUNK]
        ids_str = ','.join(str(tid) for tid in batch)
        url = (f"{base_url}/rest/v1/tables"
               f"?id=in.({ids_str})&select=id,name_source")
        try:
            req = urllib.request.Request(url, headers=gh)
            with urllib.request.urlopen(req, timeout=30) as resp:
                for row in json.loads(resp.read().decode()):
                    tables_info[row['id']] = row['name_source']
        except Exception as exc:
            print(f'  TABLES-ABFRAGE-WARNUNG: {exc}', file=sys.stderr)

    ph = {**headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
    updated = 0
    for ext_id, table_id in promoted.items():
        current_source = tables_info.get(table_id)
        if current_source in NEVER_OVERWRITE:
            continue
        enrichment = enriched_map.get(ext_id)
        if not enrichment:
            continue
        new_name   = enrichment.get('enriched_display_name')
        new_source = enrichment.get('enriched_name_source')
        if not new_name or new_source == 'fallback':
            continue
        payload = json.dumps(
            {'name': new_name, 'name_source': new_source},
            ensure_ascii=False
        ).encode()
        url = f"{base_url}/rest/v1/tables?id=eq.{table_id}"
        try:
            req = urllib.request.Request(url, data=payload, method='PATCH', headers=ph)
            with urllib.request.urlopen(req, timeout=15):
                updated += 1
        except Exception as exc:
            print(f'  TABLES-UPDATE-WARNUNG {table_id}: {exc}', file=sys.stderr)

    return updated


def _write_to_supabase(results, args):
    """
    Schreibt Enrichment-Daten nach Supabase.

    Schritt 1: Sicherungsexport (betroffene IDs + bisherige Werte)
    Schritt 2: PATCH table_candidates — wiederholbar (Write-Done-Tracking)
    Schritt 3: UPDATE public.tables für generische Namen (nachpflegen)
    """
    import datetime

    base_url = args.supabase_url.rstrip('/')
    key      = args.supabase_key or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not key:
        print('FEHLER: Kein Supabase Service-Role-Key. '
              'Übergebe --supabase-key KEY oder setze SUPABASE_SERVICE_ROLE_KEY.',
              file=sys.stderr)
        sys.exit(1)

    headers = {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': f'Bearer {key}',
        'Prefer':        'return=minimal',
    }

    ts_now      = datetime.datetime.utcnow().isoformat() + 'Z'
    batch_size  = getattr(args, 'batch_size', 1000)
    out_base    = (args.out or 'enrichment').replace('.csv', '')
    ts_stamp    = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = f'{out_base}.backup-{ts_stamp}.csv'
    done_path   = f'{out_base}.write-done'

    # Alle IDs mit Enrichment
    to_enrich   = [r for r in results if r.get('enrichment')]
    external_ids = [r['external_id'] for r in to_enrich]

    # ── 1. Backup ──────────────────────────────────────────────────────────────
    print(f'── Sicherungsexport läuft … ({len(external_ids):,} IDs)', file=sys.stderr)
    n_backup, backup_rows = _backup_before_write(
        base_url, headers, external_ids, backup_path)
    print(f'── Backup: {n_backup:,} Zeilen → {backup_path}', file=sys.stderr)

    # Map: external_id → enrichment (für tables-Update)
    enriched_map = {r['external_id']: r['enrichment'] for r in to_enrich}

    # ── 2. PATCH table_candidates ──────────────────────────────────────────────
    write_done  = _load_write_done(done_path)
    ok_count    = 0
    err_count   = 0
    skip_count  = len([r for r in to_enrich if r['external_id'] in write_done])

    print(f'── Schreiben: {len(to_enrich) - skip_count:,} ausstehend '
          f'({skip_count:,} übersprungen)', file=sys.stderr)

    for r in to_enrich:
        eid = r['external_id']
        if eid in write_done:
            continue

        e       = r['enrichment']
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
                write_done.add(eid)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()[:200]
            print(f'  FEHLER {eid}: {exc.code} {body}', file=sys.stderr)
            err_count += 1

        if ok_count % batch_size == 0:
            _save_write_done(write_done, done_path)
            print(f'  … Charge {ok_count // batch_size}: {ok_count:,} OK, '
                  f'{err_count} Fehler', file=sys.stderr)

    _save_write_done(write_done, done_path)
    print(f'── table_candidates: {ok_count:,} OK, {err_count} Fehler, '
          f'{skip_count:,} übersprungen (Resume).', file=sys.stderr)

    # ── 3. public.tables: generische Namen nachpflegen ─────────────────────────
    n_tables = _update_promoted_tables(
        base_url, headers, backup_rows, enriched_map, ts_now)
    print(f'── public.tables: {n_tables:,} generische Namen aktualisiert.', file=sys.stderr)

    return ok_count, err_count, skip_count, n_tables


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
        default=os.environ.get('SUPABASE_SERVICE_ROLE_KEY'),
        help='Service-Role-Key (für --write; Standard: $SUPABASE_SERVICE_ROLE_KEY)')
    p.add_argument('--batch-size', type=int, default=1000, metavar='N',
        help='Chargen-Größe für Fortschritts-Tracking beim Schreiben (Standard: 1000)')

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
