📋 CHANGELOG.md

Changelog

Alle wichtigen Änderungen an PlattenTreff werden in dieser Datei dokumentiert.

Das Format orientiert sich an Keep a Changelog.

Versionierung erfolgt nach Semantic Versioning (SemVer).

⸻

[1.0.0] - In Entwicklung

🚀 Erstes Public Release

Hinzugefügt

Karte

* Interaktive Kartenansicht
* Suchfunktion
* Filter
* Indoor / Outdoor
* Community-Platten
* Bildergalerie
* Bottom Sheet
* Moderne Kartenansicht

⸻

Spielen

* Spiele erstellen
* Mitspieler gesucht
* Spielarten
* Eventdetails
* Teilnehmerverwaltung
* Event-Chat

⸻

Community

* Profile
* Profilbilder
* Statistiken
* Spielpartner-System
* Direktnachrichten
* Chat-Kategorien
* Archivierte Chats

⸻

Moderation

* Adminbereich
* Moderatoren
* Platten freischalten
* Bilder moderieren
* Bilder löschen
* Plattenvorschläge

⸻

Benutzer

* Registrierung
* Login
* Supabase Auth
* Rollen
* Dark Mode

⸻

Verbessert

* Home komplett überarbeitet
* Kartenansicht modernisiert
* Bottom Sheet eingeführt
* Google Maps ähnliches Verhalten
* Klickbereiche vereinheitlicht
* Avatar-Logik verbessert
* Chatstruktur verbessert
* Nachrichten archivierbar

⸻

Geändert

* **Kartenstack: CARTO → OpenFreeMap** — Leaflet + MapLibre GL JS + @maplibre/maplibre-gl-leaflet 0.1.3, Vektorkarten statt Raster-Kacheln, nativer Dark-Mode-Style (kein CSS-Filter), kein API-Key erforderlich. CARTO vollständig entfernt (Code, URLs, Datenschutz, Nutzungsbedingungen).
* “Wertungsspiel” intern auf ranked umgestellt
* Events ohne Tisch möglich (player_search)
* Kartenbilder ausschließlich aus Supabase
* Demo-Bilder entfernt
* Klickregeln vereinheitlicht

⸻

Behoben

* Event-Chat funktionierte nicht
* Profilnachrichten repariert
* Event-Details verbessert
* Kartenfilter korrigiert
* Klickbereiche korrigiert
* Bilderverwaltung verbessert

⸻

Zukünftige Versionen

[1.1.0]

Geplant:

* Push Notifications
* Lieblingsplatten
* Aktivitätsstatus
* Bildbewertungen
* Verbesserte Suche

⸻

[1.2.0]

Geplant:

* Matchhistorie
* Rangliste
* ELO-System
* Turniere

⸻

[2.0.0]

Geplant:

* Mehrere Städte
* Regionen
* Vereinsfunktionen
* Skalierung

⸻

Änderungsarten

| Typ | Bedeutung |
|------|-----------|
| **Added** | Neue Features |
| **Changed** | Verbesserungen |
| **Fixed** | Fehlerbehebungen |
| **Removed** | Entfernte Funktionen |
| **Deprecated** | Veraltete Funktionen |
| **Security** | Sicherheitsrelevante Änderungen |

⸻

Regeln

Jede veröffentlichte Version erhält:

* Versionsnummer
* Veröffentlichungsdatum
* Beschreibung
* Neue Features
* Verbesserungen
* Bugfixes

⸻

Ziel

Jeder Entwickler soll nachvollziehen können:

* Wann ein Feature eingeführt wurde.
* Warum Änderungen vorgenommen wurden.
* Welche Version welche Funktionen enthält.