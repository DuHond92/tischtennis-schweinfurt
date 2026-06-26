# Deployment

## Aktueller Zustand

Das Projekt ist eine statische Webanwendung mit HTML, CSS und JavaScript.
Es gibt keinen sichtbaren Build-Prozess oder Framework im Repository.

## Voraussetzungen

* Webserver oder statischer Hosting-Dienst
* Zugriff auf die Supabase-Instanz
* Index-Datei: `index.html`
* Verzeichnisstruktur: `css/`, `js/`, `images/`, `docs/`

## Lokales Testen

* Die Dateien können lokal über einen statischen Server gehostet werden
* Beispiele: `python3 -m http.server`, `npx serve`, oder vergleichbare Tools
* Die App benötigt `index.html` mit eingebundenen CSS- und JS-Dateien

## Supabase-Konfiguration

* Die Supabase-URL ist in `js/supabase.js` fest hinterlegt
* Der anonymisierte API-Schlüssel ist dort ebenfalls definiert

## Veröffentlichung

* Keine spezielle Deployment-Pipeline gefunden
* Mögliche Ziele: Netlify, Vercel, GitHub Pages oder eigener Webserver
* Wichtig: `index.html` muss erreichbar sein und alle Assets aus dem Repository laden können

## Unklar / prüfen

* Keine vorhandene `package.json`, kein Build-Tool, kein CI-Setup
* Der konkrete Deployment-Prozess ist nicht im Repository dokumentiert.
