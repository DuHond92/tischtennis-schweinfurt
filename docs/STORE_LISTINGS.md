# Store-Listings — PlattenTreff

**Bundle ID / Package:** de.plattentreff.app  
**Kategorie:** Sport (Apple) / Sport (Google)  
**Stand:** 2026-07-24

---

## Apple App Store

### App-Name
```
PlattenTreff
```

### Untertitel (max. 30 Zeichen)
```
Tischtennis in deiner Nähe
```

### Kurzbeschreibung / Promotional Text (max. 170 Zeichen)
```
Finde Tischtennisplatten, organisiere Spielrunden und triff Mitspieler in deiner Nähe.
```

### Beschreibung (max. 4000 Zeichen)
```
PlattenTreff verbindet Tischtennisspieler und hilft dir, spontane Spiele zu organisieren.

🏓 PLATTEN ENTDECKEN
Finde Tischtennisplatten in deiner Umgebung auf der interaktiven Karte. Filtere nach Indoor/Outdoor, sieh Fotos, Bewertungen und Kommentare anderer Spieler. Schlage neue Platten vor und ergänze die Community-Datenbank.

👥 SPIELRUNDEN FINDEN
Erstelle oder tritt Spielrunden in deiner Nähe bei. Lege Ort, Zeit und Spielart fest und finde spontan Mitspieler für dein nächstes Match.

🔍 MITSPIELER SUCHEN
Suche nach Mitspielern in deinem Wunschradius. Stell dein Niveau und deine bevorzugte Spielart ein und vernetze dich mit anderen Spielern in deiner Stadt.

💬 DIREKTNACHRICHTEN
Chatte direkt mit anderen Spielern, verabrede dich und bau dir dein Tischtennisnetzwerk auf.

✅ FÜR ALLE SPIELSTÄRKEN
PlattenTreff richtet sich an Freizeitspieler genauso wie an ambitionierte Tischtennisspieler. Egal ob Park, Vereinsheim oder Sporthalle – alle Platten sind willkommen.

🔒 DATENSCHUTZ
Keine Werbung. Kein Tracking. Kein Verkauf deiner Daten. Standortzugriff nur wenn du ihn aktiv nutzt.
```

### Keywords (max. 100 Zeichen, kommagetrennt)
```
Tischtennis,Platten,Mitspieler,Sport,Ping Pong,Spielrunden,Community,Freizeit
```

### Support-URL
```
https://plattentreff.app/impressum/
```

### Marketing-URL
```
https://plattentreff.app
```

### Datenschutz-URL
```
https://plattentreff.app/datenschutz/
```

### Altersbeschränkung
```
16+ (Override wegen Mindestalter 16 in den Nutzungsbedingungen)
```

Im Fragebogen „User-Generated Content“ und „Messaging and Chat“ jeweils mit
„Ja“ angeben. Auf Betriebssystemen vor iOS 26 kann Apple die entsprechende
ältere Altersstufe anzeigen.

### Copyright
```
2026 Michael Tröster
```

App Store Connect ergänzt das Copyright-Zeichen automatisch.

---

## Google Play

### App-Name (max. 50 Zeichen)
```
PlattenTreff – Tischtennis Community
```

### Kurzbeschreibung (max. 80 Zeichen)
```
Finde Tischtennisplatten und Mitspieler in deiner Nähe.
```

### Vollständige Beschreibung (max. 4000 Zeichen)
```
PlattenTreff verbindet Tischtennisspieler und hilft dir, spontane Spiele zu organisieren.

🏓 PLATTEN ENTDECKEN
Finde Tischtennisplatten in deiner Umgebung auf der interaktiven Karte. Filtere nach Indoor/Outdoor, sieh Fotos, Bewertungen und Kommentare anderer Spieler. Schlage neue Platten vor und ergänze die Community-Datenbank.

👥 SPIELRUNDEN FINDEN
Erstelle oder tritt Spielrunden in deiner Nähe bei. Lege Ort, Zeit und Spielart fest und finde spontan Mitspieler für dein nächstes Match.

🔍 MITSPIELER SUCHEN
Suche nach Mitspielern in deinem Wunschradius. Stell dein Niveau und deine bevorzugte Spielart ein und vernetze dich mit anderen Spielern in deiner Stadt.

💬 DIREKTNACHRICHTEN
Chatte direkt mit anderen Spielern, verabrede dich und bau dir dein Tischtennisnetzwerk auf.

✅ FÜR ALLE SPIELSTÄRKEN
PlattenTreff richtet sich an Freizeitspieler genauso wie an ambitionierte Tischtennisspieler. Egal ob Park, Vereinsheim oder Sporthalle – alle Platten sind willkommen.

🔒 DATENSCHUTZ
Keine Werbung. Kein Tracking. Kein Verkauf deiner Daten. Standortzugriff nur wenn du ihn aktiv nutzt. Account jederzeit in der App löschbar.
```

