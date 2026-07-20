# PlattenTreff — Styleguide

Dieser Styleguide fasst die in den CSS-Token- und Komponenten-Dateien (`css/tokens.css`, `css/sheets.css`, `css/components.css`, `css/base.css`) verwendeten Design-Entscheidungen zusammen. Er dient als Referenz für Farben, Typografie, Komponenten (Buttons, Inputs) und Meldungen.

**Farben**:
- **Primär (Plattengrün):** `--primary`: #0F8A55 — Hover/Dark: `--primary-d`: #0B6B42
- **Primär-Background:** `--primary-bg`: #DEF0E5
- **Primär-Mid (Focus-Shadow):** `--primary-mid`: rgba(15,138,85,0.12)
- **Akzent (Ball-Orange):** `--accent`: #FF5A36 — `--accent-d`: #E5431F — `--accent-bg`: #FFE7DF
- **Fehler / Destruktiv:** `--error`: #E53935 — `--error-d`: #C62828 — `--error-bg`: #FFE7DF
- **Sekundärfarben:** `--green`: #22C55E (`--green-bg`: #E8F9EE), `--gold`: #F7B723 (`--gold-bg`: #FDF1D7), `--silver`: #64748B, `--bronze`: #D97706
- **Neutral / Oberfläche:** `--bg`: #F7F7F7, `--bg2`: #F2F3F2, `--surface`: #FFFFFF, `--surface2`: #F1F2F1, `--border`: #E2E5E3
- **Textfarben:** `--text`: #182420, `--text-dim`: #5C6B61, `--text-xdim`: #98A79D
- **Skeleton:** `--sk-bg`: #e2e9dc, `--sk-shine`: #f0f3ec

Dark mode token-Übersicht (aus `[data-theme="dark"]`):
- `--bg`: #0D1512, `--surface`: #17231C, `--text`: #EDF4EE, `--primary`: #41C489, `--accent`: #FF7B57, `--error`: #EF5350
- Schatten- und Hintergrundfarben sind dunkler/halbtransparent angepasst (siehe `css/tokens.css`).

**Schatten & Radius**:
- **Schatten:** `--shadow-sm`, `--shadow-md`, `--shadow-lg` (vgl. `css/tokens.css`)
- **Radius:** `--radius-sm` 12px, `--radius` 18px, `--radius-lg` 24px, `--radius-xl` 32px, `--radius-pill` 999px

**Typografie**:
- **Überschriften / Display:** `--font-head`: 'Bricolage Grotesque', system-ui, sans-serif
- **Body / UI:** `--font-body`: 'Figtree', system-ui, sans-serif
- **Größen (Tokens):**
  - **Display:** `--text-display`: 1.75rem (~28px)
  - **Title / Card:** `--text-title`: 1rem (16px)
  - **UI / Buttons / Inputs:** `--text-ui`: 0.875rem (14px)
  - **Meta / Small:** `--text-meta`: 0.75rem (12px)
  - **Label / Badge:** `--text-label`: 0.6875rem (11px)
  - **Micro:** `--text-micro`: 0.625rem (10px)

- **Gewichte:** Buttons und wichtige UI-Elemente verwenden `font-weight: 700`–`800` (z.B. `.btn`, `.sheet-title`). Körpertext verwendet reguläre Gewichte (siehe `css/sheets.css`).

**Buttons (Klassen & States)**:
- Basisklasse: `.btn` — inline-flex, Padding `11px 22px`, `border-radius: var(--radius-pill)`, `font-size: var(--text-ui)`, `font-weight: 700`, `transition: all 0.2s`
- Varianten:
  - **Primary:** `.btn-primary` — `background: var(--primary); color: #fff; box-shadow: 0 4px 12px rgba(15,138,85,0.3)`
    - Hover: `.btn-primary:hover` → `background: var(--primary-d)`, `transform: translateY(-1px)`, stärkerer Shadow
  - **Secondary:** `.btn-secondary` — `background: var(--surface2); color: var(--text); border: 1.5px solid var(--border)`
    - Hover: ändert Randfarbe zu `var(--primary)` und Textfarbe zu `var(--primary)`
  - **Error:** `.btn-error` — `background: var(--error-bg); color: var(--error); border: 1.5px solid var(--error)`
    - Hover / Active: reduziert Helligkeit / fügt kleines Shadow im Active-Zustand
  - **Accent:** `.btn-accent` — `background: var(--accent); color: #fff` (Hover: leichte Aufhellung)
  - **Full width / Small:** `.btn-full`, `.btn-sm`
- **FAB:** `.fab` — fixed-position Floating Action Button, 52×52 px, `border-radius: 16px`, große Shadow; responsive Positionierung bei kleinen Viewports
- **Disabled state:** Nicht explizit mit `.disabled` in Tokens, aber standardüblich: reduzierte Opazität und `cursor: not-allowed` (keine globale `.btn[disabled]` gefunden; implementiere Konsistenz wenn benötigt)

