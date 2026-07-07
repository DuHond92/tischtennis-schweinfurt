# Deployment — PlattenTreff

## Kanonische Domain

```
https://plattentreff.app
```

`www.plattentreff.app` leitet per 308-Redirect auf `plattentreff.app` weiter.
`plattentreff.vercel.app` ist die technische Vercel-Fallback-URL — nicht öffentlich kommunizieren.

---

## Vercel-Konfiguration

**Datei:** `vercel.json`

```json
{
  "buildCommand": "npm run build:cap",
  "outputDirectory": "www",
  "cleanUrls": true,
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "www.plattentreff.app" }],
      "destination": "https://plattentreff.app/$1",
      "permanent": true
    }
  ]
}
```

**Vercel Dashboard → Domains (Stand 2026-07-07):**

| Domain | Status |
|---|---|
| `plattentreff.app` | Production (primär) |
| `www.plattentreff.app` | 308 Redirect → `plattentreff.app` |
| `plattentreff.vercel.app` | Production (technisch, nicht öffentlich) |

**Deployment:** Automatisch bei jedem Push auf `main` via GitHub-Integration.

---

## Build-Prozess

```bash
npm run build:cap   # Kopiert www/ aus index.html, css/, js/, images/, legal pages
npm run cap:sync    # Sync in iOS- und Android-Projekte
```

**Was in `www/` landet** (definiert in `scripts/build-cap.js`):
- `index.html`, `favicon.*`, `apple-touch-icon.png`, `manifest.webmanifest`
- `css/` (inkl. `fonts/` WOFF2-Dateien)
- `js/`
- `images/`
- `datenschutz/`, `impressum/`, `nutzungsbedingungen/`

---

## Supabase Auth — URL-Konfiguration

Im Supabase Dashboard unter **Authentication → URL Configuration** eintragen:

**Site URL:**
```
https://plattentreff.app
```

**Redirect URLs (Allowlist):**
```
https://plattentreff.app/**
https://www.plattentreff.app/**
https://plattentreff.vercel.app/**
http://localhost:3000/**
http://localhost:5173/**
```

(`www` bleibt in der Allowlist, damit Nutzer über alte Links korrekt landen und Auth-Redirects funktionieren.)

---

## URL-Konstanten im Code

**`js/supabase.js`:**
```js
const APP_BASE_URL  = 'https://plattentreff.app';
const PRIVACY_URL   = APP_BASE_URL + '/datenschutz/';
const IMPRINT_URL   = APP_BASE_URL + '/impressum/';
const TOS_URL       = APP_BASE_URL + '/nutzungsbedingungen/';
```

---

## Öffentliche URLs

| Zweck | URL |
|---|---|
| App | https://plattentreff.app |
| Datenschutzerklärung | https://plattentreff.app/datenschutz/ |
| Impressum | https://plattentreff.app/impressum/ |
| Nutzungsbedingungen | https://plattentreff.app/nutzungsbedingungen/ |

---

## Store-Angaben

| Feld | Wert |
|---|---|
| App Website | https://plattentreff.app |
| Privacy Policy URL | https://plattentreff.app/datenschutz/ |
| Support URL | https://plattentreff.app/impressum/ |
| Support-Mail | support@plattentreff.app |
| Kontakt | kontakt@plattentreff.app |

---

## Lokale Entwicklung

```bash
# Statischer Dev-Server
npx serve .

# iOS Simulator
npm run cap:sync && npx cap open ios

# Android Emulator
npm run cap:sync && npx cap open android
```

---

## Schriftarten

Nunito wird **lokal** ausgeliefert (`css/fonts/`, `css/fonts.css`).
Keine externen Requests zu `fonts.googleapis.com` oder `fonts.gstatic.com`.
