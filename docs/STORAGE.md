# Storage

## Überblick

Die App nutzt Supabase Storage für alle Dateiuploads. Lokale Bildpfade sind nicht Teil der Produktivlösung.

## Bucket-Struktur

Aktuell genutzte Buckets:

* `table-images` für Plattenbilder
* `event-images` für Event-Bilder
* `avatars` für Profilbilder

## Upload-Prozess

* Plattenbilder werden in `js/tables.js` hochgeladen
* Event-Bilder werden in `js/tables.js` bzw. `js/event-detail.js` hochgeladen
* Bilder werden vor dem Upload komprimiert / auf eine maximale Größe skaliert
* Dateinamen werden aus `tableId/userId_timestamp.jpg` bzw. `eventId/userId_timestamp.jpg` gebildet

## Sichtbarkeit

* Uploads für Moderatoren werden sofort als `approved` markiert
* Uploads von normalen Nutzern werden mit `status = 'pending'` gespeichert
* Freigaben von Bildern sind Teil der Moderation

## Ladepfade

* Öffentliche Bild-URLs nutzen `storage/v1/object/public/...`
* Inapp-Skripte laden Bilder über `storage/v1/object/...`
* Profilbilder werden über `avatars` aufgelöst

## Richtlinien

* Keine festen Storage-Pfade im Code
* Die App erwartet Storage-Dateien dynamisch anhand von URLs
* Kein dauerhafter Speicher von Storage-URLs in der Frontend-Logik

## Unklar / prüfen

* Die exakte Bucket-Konfiguration in Supabase ist aus den Migrationen nicht vollständig ableitbar.
