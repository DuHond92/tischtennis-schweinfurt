Keine SQL-Änderungen direkt in der produktiven Datenbank durchführen.

⸻

Tabellen

Die folgenden Tabellen bilden den Kern der Anwendung.

profiles

Benutzerprofile.

Beispielinhalte:

* Name
* Avatar
* Beschreibung
* Statistik
* Rolle
* Sichtbarkeit

⸻

tables

Alle Tischtennisplatten.

Jede Platte besitzt:

* Name
* Adresse
* Koordinaten
* Beschreibung
* Indoor / Outdoor
* Status

Nur bestätigte Platten erscheinen öffentlich.

⸻

table_images

Bilder einer Platte.

Jedes Bild gehört genau einer Platte.

Gespeichert werden:

* Bildpfad
* Hochladender Benutzer
* Upload-Datum
* Freigabestatus

Bilddateien liegen im Supabase Storage.

⸻

suggested_tables

Von Nutzern vorgeschlagene Platten.

Moderatoren können:

* bestätigen
* ablehnen

Nach Bestätigung wird ein Eintrag in “tables” erstellt.

⸻

events

Geplante Spiele.

Ein Event besitzt:

* Titel
* Zeit
* Ort
* Spielart
* Ersteller

Spielarten:

* casual
* training
* ranked
* player_search

⸻

event_messages

Chatnachrichten eines Events.

Jede Nachricht besitzt:

* Event
* Benutzer
* Zeit
* Inhalt

⸻

player_profile_messages

Direktnachrichten zwischen Spielpartnern.

Nur Spielpartner dürfen miteinander schreiben.

⸻

player_partners

Speichert Spielpartner.

Status:

* pending
* accepted
* rejected

⸻

notifications

Benachrichtigungen.

Beispiele:

* Spielpartneranfrage
* Kommentar
* Event
* Moderation

⸻

moderators

Moderatoren der Plattform.

Moderatoren besitzen zusätzliche Rechte.

Admins können Moderatoren verwalten.

⸻

Storage

Supabase Storage speichert:

* Profilbilder
* Plattenbilder

Dateien niemals lokal speichern.

⸻

Bildverwaltung

Alle Bilder stammen aus Storage.

Kein lokaler Fallback.

Wenn keine Bilder vorhanden:

Placeholder anzeigen.

⸻

Rollen

Es existieren drei Rollen.

Nutzer

Normale Funktionen.

Moderator

Zusätzliche Rechte:

* Platten freigeben
* Bilder löschen

Admin

Zusätzlich:

* Moderatoren verwalten

⸻

Beziehungen

Ein Benutzer besitzt:

* Profil
* Spielpartner
* Nachrichten
* Events
* Bilder

Eine Platte besitzt:

* Bilder
* Standort
* Events

Ein Event besitzt:

* Teilnehmer
* Nachrichten

⸻

Auth

Authentifizierung erfolgt ausschließlich über Supabase Auth.

Keine eigene Benutzerverwaltung.

⸻

RLS

Alle Tabellen verwenden Row Level Security.

Neue Tabellen müssen ebenfalls RLS verwenden.

Keine Tabelle ohne Sicherheitsregeln veröffentlichen.

⸻

Abfragen

Vor jeder neuen Query prüfen:

Existiert bereits eine ähnliche Query?

Unnötige doppelte Requests vermeiden.

⸻

Performance

Vermeiden:

* SELECT *
* unnötige Joins
* doppelte Requests

Immer nur benötigte Felder laden.

⸻

Caching

Wo sinnvoll:

* Bilder cachen
* Profildaten wiederverwenden

Keine veralteten Daten dauerhaft speichern.

⸻

Realtime

Realtime nur verwenden, wenn erforderlich.

Aktuell geeignet für:

* Chats
* Benachrichtigungen

Keine unnötigen Realtime-Subscriptions erzeugen.

⸻

Storage-Regeln

Dateien niemals hart codieren.

Storage-URLs nicht dauerhaft speichern.

Immer über Supabase auflösen.

⸻

Bilder löschen

Beim Löschen:

1. Storage-Datei löschen
2. Datenbankeintrag löschen
3. UI aktualisieren

Keine verwaisten Dateien hinterlassen.

⸻

Plattenvorschläge

Neue Platten erscheinen erst nach Moderation.

Unbestätigte Platten niemals öffentlich anzeigen.

⸻

Datenintegrität

Keine doppelten Platten.

Keine doppelten Spielpartner.

Keine doppelten Event-Teilnahmen.

⸻

Backups

Migrationen versionieren.

Keine manuelle Strukturänderung ohne Migration.

⸻

KI-Regeln

Vor Änderungen an der Datenbank:

* Bestehende Tabellen prüfen
* Beziehungen verstehen
* RLS berücksichtigen
* Migration statt Direktänderung
* Keine Testdaten erzeugen

⸻

Ziel

Die Datenbank soll:

* konsistent
* nachvollziehbar
* performant
* sicher

bleiben.

Supabase bildet die Grundlage der gesamten Anwendung.