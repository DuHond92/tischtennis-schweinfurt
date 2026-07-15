# COMPONENT INVENTORY — PlattenTreff

Datum: 2026-07-14
Scope: Vollständige, dateigenaue Bestandsaufnahme relevanter UI‑Komponenten und Varianten. Grundlage: Grep‑Scan des Repos (HTML, JS, CSS).

Hinweis: Dies ist ein Audit / Inventory. KEINE Code‑Änderungen wurden vorgenommen.

---

## Zusammenfassung / Legende
- **Pfad**: relative Datei im Repo
- **Klasse / Name**: CSS‑Klasse oder logische Komponente/Helper (JS‑Funktion) wie gefunden
- **Verwendungszweck**: kurz
- **Varianten**: aufgezeichnete Varianten / lokale Abwandlungen
- **Abweichungen**: erkennbare Verstöße gegen `STYLEGUIDE.md` (Token/State/Pattern)
- **Mögliche Duplikate**: ähnliche lokale Implementierungen, die vereinheitlicht werden sollten
- **Zielkomponente**: empfohlener zentraler Name / Pattern
- **Priorität**: hoch / mittel / niedrig (für Refactor)
- **Migrationsrisiko**: niedrig / mittel / hoch (bei Ersetzen in App)

---

## 1) Buttons

Fundstellen (Beispiele):
- `docs/styleguide-examples.html` — `btn`, `btn-primary`, `btn-secondary`, `btn-accent`, `btn-error`, `btn-sm`, `btn-full`, `fab`
- `js/messages.js` — `btn`, `btn-primary` (inbox / accept/decline actions)
- `js/admin.js` — `.btn`, `.btn-sm`, `.admin-reject-btn`, inline style usage
- `js/tables.js` — `.btn`, `.btn-secondary btn-sm btn-full`, `.tds-float-create`
- `js/map.js` — `lpc-btn`, `lpc-btn-primary` (map-specific locate permission button)
- `design-entwurf/logo-schrift-vergleich.html` — `.f-btn` (design demo)
- `index.html` — various `.fab` elements and `.fab-labeled`

Verwendungszweck: Interaktive Aktionen, CTAs, FABs.

Varianten:
- Canonical: `.btn` + modifier classes (`.btn-primary`, `.btn-secondary`, `.btn-error`, `.btn-accent`, `.btn-sm`, `.btn-full`)
- Local/legacy: `lpc-btn`, `pg-btn-primary`, `f-btn`, inline-styled buttons, `.pg-btn-secondary`, `.admin-reject-btn`, `.tds-float-create`

Abweichungen vom STYLEGUIDE:
- Lokale Klassen (e.g. `lpc-btn`) statt Standard `.btn` → visuelle/Deklarative Abweichungen
- Inline `style="opacity:.5"` or style attributes on buttons

Mögliche Duplikate: `lpc-btn` vs `.btn`, `pg-btn-primary` vs `.btn-primary`, variations in admin JS and templates.

Zielkomponente: `Button` (class `.btn`) — modifiers via BEM or utility classes: `.btn--primary`, `.btn--secondary`, `.btn--accent`, `.btn--error`, `.btn--sm`, `.btn--full`.

Priorität: Hoch (Buttons sind überall)
Migrationsrisiko: Mittel bis Hoch (viele occurrences and inline handlers)

---

## 2) Tags und Chips / Badges

Fundstellen (Beispiele):
- `design-entwurf/variante-blau.html` — `.dir-chip`, `.mini-chip`, `.mast-tag`
- `design-entwurf/logo-schrift-vergleich.html` — `.tag`
- `js/ps-detail.js` — `fc-type-badge` (GESUCH badge)
- `js/map.js` — `map-loc-chip` (map location chip), `map-filter-btn` behaves like chip
- `js/messages.js`, `js/notifications.js` — badges for inbox/notifications

Verwendungszweck: Anzeige von Inhaltstyp und Spielmodus (core requirement per spec)

Varianten:
- `.fc-type-badge`, `.tag`, `.mini-chip`, `.dir-chip`, `.mast-tag`, `osm-badge`

Abweichungen:
- Viele visual variants in design protos and templates; inconsistent colors/size/semantics.
- Some badge usages are not token-driven.

Mögliche Duplikate: `.mini-chip` / `.dir-chip` / `.tag` / `.fc-type-badge` — should consolidate to `Tag` component with `type` and `mode` props.

