# Map-System

## Übersicht

Die Kartenseite basiert auf Leaflet und nutzt öffentliche Kacheln von OpenStreetMap / Carto.
Die App zeigt Tischtennisplatten als Marker und erlaubt Filterung nach Standorttyp und Spielart.

## Karten-Basis

* Implementiert in `js/map.js`
* `MAP_STYLE` ist konfigurierbar: `voyager`, `positron`, `osm`
* Standard-Kachelserver:
  * Carto Voyager
  * Carto Positron
  * OSM Standard
* Kartenzentrum: `50.0490,10.2310`, Zoom `14`
* Keine API-Schlüssel für Kartendienste werden benötigt

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

## Unklar / prüfen

* Die genaue Verbindung zwischen `tables`-Daten und Supabase-Query-Implementierung ist aus dem aktuellen Map-Code nur teilweise ersichtlich.
