# Matchmaking

## Mitspieler-Gesuche

* Implementiert als `events`-Einträge mit `mode = 'player_search'`
* Darstellung erfolgt in `js/events.js` und `js/ps-detail.js`
* Gesuche enthalten Felder wie Spielart, Zeitpunkt, Umkreis und Nachricht
* Gesuche können veröffentlicht werden, wenn der Nutzer angemeldet ist
* Nicht echte Demo-Einträge zeigen keinen Chat

## Spielpartner-System

* Tabelle `player_connections` speichert Verbindungen zwischen Nutzern
* Statuswerte:
  * `pending`
  * `accepted`
  * `rejected`
* In `js/connections.js` können Nutzer:
  * eine Anfrage senden
  * Anfragen annehmen
  * Anfragen ablehnen
  * Anfragen zurückziehen
  * Spielpartner entfernen

## Direkte Kommunikation

* Nur akzeptierte Spielpartner können DMs senden
* DMs werden über die Tabelle `direct_messages` verwaltet
* `js/messages.js` gruppiert direkte Nachrichten in der Inbox
* Verbindungsanfragen erscheinen in den Benachrichtigungen

## Profil-Integration

* Avatar und Benutzername öffnen das Profil
* Restliche Bereiche der Karte/Events führen nicht direkt ins Profil
* Das Spielpartner-Button-HTML passt sich dem Verbindungsstatus an

## Inbox und Archivierung

* Spielpartner-Chats werden nicht archiviert
* Event- und Gesuch-Chats werden nach 14 Tagen archiviert
* Archivierte Chats können vom Nutzer weiterhin eingesehen werden

## Unklar / prüfen

* Ob es eine separate Tabelle `player_profile_messages` gibt, ist unklar; der aktive Code nutzt `direct_messages`.