Zielkomponente: `Tag` (props: `type: ['gesuch','spiel']`, `mode: ['punktspiel','just4fun']`, variants: `compact`, `default`)

Priorität: Hoch
Migrationsrisiko: Mittel

---

## 3) Cards (PlayerCard, GameCard, Admin Card, Generic Cards)

Fundstellen (Beispiele):
- `js/tables.js` — `tds-event-card`, `detail-slider` related cards
- `js/admin.js` — `admin-card`, `admin-card-row`
- `design-entwurf/*` — `.card`, `.platte-card`, `.f-card-demo`
- `index.html` — `stat-card`, `home` cards

Verwendungszweck: Darstellung von Platten, Events, Spieler, Admin info.

Varianten:
- `player-search-card`, `player-card`, `game-card`, `admin-card`, `tds-event-card`, `stat-card`, `platte-card`

Abweichungen:
- Different paddings, radii, shadows across variants; some not using tokens for spacing or colors.

Mögliche Duplikate: multiple event/player card implementations across files

Zielkomponente: `PlayerCard`, `GameCard`, `AdminCard` derived from `Card` base (tokenized)

Priorität: Hoch
Migrationsrisiko: Hoch (many screens depend on cards)

---

## 4) Inputs & Formulare (InputField, SearchField, TextArea, Select)

Fundstellen (Beispiele):
- `css/sheets.css` — canonical `.form-input`, `.form-select`, `.form-textarea`
- `index.html` — `map-search-input`, `psr-input`, event create inputs (ev-name, ev-desc, ev-date, ev-time)
- `js/map.js` — `map-search` interactions
- `js/events.js`, `www/js/events.js` — validation, aria-invalid usage
- `android/.../public/index.html` and `ios/...` also contain form errors and inputs

Varianten:
- `psr-input`, `pe-field-input`, `map-search-input`, `.form-input` (canonical)

Abweichungen:
- `psr-input` (map-specific) duplicates behavior of `SearchField`
- Some inputs have inline scripts/attributes for events

Zielkomponente: `InputField`, `SearchField` (extends InputField with dropdown/autocomplete), `TextArea`, `Select`

Priorität: Hoch
Migrationsrisiko: Mittel

---

## 5) Toasts & Snackbars

Fundstellen:
- `css/sheets.css` — centralized `.toast`, `.toast--info`, `.toast--success`, `.toast--warning`, `.toast--error`
- `js/ui.js` / `js/map.js` / `js/admin.js` / `js/messages.js` — call `showToast` or `showSnackbar`
- `ios/...` and `www/js/*` copies also present

Varianten:
- `toast` with modifiers; `showSnackbar` helper used in some places; some code uses `showToast` with different param shapes.

Abweichungen:
- Mostly centralized; check multiple helper implementations for consistent API (some pass `{title, message, type}` others pass (text,type)).

Zielkomponente: `Snackbar` / `Toast` with single JS helper API (consistent signature)

Priorität: Mittel‑hoch
Migrationsrisiko: Niedrig (centralized already)

---

## 6) Inline-Fehler

Fundstellen:
- `css/components.css` — `.form-error` definition
- `index.html`, `android/.../index.html`, `ios/.../index.html` — inline containers `#ec-form-error`, `#ms-loc-error`
- `js/events.js`, `js/ui.js` — functions that add/remove `.input-error` and update `.form-error`

Varianten:
- The `.form-error` box is used across, good centralization. Some screens create their own markup.

Abweichungen:
- Some inline errors use inline `style` attributes or different aria attributes; ensure consistent `role=alert aria-live` setup.

Zielkomponente: `InlineMessage` (type: error/warning/info) with standardized structure and ARIA.

Priorität: Hoch
Migrationsrisiko: Niedrig-Medium

---

## 7) Dialoge & ConfirmationDialogs

Fundstellen:
- `css/components.css` / `css/sheets.css` — confirm styles + `cd-overlay`, `cd-box`
- `js/ui.js` — `showConfirmDialog`, global `_cdOnConfirm` callback used in many files
- Uses in `js/admin.js`, `js/messages.js`, `js/tables.js`, `js/event-detail.js` etc.

Varianten:
- Existing central `showConfirmDialog` flow exists; however many places call `confirmRemoveConnection`, `adminRejectConfirm` custom wrappers

Abweichungen:
- Some confirm invocations use inline HTML templates and custom logic rather than the central API.

Zielkomponente: `ConfirmationDialog` central component / helper, used by all confirmations.

