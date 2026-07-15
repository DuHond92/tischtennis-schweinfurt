# PlattenTreff — Styleguide Audit

Datum: 2026-07-14

Ziel: Analyse des Repositories auf Inkonsistenzen und Duplikate bzgl. Komponenten, Patterns und States. Grundlage sind die Regeln im `STYLEGUIDE.md`.

Kurzfassung
- Projektumfang gescannt (HTML, JS, CSS). Viele zentrale Patterns sind vorhanden (`.btn`, `.form-input`, `.toast`, `.bottom-sheet`, `.form-error`) — das ist gut.
- Es existieren jedoch mehrere lokale / alternative Implementierungen für Buttons, Tags/Chips, Card-Layouts, Confirmations, und einige Screen-spezifische Variationen (z.B. `lpc-btn`, `f-btn`, `dir-chip`, `mini-chip`, `fc-type-badge`, `admin-card`, `tds-event-card`).
- Empfehlung: keine ad-hoc UI-Lösungen mehr; Schrittweises Refactoring in drei Phasen (Inventar → Zentralbibliothek → Migration per Screen/PR).

Wichtige Fundstellen (Auszug)

Buttons
- Standard `.btn` verwendet in vielen Dateien: `js/admin.js`, `js/messages.js`, `docs/styleguide-examples.html`, `js/tables.js`, `index.html`, `www/*`.
- Alternative, projektspezifische Buttons / Variants gefunden:
  - `lpc-btn`, `lpc-btn-primary` (in `js/map.js`)
  - `.f-btn` (in `design-entwurf/logo-schrift-vergleich.html`)
  - Inline-styles on `<button ... style="...">` found in a few places (`js/admin.js`, `js/notifications.js`, `js/tables.js`).

Modals / Confirmations
- Central patterns: `cd-overlay`, `cd-box` and `bottom-sheet` exist.
- Many `onConfirm` callbacks and confirm flows across `js/*` (e.g. `js/event-detail.js`, `js/messages.js`, `js/tables.js`, `js/admin.js`).
- Files referencing confirm flows: `js/ui.js`, `www/js/*`, `android/.../public/js/*`.

Toasts / Snackbar
- Unified `.toast` class + `toast--info|success|warning|error` in `css/sheets.css`.
- `showSnackbar` / `showToast` calls in `js/map.js`, `js/ui.js`, `js/messages.js`. Appears largely centralized but check for any bespoke snackbar HTML.

Inputs & Forms
- `.form-input`, `.form-select`, `.form-textarea` widely used (e.g. `index.html`, `js/events.js`, `www/index.html`).
- Map/location search uses `psr-input` / `psr-input-wrap` (map-specific pattern) — consider merging into a central `SearchField` component pattern.
- Error handling uses `.form-error` and `.input-error` in `css/components.css` — several JS files manipulate `aria-invalid` and classes.

Tags / Badges / Chips
- Multiple patterns found: `.tag` (design-entwurf), `.mini-chip`, `.dir-chip` (design-entwurf), `.fc-type-badge` (in `js/ps-detail.js`), map-loc-chip (in `js/map.js`).
- These are inconsistent; must be normalized to a single Tag/Badge component with type token mappings.

Cards (Player / Game / Admin / Event)
- Multiple card types: `admin-card`, `tds-event-card`, `stat-card`, `f-card-demo`, and generic `.card` usages.
- Player and Game Cards appear in `js/tables.js`, `js/admin.js`, `js/map.js`, `index.html`. Need unified `PlayerCard` and `GameCard` components.

Loading / Skeleton
- `skeletonList` functions used in `js/messages.js`, `js/tables.js`, `index.html` loader elements exist. Patterns are present but ensure consistency in animation and tokens.

BottomSheets / FAB
- `.bottom-sheet`, `.sheet-overlay`, `.sheet-handle` are defined and used in `index.html`, `js/map.js`, `js/tables.js` — generally consistent.
- FAB elements exist (`.fab`, `.map-fab`, `#main-fab`) — check consistent sizing/positioning.

Icons
- Icon utility `.icon` and sprite usage exist; an `icon-sprite.svg` was added to `docs/`. Ensure all icons use same source (SVG sprite or inline SVG components), not image fallbacks.

Skeleton of Recommended Process

1) Inventory & Canonical Definitions (this PR)
- Produce a definitive components list (Button, Tag, Badge, InputField, SearchField, TextArea, Slider, BottomSheet, Modal, ConfirmationDialog, Snackbar, InlineMessage, Avatar, PlayerCard, GameCard, LocationPicker, EmptyState, LoadingState, SkeletonLoader, Tabs, Dropdown, Navigation, Chips, Filters, Date/Time Picker).
- For each, list:
  - Existing CSS classes and JS renderers
  - Files using non-central variants
  - Suggested canonical class / component name

2) Create Central Library (one component per function)
- Implement as: (choose one)
  - a) Vanilla JS components + central include (fast, minimal), or
  - b) React component library (requires migration; preferable for long-term maintainability), or
  - c) Web Components (framework agnostic)
- Add Storybook stories for each component and all states.

3) Migration (per-screen PRs)
- Migrate screens to use central components. Each PR:
  - Replaces local patterns with central component
  - Adds/updates Storybook and tests
  - Ensures no visual regression

High Priority Refactors (first pass)
- Normalize Tag/Badge system (there are many variants). Centralize token mapping: content type tag + game-mode tag.
- Inspect Button variants, remove local variants (`lpc-btn`, `f-btn`) and map to `.btn` variants.
- Merge confirm/confirmation flows into a single `ConfirmationDialog` API used by `js/ui.js`.
- Ensure `.toast` usage only via `showSnackbar` helper and remove direct DOM inserts outside helper.
- Centralize SearchField/psr-input into `SearchField` pattern.

Files with likely duplicates (sample list)
- `js/admin.js` — custom buttons + confirm flows
- `js/map.js` — lpc-btn, map-specific chips, toasts
- `js/messages.js` — skeletons, toasts, buttons
- `js/tables.js` — multiple card templates
- `index.html` / `www/index.html` — various inline patterns, sheets, fab
- `design-entwurf/*` — prototypes with unique classes (`.f-btn`, `.mini-chip`) — these may be design docs, not app runtime but useful as references.

Risks & Notes
- Automatic massive refactors are risky — prefer incremental PRs per screen/component with visual tests.
- Converting to React would be non-trivial and require build tooling changes; confirm before starting such a migration.

Nächste Schritte (Vorgeschlagener Workflow)
1. Du wählst die Technologie für zentrale Komponenten: "Vanilla" / "React" / "WebComponents".
2. Ich erstelle ein ausführliches Inventory-Spreadsheet (oder `docs/COMPONENT_INVENTORY.md`) mit alle Fundstellen pro Komponente.
3. Danach erstelle ich eine zentrale `components/` Bibliothek (skeleton implementation + Storybook stories) und beginne mit 1–2 High‑Priority Refactors (Tag-System und Button‑Normalisierung) in separaten PRs.

Möchtest du, dass ich sofort mit Schritt 2 (detailliertes Inventory in `docs/COMPONENT_INVENTORY.md`) beginne? Oder bevorzugst du vorher eine Entscheidung zur Zieltechnologie (Vanilla / React / WebComponents)?


---
Audit automatisch erstellt von Copilot‑Agent. Wenn du mit der vorgeschlagenen Reihenfolge einverstanden bist, antworte bitte mit "Start Inventory" oder nenne die gewünschte Ziel‑Technologie (Vanilla / React / WebComponents).