# Known Decisions

## Architektur

* PlattenTreff ist als mobile-first statische Web-App gebaut.
* Supabase ist die einzige Datenquelle für Auth, Datenbank und Storage.
* Frontend greift direkt auf Supabase REST-API zu, ohne Backend-Server.

## Bilder und Storage

* Alle Bilder stammen aus Supabase Storage.
* Keine lokalen Beispielbilder oder hartcodierten Storage-URLs.
* Bild-Uploads werden im Frontend vor dem Hochladen komprimiert.

## Karten

* Kartensystem: Leaflet 1.9.4 + MapLibre GL JS 4.7.1 + @maplibre/maplibre-gl-leaflet 0.1.3 mit Vektorkarten von OpenFreeMap (Liberty für Light, Dark für Dark Mode).
* CARTO wurde 2026-07-15 vollständig entfernt — kein CARTO-Code, keine CARTO-URLs mehr im Projekt.
* Dark Mode: nativer MapLibre-Style, kein CSS-Filter. Theme-Switching per MutationObserver auf `data-theme`.
* Marker dürfen nicht hart codiert werden.
* Karte soll möglichst viel Bildschirmfläche erhalten.

## Chat und Community

* Chats sind nach Kategorien getrennt: Spielpartner, Spielrunden, Mitspieler gesucht.
* Event-Chat und Mitspieler-Chat verwenden eine gemeinsame Nachrichtentabelle.
* Direkte Nachrichten sind nur für akzeptierte Spielpartner möglich.

## Moderation

* Moderatoren prüfen Plattenvorschläge, Bilder und Meldungen.
* Admins können Moderatorenrollen vergeben und entfernen.
* Moderationslog dient zur Nachvollziehbarkeit von Aktionen.

## Deployment und Tests

* Keine Projekt-spezifischen Build- oder Testwerkzeuge vorhanden.
* Deployment erfolgt als statische Website.
* Lokale Tests werden manuell ausgeführt.

## Unklar / prüfen

* Genauere Entscheidungen zu RLS-Policies, Migrationen und Deployment sind nicht dokumentiert.