**Inputs & Formulare**:
- Basisklassen: `.form-input`, `.form-select`, `.form-textarea`
  - Hintergrund: `var(--surface2)`
  - Border: `1.5px solid var(--border)`
  - Padding: `11px 14px`
  - Border-radius: `var(--radius-sm)`
  - Font: `font-family: var(--font-body); font-size: 1rem` (≥16px verhindert iOS-Zoom)
- **Focus:** `.form-input:focus` → `border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-mid)`
- **Fehlerzustand am Feld:** `.form-input.input-error` / `.psr-input.input-error` → `border-color: var(--error) !important` (Focus bleibt Fehlerfarbe)
- **Textarea:** `.form-textarea { resize: vertical; min-height: 80px; }`
- **Placeholder:** setzt üblicherweise `color: var(--text-xdim)` (z.B. `.map-search-input::placeholder`)
- **Form-Label:** `.form-label` — `font-size: var(--text-meta)`, `font-weight: 700`, `color: var(--text-dim)`, `text-transform: uppercase`

**Fehlermeldungen & Info-Meldungen**:
- **Inline Form Error:** `.form-error` — Box mit `background: var(--error-bg)`, `border: 1px solid rgba(229,57,53,0.25)`, Inhalt: Icon `.form-error-icon`, Title `.form-error-title` (farbig `var(--error)`), Description `.form-error-desc`
- **Top Toast / Unified Toast:** `.toast` (max-width 398px)
  - Basis: weiße Karte mit linkem 6px State-Balken (`::before`) und variablen `border-color`
  - Varianten: `.toast--info`, `.toast--success`, `.toast--warning`, `.toast--error` — Border- und Balken-Farben je Variante
  - Dark Mode: `.toast` hat dunkles Hintergrund- und Text-Farbset unter `[data-theme="dark"]`
  - Icon: `.toast-icon` mit farbigem Pill-Hintergrund per Variante
  - Aktionen: `.toast-act-btn`, `.toast-close-btn` für Buttons/Close

**Icons**:
- Utility `.icon` mit sizes: `.icon-xs` (14px), `.icon-sm` (16px), `.icon-md` (20px), `.icon-lg` (32px), `.icon-xl` (40px)

**Cards & Choice-Elements**:
- `.choice-card` — use `var(--surface)`, border `var(--border)`, border-radius `16px`, box-shadow leichte Elevation; `.choice-card--primary` hebt Icon mit `--primary-bg`/`--primary`; `.choice-card--secondary` verwendet `--gold-bg`/`--gold`.

**Accessibility & Motion**:
- `prefers-reduced-motion` handled for `.toast` (reduziert Übergänge).
- Inputs use font-size ≥16px to prevent iOS auto-zoom.
- Focus states provide visible outline via `box-shadow` on inputs.

**Praktische Regeln / Empfehlungen**:
- Verwende Token-Variablen (`--primary`, `--error`, `--text`, etc.) statt Hardcoded-Hex-Farben.
- Für interaktive Elemente: immer Fokus- und Hover-Zustände definieren (z.B. `:focus` / `:hover` / `:active`).
- Formularvalidierung: kombiniere `.form-input.input-error` mit einer sichtbaren `.form-error` Box direkt unter dem Feld.
- Buttons: `.btn-primary` für primäre Aktionen, `.btn-secondary` für neutrale Aktionen, `.btn-accent` für auffällige sekundäre Aktionen, `.btn-error` für destruktive Aktionen.

**Quellen (Dateien)**:
- Tokens: [css/tokens.css](css/tokens.css#L1-L200)
- Komponenten & Forms: [css/sheets.css](css/sheets.css#L1-L520), [css/components.css](css/components.css#L2520-L2575)
- Basis: [css/base.css](css/base.css)

---
Wenn du möchtest, kann ich:
- a) die Datei in `docs/` oder `design-entwurf/` verschieben und als HTML/MD anpassen, oder
- b) zusätzliche Visual-Swatches (PNG/SVG) erstellen, oder
- c) ein CSS-Fragment mit Beispielkomponenten (`.btn`, `.form-input`, `.toast`) für die Storybook-/Dokumentationsansicht generieren.

Bitte sag mir, welche Option du bevorzugst, oder öffne direkt die Beispielseite:

- Beispielseite: [docs/styleguide-examples.html](docs/styleguide-examples.html)

Farbpaletten (visuelle Swatches):

- Light mode SVG: [docs/palette-light.svg](docs/palette-light.svg)
- Dark mode SVG: [docs/palette-dark.svg](docs/palette-dark.svg)

Weitere Assets:

- Schatten-Preview: [docs/palette-shadows.svg](docs/palette-shadows.svg)
- Icon-Sprite (SVG): [docs/icon-sprite.svg](docs/icon-sprite.svg)

## Ergänzende Dokumentations‑Sektionen

Um den Styleguide vollständig und nutzbar für Designer und Entwickler zu machen, wurden hier ergänzende Sektionen aufgenommen. Jede Sektion ist kurz gehalten und enthält Hinweise, Konventionen sowie Beispiel‑Snippets.

