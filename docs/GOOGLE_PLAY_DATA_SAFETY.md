# Google Play Data Safety — PlattenTreff

**App:** PlattenTreff  
**Package:** de.plattentreff.app  
**Stand:** 2026-07-07

---

## Kurzfassung

| Data Type | Collected | Shared | Required/Optional | Purpose | Encrypted | Deletion |
|---|---|---|---|---|---|---|
| Personal info → Email address | Yes | No | Required | Account management, App functionality, Authentication | Yes | Yes |
| Personal info → Name | Yes | No | Required (Spielername) | App functionality, User profile/Community | Yes | Yes |
| Photos and videos → Photos | Yes | No | Optional | App functionality, User-generated content | Yes | Yes |
| Location → Precise location | Yes | No | Optional | App functionality, Location-based features | Yes | Yes / beim Logout |
| Messages → Other in-app messages | Yes | No | Optional | App functionality, Communications | Yes | Yes / anonymisiert |
| App activity → App interactions | Yes | No | Optional (Opt-out) | Analytics, App functionality, Product improvement | Yes | User-ID entfernt |
| User content → Other user content | Yes | No | Optional | App functionality, Community, Moderation/Safety | Yes | Yes / anonymisiert |

**Nicht deklariert:** Advertising ID, Financial info, Health, Contacts, Calendar, Diagnostics, Web browsing, Audio, Installed apps, Device IDs

---

## 1. Grundsatzfragen

### Werden Daten erhoben?
**Ja**

### Werden Daten mit Dritten geteilt?
**Nein**

Supabase, Vercel und Cloudflare sind Auftragsverarbeiter/Infrastruktur-Dienstleister — keine Datenweitergabe im Sinne von Google Play Data Safety (kein Teilen zu eigenen Werbezwecken, kein Verkauf).

### Werden Daten verkauft?
**Nein**

### Werden Daten für Werbung genutzt?
**Nein**

### Werden Daten für Tracking genutzt?
**Nein**

---

## 2. Security Practices

| Sicherheitsmerkmal | Status |
|---|---|
| Daten werden während der Übertragung verschlüsselt | ✅ HTTPS/TLS |
| Daten können vom Nutzer gelöscht werden | ✅ Account-Lösch-Flow |
| App folgt Googles Richtlinien zu Kindersicherheit | n/a — keine Kinder-App |

---

## 3. Account-Löschung (Google-Play-Pflichtangabe)

Google Play verlangt, dass Apps mit Account-Erstellung auch Account-Löschung ermöglichen.

**Account creation:** Ja  
**Account deletion:** Ja — in der App und per E-Mail

### In-App-Löschung:
Profil → Rechtliches → Account löschen

### Web-URL für Account-Löschung:
```
https://plattentreff.app/account-loeschen/
```

Diese URL in Google Play Console unter **Data Safety → Account deletion** eintragen.

### Was wird gelöscht / anonymisiert?

| Daten | Behandlung bei Löschung |
|---|---|
| Account, E-Mail, Auth-Daten | Dauerhaft gelöscht |
| Profil (Spielername, Avatar) | Dauerhaft gelöscht |
| Spielrunden, Gesuche, Kommentare | Gelöscht |
| Direktnachrichten | Gelöscht |
| Fotos / Uploads | Gelöscht |
| Suchstandortdaten (localStorage) | Sofort beim Logout gelöscht |
| Analytics-Events | User-ID wird per `ON DELETE SET NULL` entfernt — Nutzerbezug aufgehoben |

---

## 4. Personal Info → Email Address

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Required (für Account/Login) |
| Purpose | Account management, App functionality, Authentication |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes |

Begründung: E-Mail wird für Supabase Auth (Login, Registrierung, Passwort-Reset) verwendet. In `auth.users` dauerhaft gespeichert bis zur Account-Löschung.

Datenschutz-Abdeckung: Abschnitt 5 (Registrierung und Account)

---

## 5. Personal Info → Name

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Required (Spielername für Profil/Community) |
| Purpose | App functionality, User profile/Community |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes |

Hinweis: Dies ist der **Spielername/Anzeigename**, kein bürgerlicher Name. Er ist in der Community sichtbar (Profil, Kommentare, Spielrunden, Nachrichten, Teilnehmerlisten).

Datenschutz-Abdeckung: Abschnitt 5 (Registrierung und Account)

---

## 6. Photos and Videos → Photos

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Optional |
| Purpose | App functionality, User-generated content |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes |

Begründung: Nutzer können Fotos von Tischtennisplatten hochladen (in Supabase Storage). Uploads werden moderiert bevor sie öffentlich angezeigt werden.

Datenschutz-Abdeckung: Abschnitt 9 (Fotos und Uploads)

---

## 7. Location → Precise Location

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Optional |
| Purpose | App functionality, Location-based features |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes / Suchstandort wird beim Logout aus localStorage entfernt |

Verwendung:
- Karte mit Platten in der Nähe
- Mitspielersuche mit Radiusfilter
- Spiel-/Gesuch-Erstellung mit Standortbezug

Wichtig:
- Kein Hintergrundtracking, kein Bewegungsprofil
- Standortzugriff nur nach Nutzeraktion und Systemprompt
- `tt_ps_lat`, `tt_ps_lng`, `tt_ps_label`, `tt_ps_type`, `tt_ps_radius` werden beim Logout aus localStorage gelöscht
- Kein Standort für Werbung / kein Standort-Sharing