Priorität: Hoch
Migrationsrisiko: Mittel (due to callbacks and async flows)

---

## 8) Bottom Sheets & Modals

Fundstellen:
- `css/sheets.css` central bottom-sheet styles. Instances in `index.html` (many sheets), `js/map.js`, `js/tables.js`.

Varianten:
- `.bottom-sheet`, `.bottom-sheet.fullscreen-sheet`, `.bottom-sheet.slide-right-sheet`

Abweichungen:
- Sheets appear consistently styled; some JS controls their behavior directly. Good centralization but migrate any custom sheets to use same initialization helpers.

Zielkomponente: `BottomSheet` base; `BottomSheetFullscreen` / `RightSlideSheet` variants.

Priorität: Mittel
Migrationsrisiko: Niedrig-Medium

---

## 9) Navigation

Fundstellen:
- `index.html` — map Filter header, FABs, bottom navigation prototypes in design docs
- `design-entwurf/variante-blau.html` — bottom nav `.pnav`
- `js/tables.js` / `js/home.js` — navigation controls, `navStat` helper

Abweichungen:
- Multiple nav prototypes in design files; runtime uses simple handlers. Standardization advisable.

Zielkomponente: `BottomNav`, `TopBar`, `SideMenu` as needed.

Priorität: Mittel
Migrationsrisiko: Niedrig

---

## 10) Loading- & Empty-States, Skeletons

Fundstellen:
- `css/base.css` — skeleton styles
- `index.html` — `pt-loader` splash, skeleton elements used in event cards
- `js/messages.js`, `js/tables.js` — skeletonList/skeletonComment usage

Abweichungen:
- Several ad-hoc skeleton wrappers but generally using common classes. Ensure token-based colors and animation durations.

Zielkomponente: `SkeletonLoader`, `LoadingState`, `EmptyState` components

Priorität: Mittel
Migrationsrisiko: Niedrig

---

## 11) Icons

Fundstellen:
- Many uses of `ic()` helper in JS templates (e.g. `js/admin.js`, `js/home.js`, `js/map.js`, `js/messages.js`)
- CSS utility `.icon` in `css/tokens.css` and multiple SVGs in `images/` and `docs/icon-sprite.svg` we added

Abweichungen:
- Some icons inlined, others via helper `ic()`, others via `<use href="#icon-...">`; unify to one approach.

Zielkomponente: `Icon` utility + central sprite or SVG components

Priorität: Mittel
Migrationsrisiko: Niedrig

---

## 12) Filter (Filter buttons / chips / sheets)

Fundstellen:
- `css/components.css` — map filter styles and `.filter-pills`
- `index.html` — `map-filter-btn`, `events-filter-chips`
- `js/map.js` — map filter logic

Abweichungen:
- Filter UI is a mixture of buttons and chips; standardize Filter component API.

Zielkomponente: `FilterPills`, `FilterSheet`

Priorität: Mittel
Migrationsrisiko: Niedrig-Medium

---

## 13) Slider / Photo Slider

Fundstellen:
- `js/tables.js` — `buildPhotoSlider`, `detail-slider` implementation
- `js/event-detail.js` — `buildEventSlider`

Abweichungen:
- Custom slider code exists per screen; consider abstracting a `Slider` component if reused.

Zielkomponente: `Slider` (photo carousel) abstracted and reused

Priorität: Niedrig-Medium
Migrationsrisiko: Mittel (touch logic & edge cases)

---

## 14) Avatar

Fundstellen:
- `index.html` — `profile-avatar`, `avatar-picker-sheet`, various avatar placeholders
- JS uses avatar URL / emoji fields (supabase profile calls in `js/messages.js`, `js/connections.js`)

Abweichungen:
- Some screens show emoji fallback, others image fallback; central `Avatar` component should handle both and consistent sizing.

Zielkomponente: `Avatar` with props: `size`, `src`, `emoji`, `badge`.

Priorität: Mittel
Migrationsrisiko: Niedrig

---

## 15) Listen- & Detailansichten

Fundstellen:
- `js/tables.js`, `www/js/tables.js` — Table lists and table details
- `index.html` and `js/*` — event list, player list, messages list
- `table-detail-sheet`, `table-detail` implementations

Abweichungen:
- Repetition of list/rendering templates across JS files; propose shared render helpers or components.

Zielkomponente: `ListView` + `DetailView` primitives with item renderers (PlayerList, EventList)

