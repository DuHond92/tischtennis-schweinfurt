# Supabase

## Architektur

Die Anwendung verwendet Supabase als einzige Backend-Quelle.
Alle Datenbankzugriffe erfolgen über das REST-API und sind im Frontend via `js/supabase.js` implementiert.

## Auth — URL-Konfiguration (Supabase Dashboard)

**Site URL:** `https://plattentreff.app`

**Redirect URL Allowlist:**
```
https://plattentreff.app/**
https://www.plattentreff.app/**
https://plattentreff.vercel.app/**
http://localhost:3000/**
http://localhost:5173/**
```

## Authentifizierung

* `js/supabase.js` stellt Auth-Funktionen bereit:
  * `signUp`
  * `signIn`
  * `refreshToken`
  * `resetPassword`
  * `updatePassword`
  * `signOut`
* Sessions werden lokal in `localStorage` gespeichert
* Token-Erneuerung erfolgt automatisch, wenn das JWT kurz vor Ablauf steht

## REST-Zugriffe

* Die App nutzt `QueryBuilder` für einfache REST-Anfragen
* Tabellen werden über `rest/v1/<table>` angesprochen
* `insert`, `update`, `upsert` und `select` werden über `QueryBuilder` unterstützt
* Fehlerbehandlung führt bei abgelaufenem JWT zu einem erneuten `refreshToken`

## Datenquelle und Tabellen

Zentrale Tabellen im aktuellen System sind:

* `profiles`
* `tables`
* `table_images`
* `table_suggestions`
* `events`
* `event_participants`
* `event_messages`
* `direct_messages`
* `player_connections`
* `reports`
* `moderation_log`

## Rollenzugriff und RLS

* Die App setzt supabase-typische Rollen-Metadaten ein
* Moderatoren und Admins erhalten erweiterte Rechte im Frontend
* Authentifizierte Header werden bei REST-Anfragen mitgegeben
* `SUPABASE_ANON` wird als Fallback-Token verwendet

## Unklar / prüfen

* Ob für einige Tabellen spezielle RLS-Policies existieren, ist nur aus den Migrationsdateien partiell ersichtlich.