### Kategorie
```
Sport
```

### Inhalts-Einstufung (IARC-Fragebogen)
```
Voraussichtlich: Alle (keine Gewalt, kein unangemessener Inhalt, keine Einkäufe)
Mindestalter in Nutzungsbedingungen: 16 Jahre
```

### Datenschutz-URL
```
https://plattentreff.app/datenschutz/
```

### Account-Deletion-URL
```
https://plattentreff.app/account-loeschen/
```

### Entwickler-E-Mail (öffentlich)
```
kontakt@plattentreff.app
```

---

## Screenshots — Pflichtformate

### Apple App Store
| Format | Größe | Pflicht |
|---|---|---|
| iPhone 6.9" | 1320 × 2868, 1290 × 2796 oder 1260 × 2736 px | ✅ Pflicht |
| iPhone 6.5" | 1284 × 2778 oder 1242 × 2688 px | Nur falls kein 6.9"-Set vorhanden |
| iPad Pro 13" | 2064 × 2752 oder 2048 × 2732 px | Nicht erforderlich – Xcode-Target ist iPhone-only |

### Google Play
| Format | Größe | Pflicht |
|---|---|---|
| Phone Screenshots | min. 320 dp, max. 3840 px | ✅ Pflicht (2–8 Stück) |
| Feature Graphic | 1024 × 500 px | ✅ Pflicht |
| Tablet 7" (optional) | — | Optional |

---

## Supabase Auth — E-Mail-Versand via Resend

### SMTP-Konfiguration (Authentication → Emails → SMTP Settings)

| Feld | Wert |
|---|---|
| Enable custom SMTP | An |
| Sender email address | `noreply@plattentreff.app` |
| Sender name | `PlattenTreff` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API Key ⚠️ nur im Dashboard, nie dokumentieren |

**⚠️ Sicherheitshinweis:** Den Resend API Key niemals in Code, Docs oder Logs eintragen.
Bei Verlust oder Leak sofort in Resend neuen Key erstellen und alten löschen.

### Resend Domain-Status (Stand 2026-07-07)

| Feld | Wert |
|---|---|
| Domain | `plattentreff.app` |
| Status | verified ✅ |
| Provider | Cloudflare |
| Region | eu-west-1 (Irland) |
| DKIM | verified ✅ |
| SPF / Return-Path | verified ✅ (auf `send.plattentreff.app`) |
| DMARC | vorhanden (`v=DMARC1; p=none`) |

SPF/Return-Path liegt auf `send.plattentreff.app` — kollidiert nicht mit Cloudflare Email Routing auf der Hauptdomain.

### E-Mail-Fluss

```
Supabase Auth → SMTP → smtp.resend.com → noreply@plattentreff.app (Absender)
Antworten / Bounces → Cloudflare Email Routing → Gmail
```

Cloudflare Email Routing: nur eingehend (Weiterleitungen). Ausgehender Versand: Resend.

### Supabase E-Mail-Templates (Authentication → Email Templates)

**From Name:** PlattenTreff  
**From Email:** noreply@plattentreff.app

| Template | Betreff |
|---|---|
| Confirm Signup | Bestätige deine PlattenTreff-Registrierung |
| Reset Password | Dein PlattenTreff Passwort zurücksetzen |
| Magic Link | Dein PlattenTreff Login-Link |
| Change Email | Bestätige deine neue E-Mail-Adresse |

Alle Templates verwenden Supabase-Variablen: `{{ .ConfirmationURL }}`, `{{ .Token }}`  
Supportadresse in Templates: `support@plattentreff.app`  
Datenschutzlink in Templates: `https://plattentreff.app/datenschutz/`

### Tests nach SMTP-Konfiguration
- [ ] Registrierung → Confirm-Signup-Mail kommt an
- [ ] Absender ist `PlattenTreff <noreply@plattentreff.app>`
- [ ] Passwort-Reset-Mail kommt an, Link führt zu `https://plattentreff.app`
- [ ] Keine Mails von `onboarding@resend.dev`
- [ ] Resend Dashboard → Logs zeigen erfolgreiche Zustellung
- [ ] API Key ist nirgendwo im Code/Docs sichtbar

---

## Supabase Auth — URL-Konfiguration (manuell im Dashboard)

**Authentication → URL Configuration:**

| Feld | Wert |
|---|---|
| Site URL | `https://plattentreff.app` |
| Redirect URLs | `https://plattentreff.app/**` |
| | `https://www.plattentreff.app/**` |
| | `https://plattentreff.vercel.app/**` |
| | `http://localhost:3000/**` |
| | `http://localhost:5173/**` |