Datenschutz-Abdeckung: Abschnitte 6, 7, 10, 17

---

## 8. Messages → Other In-App Messages

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Optional |
| Purpose | App functionality, Communications |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes / anonymisiert gemäß Account-Lösch-Flow |

Begründung: Direktnachrichten (DMs) zwischen Nutzern werden in Supabase gespeichert. Nicht für Werbung. Kein Zugriff durch externe Dienste.

Datenschutz-Abdeckung: Abschnitt 11 (Direktnachrichten)

---

## 9. App Activity → App Interactions

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Optional — Opt-out in Profil → Einstellungen → Nutzungsanalyse |
| Purpose | Analytics, App functionality, Product improvement |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes — User-ID wird bei Account-Löschung per `ON DELETE SET NULL` entfernt |

Gespeicherte Ereignistypen (Beispiele):
`app_open`, `map_opened`, `plate_detail_opened`, `plate_suggest_submitted`, `game_created`, `game_joined`, `player_search_created`, `message_sent`, `signup_completed`, `logout_completed`

Nicht in Analytics-Properties:
- Keine Nachrichteninhalte
- Keine Kommentartexte
- Keine E-Mail-Adressen
- Keine Namen
- Keine exakten Koordinaten (Blocklist in `PTAnalytics.sanitize()`)

Kein externes Analytics-SDK. Kein Sharing mit Werbediensten.

Datenschutz-Abdeckung: Abschnitt 16 (Interne Nutzungsanalyse)

---

## 10. User Content → Other User Content

| Feld | Wert |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or Optional | Optional |
| Purpose | App functionality, Community, Moderation/Safety |
| Encrypted in Transit | Yes |
| Deleted on User Request | Yes / anonymisiert |

Dazu zählen:
- Kommentare zu Tischtennisplatten
- Bewertungen
- Spielrunden / Events (Titel, Beschreibung, Ort)
- Mitspieler-Gesuche
- Plattenvorschläge (Name, Ort, Typ)
- Meldungen / Reports
- Profilangaben (soweit vorhanden)

Datenschutz-Abdeckung: Abschnitte 8, 10, 13, 15

---

## 11. Nicht deklarierte Datentypen

| Datentyp | Status |
|---|---|
| Advertising ID / GAID | ❌ Nicht erhoben |
| Financial info | ❌ Nicht erhoben |
| Health and fitness | ❌ Nicht erhoben |
| Contacts | ❌ Nicht erhoben |
| Calendar | ❌ Nicht erhoben |
| Web browsing history | ❌ Nicht erhoben |
| Audio files | ❌ Nicht erhoben |
| Files and documents | ❌ Nicht erhoben |
| Installed apps | ❌ Nicht erhoben |
| Device IDs | ❌ Nicht erhoben |
| Diagnostics / Crash data | ❌ Kein Crash-SDK — nicht deklarieren |
| Werbedaten | ❌ Nicht erhoben |
| Drittanbieter-Tracking | ❌ Kein Tracking-SDK |

---

## 12. Datenschutz-Abgleich

| Google-Play-Datenkategorie | Datenschutz-Abschnitt | Status |
|---|---|---|
| E-Mail / Login / Auth | 5 (Registrierung und Account) | ✅ |
| Spielername / Profil | 5 (Registrierung und Account) | ✅ |
| Fotos / Uploads | 9 (Fotos und Uploads) | ✅ |
| Standort | 6, 7, 17 | ✅ |
| Direktnachrichten | 11 (Direktnachrichten) | ✅ |
| Kommentare / Events / Gesuche / Bewertungen / Reports | 8, 10, 13, 15 | ✅ |
| Interne Nutzungsanalyse / App interactions | 16 (Interne Nutzungsanalyse) | ✅ |
| Opt-out Analytics | 16 | ✅ |
| Account-Löschung | 21 (Account löschen) | ✅ |
| Verschlüsselung in Transit | 4 (Supabase), 3 (Vercel) | ✅ |
| Keine Werbe-/Tracking-SDKs | 2, 19 | ✅ |
| Keine Advertising ID | 2 | ✅ |

---

## 13. Anleitung: Google Play Console ausfüllen

1. **Google Play Console → App → Store listing → Data safety**
2. Frage „Werden Daten erhoben?" → **Ja**
3. Frage „Werden Daten mit Dritten geteilt?" → **Nein**
4. Frage „Werden Daten verkauft?" → **Nein**
5. **Security practices:**
   - Daten werden während Übertragung verschlüsselt → **Ja**
   - Nutzer können Datenlöschung beantragen → **Ja**
6. **Account deletion URL:** `https://plattentreff.app/account-loeschen/`
7. Datentypen einzeln konfigurieren (siehe Tabelle in Kurzfassung)
8. **Privacy Policy URL:** `https://plattentreff.app/datenschutz/`

---

## 14. Verknüpfte Dokumente

- Datenschutzerklärung: https://plattentreff.app/datenschutz/
- Account löschen (Web): https://plattentreff.app/account-loeschen/
- Apple App Privacy: `docs/APP_STORE_PRIVACY.md`
- Supabase DPA: `docs/SUPABASE_DPA.md`
- Deployment/Store-URLs: `docs/DEPLOYMENT.md`
