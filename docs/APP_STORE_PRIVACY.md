# Apple App Privacy — App Store Connect

**App:** PlattenTreff  
**Bundle ID:** de.plattentreff.app  
**Stand:** 2026-07-07

---

## Kurzfassung

| Data Type | Collected | Linked to User | Used for Tracking | Purposes |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | **No** | App Functionality, Account Management |
| Contact Info → Name | Yes | Yes | **No** | App Functionality, User Profile/Community |
| User Content → Photos or Videos | Yes | Yes | **No** | App Functionality, User-generated Content |
| User Content → Other User Content | Yes | Yes | **No** | App Functionality, Community, Moderation/Safety |
| Location → Precise Location | Yes | Yes | **No** | App Functionality, Location-based Features |
| Identifiers → User ID | Yes | Yes | **No** | App Functionality, Account Management, Analytics |
| Usage Data → Product Interaction | Yes | Yes | **No** | Analytics, App Functionality, Product Improvement |
| Diagnostics | **No** | — | — | Keine aktive Crash-/Diagnostics-Erfassung |

---

## 1. Tracking

**Frage in App Store Connect:** „Verwendet diese App Daten zum Tracking?"

**Antwort: Nein**

Begründung:
- Kein Drittanbieter-Werbe- oder Tracking-SDK (kein Firebase, Meta, Adjust, AppsFlyer o. ä.)
- Keine IDFA / Advertising Identifier
- Kein AppTrackingTransparency-Prompt nötig
- Keine Datenweitergabe an Datenbroker oder Werbenetzwerke
- Keine Cross-App-Tracking-Mechanismen
- Die interne Supabase-Analytics (`analytics_events`) dient ausschließlich Produktverbesserung/App-Funktionalität — kein Apple-Tracking im Sinne der ATT-Policy

---

## 2. Contact Info → Email Address

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes |
| Used for Tracking | No |
| Purposes | App Functionality, Account Management |

Begründung: E-Mail-Adresse wird für Supabase-Auth (Login, Registrierung, Passwort-Reset, Magic Links) verwendet. Wird dauerhaft in `auth.users` gespeichert. Nutzerbezug explizit.

Datenschutz-Abdeckung: Abschnitt 5 (Registrierung und Account)

---

## 3. Contact Info → Name

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes |
| Used for Tracking | No |
| Purposes | App Functionality, User Profile/Community |

Hinweis: Hierbei handelt es sich primär um den **Spielernamen/Anzeigenamen** (Username), keinen bürgerlichen Namen. Der Spielername ist in der Community sichtbar — z. B. bei Profil, Spielrunden, Kommentaren, Nachrichten und Teilnehmerlisten.

Datenschutz-Abdeckung: Abschnitt 5 (Registrierung und Account)

---

## 4. User Content → Photos or Videos

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes |
| Used for Tracking | No |
| Purposes | App Functionality, User-generated Content |

Begründung: Nutzer können Fotos von Tischtennisplatten hochladen. Uploads werden in Supabase Storage gespeichert und dem Account zugeordnet. Fotos werden nach Moderationsfreigabe öffentlich angezeigt.

Datenschutz-Abdeckung: Abschnitt 9 (Fotos und Uploads)

---

## 5. User Content → Other User Content

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes |
| Used for Tracking | No |
| Purposes | App Functionality, Community, Moderation/Safety |

Dazu zählen:
- Kommentare zu Tischtennisplatten
- Spielrunden / Events (Titel, Beschreibung, Ort)
- Mitspieler-Gesuche
- Direktnachrichten (DMs)
- Bewertungen
- Meldungen / Reports
- Profilangaben (Beschreibung, Verein, Spielniveau — soweit vorhanden)
- Plattenvorschläge (Name, Ort, Typ)

Datenschutz-Abdeckung: Abschnitte 8, 10, 11, 12, 13, 15

---

## 6. Location → Precise Location

| Feld | Wert |
|---|---|
| Collected | Yes (optional, nur nach Nutzeraktion) |
| Linked to User | Yes (konservativ — Suchstandort wird für Mitspielersuche gespeichert) |
| Used for Tracking | No |
| Purposes | App Functionality, Location-based Features |

Standort wird verwendet für:
- Platten in der Nähe anzeigen (Karte)
- Mitspielersuche mit Radiusfilter
- Spiel-/Gesuch-Erstellung mit Standortbezug
- Suchstandort-Persistenz in `localStorage` (`tt_ps_lat`, `tt_ps_lng`)

Wichtig:
- Standortzugriff nur nach expliziter Nutzeraktion und iOS-Systemprompt
- Kein Hintergrundtracking, kein dauerhaftes Bewegungsprofil
- Suchstandort wird beim Logout aus `localStorage` gelöscht
- Kein Verkauf / keine Werbenutzung des Standorts

Datenschutz-Abdeckung: Abschnitte 6, 7, 10, 17

---

## 7. Identifiers → User ID

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes |
| Used for Tracking | No |
| Purposes | App Functionality, Account Management, Analytics |

