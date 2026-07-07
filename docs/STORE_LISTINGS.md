# Store-Listings — PlattenTreff

**Bundle ID / Package:** de.plattentreff.app  
**Kategorie:** Sport (Apple) / Sport (Google)  
**Stand:** 2026-07-07

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
Keine Werbung. Kein Tracking. Keine Weitergabe deiner Daten an Dritte. Standortzugriff nur wenn du ihn aktiv nutzt.
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
4+ (keine anstößigen Inhalte, kein WLAN-Multiplayer-Gaming)
```

### Copyright
```
© 2026 Michael Tröster
```

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
Keine Werbung. Kein Tracking. Keine Weitergabe deiner Daten an Dritte. Standortzugriff nur wenn du ihn aktiv nutzt. Account jederzeit in der App löschbar.
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
| iPhone 6.9" (iPhone 16 Pro Max) | 1320 × 2868 px | ✅ Pflicht |
| iPhone 6.5" (iPhone 14 Plus) | 1284 × 2778 px | ✅ Pflicht |
| iPad Pro 13" (optional) | 2064 × 2752 px | Optional |

### Google Play
| Format | Größe | Pflicht |
|---|---|---|
| Phone Screenshots | min. 320 dp, max. 3840 px | ✅ Pflicht (2–8 Stück) |
| Feature Graphic | 1024 × 500 px | ✅ Pflicht |
| Tablet 7" (optional) | — | Optional |

---

## Supabase E-Mail-Templates

Im Supabase Dashboard unter **Authentication → Email Templates** folgende Absender-Einstellungen setzen:

**From Name:** PlattenTreff  
**From Email:** noreply@plattentreff.app *(oder kontakt@plattentreff.app, je nach Cloudflare Email Routing)*

### Confirm Signup (Betreff-Vorschlag)
```
Bestätige deine PlattenTreff-Registrierung
```

### Reset Password (Betreff-Vorschlag)
```
Dein PlattenTreff Passwort zurücksetzen
```

### Magic Link (Betreff-Vorschlag)
```
Dein PlattenTreff Login-Link
```

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
