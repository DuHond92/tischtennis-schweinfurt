# Map-System

## Übersicht

Die Kartenseite basiert auf Leaflet + MapLibre GL JS und nutzt Vektorkarten von OpenFreeMap.
Die App zeigt Tischtennisplatten als Marker und erlaubt Filterung nach Standorttyp und Spielart.

## Karten-Basis

* Implementiert in `js/map.js`
* Kartenbibliotheken: Leaflet 1.9.4 + MapLibre GL JS 4.7.1 + @maplibre/maplibre-gl-leaflet **0.1.3**
* Kartenstyles von OpenFreeMap (kein API-Key erforderlich):
  * Light: `https://tiles.openfreemap.org/styles/liberty`
  * Dark: `https://tiles.openfreemap.org/styles/dark`
* Theme-Switching: MutationObserver auf `data-theme` am `<html>`-Element ruft `setStyle()` auf
* Kartenzentrum: `50.0490,10.2310`, Zoom `14`
* Attribution: OpenFreeMap · OpenMapTiles · OpenStreetMap contributors

## Marker und Tafeldaten

* Marker werden aus der Tabelle `tables` geladen oder aus Fallback-Daten wenn keine Tabelle verfügbar ist
* Marker-Design unterscheidet Indoor (`#3B7CF4`) und Outdoor (`#22C55E`)
* Event-Anzahl wird als Badge auf den Markern angezeigt
* Klick auf Marker öffnet Detailseite der Platte und zentriert die Karte

## Suche und Filter

* Freitextsuche in Name und Adresse (`mapSearchQuery`)
* Filter nach Spielart: `all`, `casual`, `training`, `ranked`
* Filter nach Platztyp: `all`, `indoor`, `outdoor`
* Filter werden sowohl in der Liste als auch auf der Karte angewendet
* Unsichtbare Marker werden nicht entfernt, sondern optisch abgeblendet

## Benutzerstandort

* Standortbestimmung per `navigator.geolocation`
* Anzeigen eines Kreises und eines Standortpunkts auf der Karte
* Nach erfolgreicher Bestimmung werden Entfernungen zu den Platten berechnet
* Entfernungen werden in Meter oder Kilometer formatiert

## Auswahl und Darstellung

* `selectMapItem(id)` hebt die Liste hervor und scrollt zum ausgewählten Element
* Statuszeile zeigt Such- und Filterzustand sowie Anzahl gefundener Platten
* Bottom-Sheet-Mechanik wird konsistent mit der App-Navigation verwendet

## Theme-Switching (Dark Mode)

* MapLibre GL JS rendert zwei native Styles — kein CSS-Filter mehr nötig
* Ein `MutationObserver` auf `data-theme` am `<html>`-Element ruft `_maplibreLayer.getMaplibreMap().setStyle(url)` auf
* Theme-Wechsel greift sofort ohne Neustart der Karte
* Auch die Mini-Karte in `js/event-detail.js` liest `data-theme` beim Initialisieren

## Attribution

Pflichtangaben laut Lizenz (sichtbar in Leaflet-Attribution-Control und statischer Zeile im Tischdetail-Sheet):

> © [OpenFreeMap](https://openfreemap.org) © [OpenMapTiles](https://www.openmaptiles.org/) © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors

## Migration von CARTO (abgeschlossen 2026-07-15)

CARTO Voyager-Raster-Kacheln wurden vollständig durch OpenFreeMap-Vektorkarten ersetzt.
Entfernte CARTO-Abhängigkeiten: `_TILE_URL`, `_TILE_ATTR` in `map.js`, Tile-Layer in `event-detail.js` und `tables.js`, CSS-Filter in `base.css`, alle Rechtstext-Erwähnungen in Datenschutz und Nutzungsbedingungen.

## Unklar / prüfen

* Die genaue Verbindung zwischen `tables`-Daten und Supabase-Query-Implementierung ist aus dem aktuellen Map-Code nur teilweise ersichtlich.
