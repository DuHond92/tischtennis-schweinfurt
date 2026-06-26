# Chat-System

## Übersicht

Das Chat-System besteht aus drei getrennten Kommunikationswegen:

* Event-Chat für geplante Spiele (`event_messages`)
* Chat für Mitspieler-Gesuche (`event_messages` mit `mode = 'player_search'`)
* Direkte Nachrichten zwischen Spielpartnern (`direct_messages`)

Die App verwendet keine externe Chat-Plattform, sondern speichert alle Nachrichten in Supabase-Tabellen und lädt sie per REST-API.

## Event-Chat

* Implementiert in `js/event-detail.js`
* Nachrichten werden über die Tabelle `event_messages` geladen und gesendet
* Chat kann nur für echte Events genutzt werden, nicht für Fallback-Demo-Events
* Nachrichten werden mit Profilinfos (`profiles(username,avatar_emoji,avatar_url)`) angereichert
* Moderatoren können im Event-Chat Nachrichten löschen
* Es wird alle 4 Sekunden nach neuen Nachrichten gepollt

## Mitspieler-Gesuche Chat

* Implementiert in `js/ps-detail.js`
* Nutzt dieselbe Tabelle `event_messages` wie der Event-Chat
* Gilt nur für Reale Gesuche, nicht für Demo-Fallbackeinträge
* Nachrichten lassen sich nur senden, wenn der Nutzer angemeldet ist
* Polling wird ebenfalls alle 4 Sekunden aktiviert

## Direktnachrichten

* Implementiert in `js/messages.js`
* Tabelle `direct_messages` speichert 1:1-Nachrichten zwischen Spielpartnern
* Der Chat wird in der Inbox nach Spielpartnern segmentiert
* Spielpartner-Nachrichten werden nicht archiviert
* Ungelesene direkte Nachrichten erscheinen im Badge der Inbox

## Chat-Organisation und Inbox

* Nachrichten werden in `js/messages.js` nach Kategorien gruppiert:
  * Spielpartner
  * Spielrunden
  * Mitspieler gesucht
* Events, die älter als 14 Tage sind, werden als archiviert behandelt
* Archivierte Chats werden separat angezeigt
* Ein Benutzer kann Chats lokal verbergen (`localStorage` `tt_hidden_chats`)

## Benachrichtigungen

* `js/notifications.js` prüft ungelesene Event-Nachrichten und Verbindungsanfragen
* Badge-Zähler wird aktualisiert, wenn neue Nachrichten eingehen
* Sichtbarkeit von Benachrichtigungen ist an Login und Event-Zugehörigkeit gebunden

## Moderation und Reporting

* Moderator- oder Admin-Rollen erlauben Löschaktionen auf Chatnachrichten
* Nicht-moderierte Chatnachrichten können von Benutzern als Bericht markiert werden
* Berichte werden in einer separaten `reports`-Tabelle gesammelt und vom Adminbereich bearbeitet

## Unklar / prüfen

* Die genaue Struktur und Verarbeitung von `reports` ist im aktuellen Code nicht vollständig nachvollziehbar.
