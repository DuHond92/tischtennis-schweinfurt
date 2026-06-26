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

* Leaflet mit OSM-/Carto-Kacheln wird als Kartensystem verwendet.
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
