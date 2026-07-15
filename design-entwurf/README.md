# Plattentreff — Design-Entwurf 2.0

Reiner Konzept-Entwurf (Juli 2026). **Nichts in diesem Ordner wird von der App
eingebunden** — die laufende App ist unverändert.

## Inhalt

| Datei | Inhalt |
|---|---|
| `index.html` | **Variante Grün (2.0)**: neues Logo, 4 Screen-Mockups (Home, Karte, Spielen, Profil/Dark), voller Styleguide. Meetup × Komoot. Self-contained (Schriften eingebettet) — einfach per Doppelklick im Browser öffnen. |
| `variante-blau.html` | **Variante Blau (2.1)**: gleiche Struktur & Schriften, aber Platten-Blau `#2E6BFF` + Navy `#0F2038` + Volt `#D8F34F`, Playtomic-inspiriert — Level-Badges (LVL 3.2), offene Match-Slots („2/4"), Level-Karte mit Fortschrittsbalken im Profil. |
| `logo-schrift-vergleich.html` | **Runde 2 — Logo & Schrift**: 3 neue Logo-Konzepte mit **weißem Ball** und klar erkennbarer Platte (Beine + Netz): „Die Platte" (Empfehlung), „Der Ball", „Pin 2.0". Dazu 3 Schrift-Alternativen zu Bricolage: **Archivo** (athletisch, Empfehlung), Sora + Hanken Grotesk (modern-präzise), Outfit (freundlich). Die Logo-SVGs in `logo/` entsprechen noch Runde 1 (oranger Ball). |
| `tokens-vorschlag.css` | Drop-in-Vorschlag für `css/tokens.css` (Phase 1). Gleiche Token-Namen, neue Werte. |
| `logo/logo-pin.svg` | Bildmarke (Pin + Platte + Ball), Primärvariante |
| `logo/logo-pin-negativ.svg` | Bildmarke für dunkle/grüne Flächen |
| `logo/logo-pin-mono.svg` | Monochrom (Druck, Stempel) |
| `logo/logo-lockup.svg` | Bildmarke + Wortmarke „plattentreff." (Text vor finalem Einsatz in Pfade konvertieren) |
| `logo/app-icon.svg` | App-Icon 512×512 (iOS/Android-Export) |
| `logo/favicon.svg` | Favicon-Variante ohne Pin-Form |

## Richtung in einem Satz

**Variante Grün:** Platten-Grün `#0F8A55` (Outdoor-Charakter, Komoot) trägt die
Marke. **Variante Blau:** das vertraute Blau als `#2E6BFF` mit dunklem Navy als
Bühne und Volt für Level & Fortschritt (Playtomic). In beiden Varianten: Ball-Orange
`#FF5A36` (Meetup-Wärme) als sparsamer Akzent für alles, was Menschen
zusammenbringt. Schriften: **Bricolage Grotesque** (Headlines) + **Figtree** (UI),
beide Google Fonts.

Beide Varianten teilen Logo-Form, Struktur und Komponenten — nur die Farbwelt und
die Playtomic-Bausteine (Level, Slots) unterscheiden sich. Die Token-Mappings stehen
jeweils am Ende der HTML-Datei; `tokens-vorschlag.css` entspricht der grünen Variante.

## Migration (falls gewünscht — jede Phase einzeln shipbar)

1. **Token-Tausch**: `tokens-vorschlag.css` nach `css/tokens.css` übernehmen,
   Schriften in `css/fonts.css` austauschen → ~90 % des neuen Looks.
2. **Logo & Icons**: SVGs aus `logo/` nach `images/logo/`, App-Icon, Karten-Pins,
   Favicon, OG-Image.
3. **Feinschliff**: Hero mit Topo-Textur, Datum-Blöcke, Avatar-Stacks,
   Duotone-Eventbilder, neues Wording („Ich spiel mit!", „Runde starten").

Details, Begründungen und alle Komponenten-Specs: siehe `index.html`.
