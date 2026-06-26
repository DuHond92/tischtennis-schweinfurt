🏓 PROJECT.md

PlattenTreff – Projektübersicht

Version: 1.0

⸻

Projektidee

PlattenTreff ist eine mobile Community-App für Tischtennisspieler.

Die App verbindet drei zentrale Bereiche:

* Orte
* Spiele
* Community

Das Ziel ist es, spontane Tischtennisspiele möglichst einfach zu organisieren.

Die App richtet sich sowohl an Freizeitspieler als auch an ambitionierte Spieler.

⸻

Leitbild

PlattenTreff soll Menschen zusammenbringen.

Nicht Likes.

Nicht Follower.

Nicht Reichweite.

Sondern echte Begegnungen an Tischtennisplatten.

Jede neue Funktion soll dieses Ziel unterstützen.

⸻

Kernbereiche

Die App besteht aus drei Säulen.

1. Orte

Alle öffentlichen Tischtennisplatten.

Funktionen:

* Kartenansicht
* Plattensuche
* Bilder
* Standortinformationen
* Indoor / Outdoor
* Community-Platten
* Bewertungen (optional)

⸻

2. Spielen

Organisation gemeinsamer Spiele.

Funktionen:

* Spiele erstellen
* Mitspieler suchen
* Teilnehmerliste
* Eventdetails
* Chat
* Spielarten

⸻

3. Community

Aufbau einer lokalen Tischtennis-Community.

Funktionen:

* Profile
* Spielpartner
* Direktnachrichten
* Chats
* Benachrichtigungen
* Moderation

⸻

Navigation

Die Navigation soll möglichst einfach bleiben.

Aktuelle Bereiche:

* Home
* Karte
* Spielen
* Profil

Weitere Bereiche werden möglichst innerhalb bestehender Navigation integriert.

Keine unnötigen Tabs.

⸻

Home

Die Home-Seite dient als Einstieg.

Sie beantwortet:

Was passiert gerade?

Sie zeigt:

* Suchleiste
* Statistiken
* Aktuelle Spiele
* Mitspieler gesucht
* Neue Platten

Home soll informieren.

Nicht überladen.

⸻

Karte

Die Karte ist einer der wichtigsten Bereiche.

Prinzipien:

* möglichst viel Bildschirm
* Bottom Sheet
* Google Maps ähnliches Verhalten
* Suchleiste oben
* Filter oben

Marker stammen ausschließlich aus Supabase.

⸻

Tischtennisplatten

Jede Platte besitzt:

* Name
* Standort
* Koordinaten
* Beschreibung
* Bilder
* Indoor / Outdoor
* Freigabestatus

Platten können von Nutzern vorgeschlagen werden.

Moderatoren prüfen Vorschläge.

⸻

Bilder

Jede Platte kann mehrere Bilder besitzen.

Regeln:

Bilder stammen ausschließlich aus Supabase Storage.

Keine lokalen Beispielbilder.

Falls keine Bilder vorhanden:

Placeholder anzeigen.

⸻

Spiele

Ein Spiel besitzt:

* Titel
* Uhrzeit
* Ort
* Spielart
* Teilnehmer
* Chat

⸻

Spielarten

Aktuell:

* Just for Fun
* Training
* Gewertet

Weitere Kategorien nur ergänzen wenn ein echter Nutzen entsteht.

⸻

Mitspieler gesucht

Mitspieler-Gesuche dienen dem spontanen Finden weiterer Spieler.

Sie unterscheiden sich bewusst von festen Spielen.

Gesuche besitzen:

* Beschreibung
* Spielniveau
* Zeitpunkt
* Kommentare

⸻

Chats

Chats werden unterschieden in:

* Spielpartner
* Spielrunden
* Mitspieler gesucht

Archivierte Chats bleiben erhalten.

Der Nutzer kann sie löschen.

⸻

Spielpartner

Spielpartner sind persönliche Kontakte.

Nicht jeder Nutzer ist automatisch Spielpartner.

Anfragen:

* senden
* annehmen
* ablehnen
* zurückziehen

Nach Annahme:

Direktnachrichten freischalten.

⸻

Profile

Ein Profil zeigt:

* Avatar
* Name
* Statistiken
* Spielpartner
* Gespielte Spiele

Avatar und Name öffnen immer das Profil.

⸻

Moderation

Moderatoren dürfen:

* Platten freischalten
* Platten ablehnen
* Bilder löschen

Admins zusätzlich:

* Moderatoren verwalten

⸻

Adminbereich

Der Adminbereich dient ausschließlich zur Moderation.

Keine normalen Nutzerfunktionen.

⸻

Benachrichtigungen

Benachrichtigungen sind getrennt vom Chat.

Chats bleiben eigenständig.

Benachrichtigungen informieren über:

* Spielpartner
* Kommentare
* Einladungen
* Moderation

⸻

Suchfunktion

Die globale Suche dient ausschließlich:

* Platten
* Orte
* Adressen

Nicht für Spielersuche.

⸻

Designprinzipien

Die App orientiert sich an:

* Google Maps
* Apple Human Interface
* moderner Mobile UX

Wichtig:

* wenig Text
* große Touch-Flächen
* klare Icons
* schnelle Orientierung

⸻

UX-Regeln

Avatar → Profil

Name → Profil

Card → Inhalt

Diese Regel gilt überall.

⸻

Dark Mode

Alle neuen Komponenten müssen Dark Mode unterstützen.

Keine hellen Farben fest einbauen.

⸻

Performance

Performance besitzt hohe Priorität.

Vermeiden:

* unnötige Datenbankabfragen
* doppelte Requests
* große Re-Renders

⸻

Datenquelle

Supabase ist die einzige Datenquelle.

Keine lokalen Mockdaten.

Keine Demo-Daten.

Keine hart codierten Inhalte.

⸻

Bilder

Alle Bilder kommen aus Supabase Storage.

Keine lokalen Platzhalterbilder als echte Inhalte.

⸻

Entwicklung

Vor jeder Änderung prüfen:

Kann eine bestehende Lösung erweitert werden?

Falls ja:

Keine neue Komponente erstellen.

⸻

Git Workflow

1. Änderungen durchführen
2. Git Diff prüfen
3. Lokal testen
4. Commit
5. Push

Automatische Pushes vermeiden.

⸻

Versionsziel

Version 1.0

Ziel:

Eine stabile Community-App für Tischtennisspieler mit:

* Karte
* Spiele
* Chats
* Spielpartner
* Moderation
* Performance
* hoher Benutzerfreundlichkeit

Nicht möglichst viele Funktionen.

Sondern ein ausgereiftes Produkt.

⸻

Langfristige Vision

PlattenTreff soll zur größten Community für öffentliche Tischtennisplatten im deutschsprachigen Raum werden.

Der Fokus liegt auf:

* lokalen Communities
* hochwertigen Plattendaten
* spontanen Spielen
* einfacher Organisation

Jede zukünftige Funktion soll dieses Ziel unterstützen.