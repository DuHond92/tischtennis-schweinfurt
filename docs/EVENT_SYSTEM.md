# Event-System

## Event-Typen

Die App nutzt die Tabelle `events` für mehrere Event-Typen:

* `casual` - lockere Spielrunde
* `training` - Trainingsrunde
* `ranked` - gewertete Partie
* `player_search` - Mitspieler-Gesuch

## Event-Erstellung

* `js/events.js` implementiert `submitCreateEvent()` für normale Events
* `submitMitspieler()` erstellt `player_search`-Gesuche
* `player_search`-Einträge haben `table_id = null`
* Zusätzliche Metadaten für Gesuche werden als JSON im Feld `description` gespeichert

## Teilnehmer und Beitreten

* Spieler treten einem Event über `js/events.js` zu `event_participants` bei
* Teilnehmeranzahl wird in Event-Detail angezeigt
* Duplicate-Teilnahme wird abgefangen (PostgreSQL-Fehler 23505)
* Teilnehmerliste wird in `js/event-detail.js` geladen

## Event-Detail

* `js/event-detail.js` zeigt Event-Informationen, Bilder, Teilnehmer und Chat
* Chat und Teilnehmer werden nach Öffnen der Detailseite separat geladen
* Host-Aktionen unterscheiden sich von Teilnehmer-Aktionen
  * Host: Spiel starten, Event bearbeiten, Event löschen
  * Anderer Nutzer: Event beitreten

## Event-Chat und Bilder

* Event-Chat nutzt `event_messages`
* Event-Bilder werden in `event_images` verwaltet
* Für echte Events (nicht Demo-Fallbacks) wird Chat aktiviert
* Bilder können von Benutzern hochgeladen werden und durchlaufen einen Moderationsstatus

## Fallback-Events

* Demo-Fallbacks haben IDs `>= 101`
* Diese werden angezeigt, aber Chat und einige Funktionen sind deaktiviert

## Unklar / prüfen

* Es ist nicht vollständig dokumentiert, wie Event-Bilder bei Genehmigung automatisch sichtbar werden.
