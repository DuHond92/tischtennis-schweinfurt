# Testing

## Aktueller Zustand

Es gibt keine Tests, Testskripte oder Testkonfiguration im Repository.

## Empfohlene manuelle Tests

* Lokale App in einem Browser öffnen
* Anmeldung und Registrierung prüfen
* Kartenfunktionen testen: Marker, Suche, Filter, Standort
* Events erstellen und beitreten
* Mitspieler-Gesuche erstellen und anzeigen
* Chat-Funktion in Event-Detail und Mitspieler-Gesuch prüfen
* Direktnachrichten zwischen Spielpartnern testen
* Moderationsfunktionen mit einem Moderator- oder Admin-Konto testen
* Bilder-Uploads für Platten und Events testen

---

## Testfälle: Suggest-Pin-Cleanup (Bug #suggest-pin-leak)

Hintergrund: Beim Abbrechen des "Platte vorschlagen"-Flows blieb ein orangener temporärer Pin auf der Karte sichtbar.
Fix: `_cleanupSuggestPin()` wird in `closeAllSheets()` aufgerufen (analog zu `_destroyEdsMap()`).

### TC-1 — Standort setzen, per X-Button abbrechen
1. Karte öffnen → orangenen FAB "Platte vorschlagen" tippen
2. Schritt 1: "GPS-Standort verwenden" tippen → orangener Pin erscheint auf der Karte
3. Sheet per **X-Button** (oben rechts) schließen
4. **Erwartet:** orangener Pin ist sofort verschwunden, Karte zeigt nur die regulären grünen Platten-Marker

### TC-2 — Standort setzen, per Overlay-Tap abbrechen
1. Karte öffnen → "Platte vorschlagen" tippen
2. Schritt 1: GPS-Standort setzen → Pin erscheint
3. **Außerhalb des Sheets** auf den abgedunkelten Overlay tippen
4. **Erwartet:** Pin ist verschwunden

### TC-3 — Pin auf Karte setzen (Map-Click-Modus), abbrechen
1. "Platte vorschlagen" → "Pin auf Karte setzen" tippen (Sheet schließt sich, Cursor wird zum Fadenkreuz)
2. Auf die Karte tippen → Pin erscheint, Sheet öffnet sich wieder mit den Koordinaten
3. Sheet per X-Button schließen
4. **Erwartet:** Pin verschwunden

### TC-4 — Erstellung erfolgreich abschließen → gespeicherte Platte bleibt
1. "Platte vorschlagen" → Standort setzen → weiter → Namen eingeben → absenden
2. Sheet schließt nach Erfolgsmeldung
3. **Erwartet:** orangener Temp-Pin verschwunden; wenn die neue Platte freigeschaltet wird, erscheint ihr **grüner** Permanentmarker — unabhängig vom Suggest-Flow

### TC-5 — Erneut starten, kein alter Pin
1. Einmal starten, GPS-Standort setzen, abbrechen (TC-1 oder TC-2)
2. Erneut "Platte vorschlagen" tippen
3. **Erwartet:** kein alter Pin sichtbar beim Öffnen des Sheets; nur ein neuer Pin entsteht beim erneuten Setzen des Standorts

### TC-6 — Map-Click-Modus aktiv lassen, dann normal schließen (Guard-Test)
1. "Platte vorschlagen" → Schritt 1 → "Pin auf Karte setzen" tippen
2. **Nicht** auf die Karte tippen; stattdessen das Sheet direkt über einen anderen Weg schließen (Overlay-Tap ist nicht möglich, da kein Sheet offen ist — Tab-Wechsel genügt)
3. Zur Karte zurücknavigieren
4. **Erwartet:** `suggestMapClickActive` wurde beim nächsten `closeAllSheets()`-Aufruf nicht fälschlicherweise gecleant — kein Phantom-State

### Regressionsschutz
* Reguläre Platten-Marker (grün) dürfen durch keinen der obigen Flows entfernt werden
* Marker-Filter, Suche und Bottom-Sheet-Navigation auf der Karte müssen unverändert funktionieren

## Technische Hinweise

* Die Anwendung ist rein clientseitig und nutzt Supabase REST-API
* Fehlende Testtools: kein Jest, kein Cypress, kein Playwright, kein Vitest
* Es gibt auch keine lokalen Testbefehle oder Skripte

## Unklar / prüfen

* Keine vorhandenen automatisierten Tests bedeuten, dass Testabdeckung nicht dokumentiert ist.
