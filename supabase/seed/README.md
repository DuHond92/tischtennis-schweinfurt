# Supabase Seed-Daten

Seed-Dateien füllen eine **Entwicklungsumgebung** mit sinnvollen Testdaten.  
Sie sind **keine Migrationen** und werden von Supabase nicht automatisch ausgeführt.

## Unterschied Migration vs. Seed

| | Migrations (`migrations/`) | Seeds (`seed/`) |
|---|---|---|
| Zweck | Datenbankstruktur | Testdaten |
| Ausführung | Automatisch via GitHub | Manuell im SQL-Editor |
| Häufigkeit | Einmalig pro Migration | Beliebig oft (idempotent) |
| Produktionsdaten? | Ja | Nein |

## Ausführungsreihenfolge

Seeds bauen aufeinander auf — immer in dieser Reihenfolge ausführen:

```
1. profiles.sql          → Testnutzer (Abhängigkeit für alle anderen)
2. tables.sql            → Tischtennisplatten
3. events.sql            → Events + Teilnehmer + Mitspieler-Gesuche
4. player_connections.sql→ Spielpartner-Verbindungen
5. demo_messages.sql     → Event-Chats + Direktnachrichten
```

## Ausführung im Supabase SQL-Editor

1. [Supabase Dashboard](https://supabase.com/dashboard) öffnen
2. Projekt `quelfdpqvzgnnvpuwljq` auswählen
3. **SQL Editor** → **New query**
4. Inhalt der jeweiligen `.sql`-Datei einfügen → **Run**

## Wichtige Hinweise

**profiles.sql:** Die UUIDs müssen mit echten `auth.users`-Einträgen übereinstimmen.  
In einer frischen DB müssen die Testnutzer zuerst unter  
**Authentication → Users → Add user** angelegt werden.  
Die UUIDs dann in `profiles.sql` anpassen.

**Alle Seeds sind idempotent** — mehrfaches Ausführen ist sicher  
(`ON CONFLICT DO NOTHING` bzw. `ON CONFLICT DO UPDATE`).

**events.sql** setzt Datumsangaben relativ zu `NOW()`,  
damit Events immer in der Zukunft liegen.

## Workflow für neue Features

```
Neue Tabellenstruktur  →  supabase/migrations/YYYYMMDDHHMMSS_name.sql
Demo-/Testdaten        →  supabase/seed/passende-datei.sql
```