**Designprinzipien**
- Kurz: Mobile‑First, Community‑orientiert, schlicht, performance‑orientiert.
- Ton & UX: freundlich, klar, keine unnötige Gamification.
- Regeln: bestehende Komponenten wiederverwenden, Dark Mode unterstützen.

**Token‑Referenz (Erweitert)**
- Farben, Typografie, Abstände, Radien, Schatten: nutze die CSS‑Variablen in `css/tokens.css` als Single Source of Truth.
- Beispiel: Primärfarbe: `--primary` (#0F8A55) — für CTAs und Akzente.

**Komponenten‑Katalog (Pattern)**
- Struktur jeder Komponente:
  - Zweck: kurze Beschreibung
  - Varianten: Klassen / Props
  - States: Default / Hover / Focus / Disabled / Loading / Error
  - HTML/CSS‑Snippet
  - Do’s & Don’ts
- Beispiel: `Button` (aus `css/sheets.css`)

HTML Beispiel — Primary Button

```html
<button class="btn btn-primary">Speichern</button>
```

Do: Verwende `btn-primary` für primäre Aktionen. Don’t: harte Hexwerte anstelle von `--primary`.

**Interaktions‑States**
- Buttons: `:hover`, `:active`, `:focus`, `[disabled]` — Fokus sichtbar, Hover leicht anheben.
- Inputs: Default → Focus (`box-shadow: 0 0 0 3px var(--primary-mid)`), Error → `.input-error` + `.form-error` Box.

**Formular‑Patterns & Validierung**
- Labels: Immer `label` mit `for` verwenden; `.form-label` für Styling.
- Inline‑Fehler: `.form-error` unter dem Feld, Icon + Title + Description.
- ARIA: setze `aria-invalid="true"` bei fehlerhaften Feldern; `aria-describedby` auf die Fehler‑ID.

**Accessibility**
- Kontrastanforderungen prüfen (AA/AAA wo nötig). Beispiel: Text auf `--surface` muss min. 4.5:1 für Body haben.
- Tastaturnavigation: alle interaktiven Elemente fokussierbar (Tabindex / native controls).
- Screenreader: nutze `role`, `aria-live` (z.B. `.toast` hat `aria-live="polite"`).
- `prefers-reduced-motion`: Übergänge reduzieren oder deaktivieren.

**Responsive Regeln & Layout**
- Breakpoints: Mobile‑First; max‑width Container `430px` (sheets) und größere Container in App‑Layouts.
- Spacing: konsistente Abstände mit Multiples (8px Grid empfohlen).

**Motion & Micro‑interactions**
- Dauer: kurz (100–300ms) für Hover/Focus, etwas länger (300–600ms) für Dialog‑Transitions.
- Easing: weiche Kurven, z.B. `cubic-bezier(0.32, 0.72, 0, 1)` (wie in Sheets).
- Nicht für kritische UI verwenden; respektiere `prefers-reduced-motion`.

**Iconographie & Bilder**
- Icon‑Sizes: `.icon-xs`, `.icon-sm`, `.icon-md`, `.icon-lg`, `.icon-xl`.
- Verwende das Icon‑Sprite (`docs/icon-sprite.svg`) oder SVG‑Komponenten; setze `alt` oder `aria-hidden` korrekt.
- Bilder: aus Supabase Storage laden; immer Fallback/Placeholder anzeigen.

**Theming & Dark Mode**
- Tokens: Dark Mode Werte in `[data-theme="dark"]` definieren; weiche Übergänge beim Theme‑Switch vermeiden.
- Regeln: benutze RGBA‑Token (`--primary-mid`) für Focus‑Shadows, damit sie im Dark Mode lesbar bleiben.

**Design‑Assets & Exporte**
- Figma/Source: verlinke zentral (falls vorhanden) und beschreibe Export‑Konventionen (SVGs: Optimized, 24/32px grid; PNG: 2×/3× für Retina).
- Naming: component‑name--variant.svg / token‑name.png

**Code‑Snippets & Integrationen**
- Beispiele: HTML/CSS (gem. oben), React: `Button`-Komponente, Token‑JSON Export.
- Empfehlung: Storybook für visuelle Dokumentation und Regressionstests.

**Testing & Versioning**
- Visuelle Regression (Chromatic/Playwright) für Komponenten.
- Token/Component Changelog: semver für Breaking changes an Tokens.

**Contribution Policy**
- Vorgehen: Änderung als Issue + Pull Request mit Screenshot/Storybook‑Story.
- Review‑Checkliste: visuelle Tests, Accessibility‑Check, Dark Mode, responsive Check.

**Internationalisierung & RTL**
- Texte externalisieren (i18n). Teste Layout mit langen Strings.
- RTL: prüfe mirroring von Icons/Layouts, erkenne per `dir="rtl"`.

---
Ich habe die Sektionen ergänzt. Nächster Schritt: möchtest du, dass ich für jede Sektion noch detaillierte Beispiele (z.B. React‑Komponenten oder Storybook‑Stories) erstelle? Bitte kurz antworten: "Ja, React" / "Ja, Storybook" / "Nein".
