AGENTS.md

# PlattenTreff – AI Development Guide

Version: 1.0

⸻

## Projekt

PlattenTreff ist eine mobile Community-App für Tischtennisspieler.

Die App verfolgt drei Ziele:

1. Neue Tischtennisplatten entdecken
2. Schnell Mitspieler finden
3. Eine lokale Tischtennis-Community aufbauen

Die App ist Mobile-First.

Desktop wird nur unterstützt, ist aber nicht die Priorität.

⸻

## Entwicklungsphilosophie

Jede Änderung soll:

* bestehende Komponenten wiederverwenden
* möglichst wenig Dateien verändern
* keine unnötigen Refactorings verursachen
* bestehende UX respektieren
* Dark Mode berücksichtigen

Wenn eine bestehende Lösung erweitert werden kann, soll niemals eine neue Komponente erstellt werden.

⸻

## Mobile First

Immer für Smartphones entwickeln.

Vor jeder UI-Änderung überlegen:

“Würde sich das auf einem iPhone angenehm bedienen lassen?”

⸻

## Design

Design soll modern wirken.

Inspiration:

* Google Maps
* Airbnb
* Apple Human Interface
* iOS
* Komoot
* Playtomic
* Meetup

Die App soll schlicht wirken.

Keine überladenen Oberflächen.

Keine unnötigen Farben.

⸻

## Farben

Primärfarbe:

Blau

Sekundär:

Weiß

Dark Mode:

Automatisch unterstützen.

Neue Komponenten müssen immer im Dark Mode funktionieren.

⸻

## Komponenten

Vor jeder neuen Komponente prüfen:

Kann eine bestehende Komponente verwendet werden?

Falls ja:

Bestehende Komponente erweitern.

Nicht duplizieren.

⸻

## Bottom Sheets

Bottom Sheets sind der Standard.

Modalfenster nur verwenden wenn technisch notwendig.

Alle Bottom Sheets sollen:

* dieselbe Animation besitzen
* dieselbe Abrundung besitzen
* dieselbe Drag Handle besitzen

⸻

## Karten

Die Karte ist einer der wichtigsten Bereiche der App.

Regeln:

* Karte möglichst groß anzeigen
* Bottom Sheet von unten
* Google Maps ähnliches Verhalten
* Suchleiste oben
* Filter oben
* Karte niemals unnötig verkleinern

Marker niemals hart codieren.

Alle Marker kommen aus Supabase.

⸻

## Tischtennisplatten

Alle Platten kommen aus Supabase.

Keine Demo-Platten.

Keine Testdaten.

Keine lokalen JSON-Dateien.

Bilder ausschließlich aus Supabase Storage laden.

Falls keine Bilder vorhanden:

Placeholder anzeigen.

⸻

## Bilder

Keine Bildpfade hart codieren.

Immer Storage verwenden.

Falls Bilder gelöscht wurden:

UI automatisch aktualisieren.

⸻

## Community

Community steht über Gamification.

Die App soll Menschen zusammenbringen.

Keine unnötigen Ranglisten.

Keine künstlichen Mechaniken.

Neue Features sollen Begegnungen fördern.

⸻

##Mitspieler gesucht

Die gesamte Card öffnet das Gesuch.

Nur:

Avatar

und

Name

öffnen das Profil.

Diese Regel gilt überall.

⸻

## Profile

Avatar -> Profil

Name -> Profil

Der restliche Bereich führt niemals zum Profil.

⸻

## Spielpartner

Spielpartner können:

* chatten
* entfernt werden

Anfragen können:

* angenommen
* abgelehnt
* zurückgezogen werden

⸻

## Chats

Chats werden gruppiert.

Gruppen:

* Spielpartner
* Spielrunden
* Mitspieler gesucht

Archivierte Chats erscheinen unten.

Aktive Chats immer oben.

Archivierte Chats dürfen gelöscht werden.

⸻

## Events

Events besitzen:

* Chat
* Teilnehmer
* Spielart
* Tisch
* Zeit

Eventinformationen dürfen niemals verloren gehen.

⸻

## Navigation

Navigation möglichst flach halten.

Maximal drei Ebenen.

Keine verschachtelten Dialoge.

⸻

## Suchfunktion

Die globale Suche dient:

* Platten
* Orte
* Adressen

Nicht zum Suchen anderer Spieler.

Spielersuche erfolgt über Community-Bereiche.

⸻

## Performance

Performance ist wichtiger als Animationen.

Keine unnötigen Re-Renders.

Keine doppelten Datenbankabfragen.

Keine unnötigen API Calls.

⸻

## Datenbank

Supabase ist die einzige Datenquelle.

Keine lokalen Mock-Daten.

Keine Demo-Daten.

Keine Testtabellen.

Schemaänderungen immer über Migrationen.

⸻

## Migrationen

Jede Schemaänderung:

supabase/migrations/

Keine manuellen SQL-Skripte außerhalb des Migration-Ordners.

⸻

## Storage

Bilder ausschließlich über Storage.

Storage-Pfade niemals hart codieren.

⸻

## Sicherheit

RLS immer respektieren.

Keine Adminrechte im Frontend simulieren.

Moderatorenrechte ausschließlich über Datenbankrollen.

⸻

## Adminbereich

Moderatoren dürfen:

* Platten freischalten
* Platten ablehnen
* Bilder löschen

Normale Nutzer dürfen dies nicht.

⸻

## Git

Vor jeder größeren Änderung:

Git Diff prüfen.

Keine unnötigen Dateien ändern.

Keine automatischen Pushes.

Keine automatischen Commits.

⸻

## Refactoring

Keine großflächigen Refactorings.

Nur wenn ausdrücklich angefordert.

⸻

## Kommentare

Kommentare nur dort schreiben, wo sie echten Mehrwert bieten.

Keine offensichtlichen Kommentare.

⸻

## Coding Style

Kurze Funktionen.

Klare Namen.

Keine doppelte Logik.

Bestehende Patterns übernehmen.

⸻

## Dateien

Nur notwendige Dateien ändern.

Nicht automatisch benachbarte Dateien anfassen.

⸻

## Fehlerbehebung

Vor Änderungen zuerst die Ursache finden.

Nicht mehrere Lösungen gleichzeitig ausprobieren.

⸻

## UX

Vor jeder Änderung fragen:

Ist diese Lösung für einen neuen Nutzer intuitiv?

Wenn nein:

vereinfache sie.

⸻

## KI-Verhalten

Vor jeder Aufgabe:

1. Bestehende Komponenten analysieren.
2. Nur notwendige Änderungen durchführen.
3. Keine unnötigen Dateien ändern.
4. Bestehende Designentscheidungen respektieren.
5. Mobile First.
6. Dark Mode beachten.
7. Git Diff anzeigen.
8. Kein automatischer Push.

⸻

## Niemals

* Demo-Daten erzeugen
* Bilder hart codieren
* Neue UI-Muster ohne Grund einführen
* Bestehende Komponenten duplizieren
* Große Refactorings ohne Nachfrage
* Automatisch pushen
* Automatisch committen
* Testdaten dauerhaft speichern

⸻

## Ziel

PlattenTreff soll sich wie eine moderne Community-App anfühlen.

Schnell.

Übersichtlich.

Persönlich.

Einfach.

Jede Änderung soll dieses Ziel unterstützen.