Priorität: Hoch
Migrationsrisiko: Mittel

---

## Auswertung — wichtigste Duplikate (Kurz)
1. Button variants: `.btn` vs `lpc-btn`, `pg-btn-*`, inline styles — unify to `.btn` with modifiers. (Priorität: Hoch)
2. Tags / Chips: many local chip/tag classes — unify to `Tag` with `type/mode`. (Hoch)
3. Cards: multiple card templates (`admin-card`, `tds-event-card`, `platte-card`) — derive from single `Card` base. (Hoch)
4. Confirm flows: multiple `onConfirm` call sites and wrappers — unify to central `ConfirmationDialog` helper. (Hoch)
5. Search / psr-input vs `map-search-input` — create `SearchField` (Mittel)
6. Icon usage: mixed `ic()` helper, inline SVGs and sprite usage — centralize. (Mittel)

---

## Zielarchitektur Empfehlung (kurz)
- Single Source Components folder (logical): `/components/` with subfolders per component (Button, Input, Tag, Card, Toast, Dialog, BottomSheet, Avatar, Icon, List, Skeleton).
- Each component: presentational CSS (classes or CSS Modules), and a thin JS wrapper for behavior (show/hide, aria). Prefer a component approach that fits tech stack (siehe Empfehlung unten).
- Storybook: one story per component, include all states and variants.
- Migration by feature/PR: replace usage in one screen at a time, run visual check.

---

## Technologieempfehlung: React / Vanilla / WebComponents
**Empfehlung:** Vanilla‑to‑React hybrid path — short term: central Vanilla JS components + consistent CSS (fast). Mittel/Long term: migrate to React components and Storybook.

Begründung anhand Tech‑Stack:
- Codebase is primarily plain JS templates + static HTML + some platform builds (`android/www`, `ios` public). There is no existing React build system.
- Immediate work should not require adding major build changes. Daher: Erstellt eine zentrale, framework‑agnostische Komponenten‑Schicht in Vanilla JS (ES modules) + shared CSS tokens — das ermöglicht schnelle Konsolidierung.
- Für langfristige Wartbarkeit und Storybook/Component Driven Development ist React empfehlenswert. Die Migration auf React ist aber ein größeres Projekt (build, bundler, compile for mobile wrappers) und sollte geplant.

Kurz:
- Kurzfristig (1–3 Monate): Vanilla components + Storybook (Storybook can run with plain HTML/JS stories) — quick wins.
- Mittelfristig (3–12 Monate): Planed React migration for better DX, reusability and typed components.

---

## Konkrete Migrationsreihenfolge (Screen / Area basiert)
Priorität A (Start sofort):
1. Buttons — unify all button usages to `.btn` selectors; replace local classes and inline styles. (screens: admin, messages, map, tables)
2. Tag/Badge System — standardize type + mode mapping; replace local tag classes. (screens: ps-detail, map, events)
3. Confirmation Dialog — enforce use of `showConfirmDialog` helper and remove local templates. (admin, messages, tables)
4. Inline Error — ensure `.form-error` + `.input-error` used across forms. (events, auth, profile)

Priorität B (after A):
5. Cards: `PlayerCard` & `GameCard` canonicalization (tables, index, map previews)
6. Inputs/SearchField: create `SearchField` wrapper for map search and other autocompletes
7. Toast API: align `showToast` / `showSnackbar` signatures and usages

Priorität C (later):
8. Icons: centralize `ic()` helper to use sprite or components
9. Skeletons & Loading: ensure tokenized animations and unify helper generators
10. BottomSheets: move screen-specific sheets to central initialization helper

Für jede Migration: erstelle PR, Storybook story, visual diff.

---

## Nächste Schritte (erbetene Freigabe)
1. Falls du zustimmst: ich erstelle jetzt `docs/COMPONENT_INVENTORY.md` (diese Datei) — fertig.
2. Nach deiner Freigabe kann ich:
   - a) automatisch erzeugte CSV/Spreadsheet mit allen Vorkommen exportieren, oder
   - b) mit Refactor‑Plan und ersten PRs beginnen (Buttons + Tags als erstes), oder
   - c) zuerst eine Vanilla components‑skeleton und Storybook config erstellen.

Bitte bestätige den nächsten Schritt: "Approve Inventory" und ob du Kurzfristig Vanilla‑ oder React‑First-Strategie wünschst (empfohlen: "Vanilla first, React later").

---

(Ende Inventar)