Begründung: Die Supabase-Auth-User-ID (UUID) wird für Account, Profil, Events, Kommentare, Nachrichten, Reports und interne Analytics verwendet. Bei Account-Löschung wird der Nutzerbezug in `analytics_events` per `ON DELETE SET NULL` automatisch entfernt.

Datenschutz-Abdeckung: Abschnitte 4, 5, 16, 21

---

## 8. Usage Data → Product Interaction

| Feld | Wert |
|---|---|
| Collected | Yes |
| Linked to User | Yes (pseudonym — User-ID, sofern eingeloggt; anonym bei Gästen) |
| Used for Tracking | No |
| Purposes | Analytics, App Functionality, Product Improvement |

PlattenTreff speichert interne Nutzungsereignisse in der `analytics_events`-Tabelle. Beispiele:
`app_open`, `map_opened`, `plate_detail_opened`, `plate_suggest_submitted`, `game_created`, `game_joined`, `player_search_created`, `message_sent`, `signup_completed`, `logout_completed`

Keine Freitexte, keine Nachrichteninhalte, keine Kommentartexte in Analytics-Eigenschaften.
Keine exakten Standortkoordinaten in Analytics-Properties (Blocklist in `PTAnalytics.sanitize()`).
Opt-out vorhanden: Profil → Einstellungen → Nutzungsanalyse.
Kein externes Analytics-SDK.

Datenschutz-Abdeckung: Abschnitt 16 (Interne Nutzungsanalyse)

---

## 9. Diagnostics

**Angabe in App Store Connect: Nein / Nicht zutreffend**

Begründung: Es ist kein Crash-Reporting-SDK (z. B. Crashlytics, Sentry) in die App integriert. Die App sendet keine aktiven Crash-Daten, Performance-Metriken oder Diagnose-Logs an einen Dienst.

Normale Server-/Hosting-Logs bei Vercel und Supabase sind infrastrukturelle Betreiber-Logs, keine App-seitig aktiv erhobenen Diagnostics im Sinne der Apple-Definition.

→ **Diagnostics nicht als Datentyp deklarieren**, solange kein aktives Crash-SDK eingebaut ist.

---

## 10. Daten, die NICHT als Tracking anzugeben sind

| Dienst/Funktion | Begründung |
|---|---|
| Supabase (Backend/DB/Storage) | Auftragsverarbeiter, kein Tracking-SDK |
| Cloudflare (DNS / Email Routing) | Infrastruktur, kein App-Tracking |
| Vercel (Hosting) | Infrastruktur, kein App-Tracking |
| Interne Supabase-Analytics | Kein Drittanbieter-Werbezweck, kein Cross-App-Tracking |
| IDFA | Wird nicht abgefragt |
| AppTrackingTransparency-Prompt | Nicht nötig, da kein Tracking im ATT-Sinne |

---

## 11. Abgleich mit der Datenschutzerklärung

| Apple-Datenkategorie | Datenschutz-Abschnitt | Status |
|---|---|---|
| E-Mail / Login / Auth | 5 (Registrierung und Account) | ✅ |
| Spielername / Profil | 5 (Registrierung und Account) | ✅ |
| Fotos / Uploads | 9 (Fotos und Uploads) | ✅ |
| Kommentare / Events / Gesuche / DMs | 8, 10, 11, 13, 15 | ✅ |
| Standort | 6, 7, 17 | ✅ |
| User-ID / pseudonyme IDs | 4, 5, 16 | ✅ |
| Interne Nutzungsanalyse | 16 (Interne Nutzungsanalyse) | ✅ |
| Opt-out Analytics | 16 | ✅ |
| Account-Löschung | 21 | ✅ |
| Keine externen Tracking-SDKs | 2, 19 | ✅ |
| Keine Werbe-ID / kein IDFA | 2 | ✅ |
| Kein Cross-App-Tracking | 2 | ✅ |

Die Datenschutzerklärung deckt alle Apple-App-Privacy-Datentypen ab.

---

## 12. Anleitung: App Store Connect ausfüllen

1. **App Store Connect → App → App Privacy**
2. Frage „Verwendet diese App Daten zum Tracking?" → **Nein**
3. Frage „Welche Daten erhebt deine App?" → Folgende Kategorien auswählen und konfigurieren:

| Schritt | Kategorie | Subcategory |
|---|---|---|
| 1 | Contact Info | Email Address |
| 2 | Contact Info | Name |
| 3 | User Content | Photos or Videos |
| 4 | User Content | Other User Content |
| 5 | Location | Precise Location |
| 6 | Identifiers | User ID |
| 7 | Usage Data | Product Interaction |

4. Für jeden Typ: Linked to User → **Yes**, Used for Tracking → **No**, Purposes wie oben angegeben
5. Diagnostics → **nicht auswählen**
6. Privacy Policy URL eintragen: `https://plattentreff.app/datenschutz/`

---

## 13. Verknüpfte Dokumente

- Datenschutzerklärung: https://plattentreff.app/datenschutz/
- Supabase DPA: `docs/SUPABASE_DPA.md`
- Deployment/Store-URLs: `docs/DEPLOYMENT.md`
