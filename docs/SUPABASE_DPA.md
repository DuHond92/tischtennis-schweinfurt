# Supabase AVV/DPA Compliance — PlattenTreff

## Status: ✅ ABGESCHLOSSEN

---

## 1. Supabase-Projekt

| Feld | Wert |
|---|---|
| Projektname | tischtennis-schweinfurt |
| Project ID / Ref | `quelfdpqvzgnnvpulwljq` |
| Supabase-URL | `https://quelfdpqvzgnnvpulwljq.supabase.co` |
| Organisation | *(Org-Name aus Dashboard — intern bekannt)* |

---

## 2. Region / Hosting-Region

| Feld | Wert |
|---|---|
| Region-Code | `eu-west-1` |
| Region-Label | West EU (Ireland) |
| Serverstandort | Irland, EU |
| EU-Region | ✅ Ja |
| Frankfurt / eu-central-1 | ❌ Nein |
| Datum der Prüfung | 2026-07-07 |

**Hinweis für Datenschutzerklärung:**
Korrekte Formulierung laut Abschnitt 4:
> „Die von uns genutzte Supabase-Projektregion befindet sich in der EU, derzeit in Irland (eu-west-1)."

Nicht verwenden: Frankfurt, Deutschland, eu-central-1.

---

## 3. DPA / Auftragsverarbeitungsvertrag

| Feld | Wert |
|---|---|
| DPA verfügbar | ✅ Ja |
| DPA abgeschlossen / akzeptiert | ✅ Ja |
| Datum der Unterzeichnung | 2026-07-07 (siehe `docs/Supabase_DPA_signed_Plattentreff_2026-07-07.pdf`) |
| Vertragspartner (Verantwortlicher) | Michael Tröster |
| Nachweis | Unterschriebene Supabase-DPA-Datei liegt intern vor |
| DPA-Referenz (öffentlich) | https://supabase.com/privacy |
| PDF intern abgelegt | Als `docs/supabase-dpa.pdf` ablegen, falls PDF vorhanden |

---

## 4. DPA-Inhalt (Supabase)

| Punkt | Status |
|---|---|
| Supabase als Auftragsverarbeiter gem. Art. 28 DSGVO | ✅ enthalten |
| Zweck der Verarbeitung | ✅ Betrieb der Plattform-Infrastruktur |
| Kategorien personenbezogener Daten | ✅ Account-, Nutzungs-, Inhaltsdaten |
| Betroffene Personen | ✅ Endnutzer der App |
| Technische und organisatorische Maßnahmen (TOMs) | ✅ enthalten |
| EU-Standardvertragsklauseln (SCCs) | ✅ enthalten (für ggf. Drittlandübermittlung durch Sub-processors) |
| Liste der Unterauftragsverarbeiter | ✅ supabase.com/privacy → Sub-processors |
| Löschung / Rückgabe der Daten | ✅ enthalten |
| Unterstützung bei Betroffenenrechten | ✅ enthalten |
| Unterstützung bei Datenpannen | ✅ enthalten |
| Audit-/Nachweismöglichkeiten | ✅ enthalten |

---

## 5. Auftragsverarbeiter & Sub-processors

### Supabase Sub-processors
Aktuelle Supabase-Subprocessor-Liste: https://supabase.com/privacy

| Anbieter | Zweck | Standort |
|---|---|---|
| Amazon Web Services (AWS) | Datenbankinfrastruktur, Storage | EU (eu-west-1 für unser Projekt) |
| Cloudflare | CDN, DDoS-Schutz, Netzwerk | USA/global (SCCs enthalten) |

Drittlandübermittlungen durch Sub-processors (z. B. Cloudflare USA) sind durch
SCCs im Supabase-DPA abgesichert.

### Resend Inc. — E-Mail-Versand (eigener Auftragsverarbeiter)

| Feld | Wert |
|---|---|
| Anbieter | Resend Inc. |
| Zweck | Versand transaktionaler Auth-E-Mails (Registrierung, Passwort-Reset, Login-Links) |
| Domain | `plattentreff.app` — verified ✅ (Stand 2026-07-07) |
| Region | eu-west-1 (Irland) |
| DKIM / SPF / DMARC | verified ✅ |
| Absender | `PlattenTreff <noreply@plattentreff.app>` |
| SMTP Host | `smtp.resend.com:465` |
| Datenschutz | https://resend.com/legal/privacy-policy |
| DPA | Resend DPA prüfen / abschließen: https://resend.com/legal/dpa |
| Datenkategorien | E-Mail-Adresse, Versand-/Zustellmetadaten |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO |
| Datenschutzerklärung | Abschnitt 5 + 19 (Drittanbieter-Tabelle) ✅ |

⚠️ **TODO:** Resend DPA prüfen und ggf. abschließen (https://resend.com/legal/dpa)

---

## 6. Datenschutzerklärung — Abgleich

| Punkt | Status |
|---|---|
| Supabase als Auftragsverarbeiter erwähnt | ✅ Abschnitt 4 |
| DPA abgeschlossen, nach Art. 28 DSGVO | ✅ Abschnitt 4 |
| Region: Irland / eu-west-1 | ✅ Abschnitt 4 |
| Kein Frankfurt / kein eu-central-1 | ✅ geprüft, nicht vorhanden |
| SCCs für Sub-processor-Drittlandtransfer | ✅ Abschnitt 4 |
| Sub-processors (AWS, Cloudflare) erwähnt | ✅ Abschnitt 4 und 18 |
| Vercel als Web-Host erwähnt | ✅ Abschnitt 3 |
| Resend als E-Mail-Dienstleister erwähnt | ✅ Abschnitte 5 + 19 |
| Account-Löschung beschrieben | ✅ Abschnitt 21 |

---

## 7. Account-Lösch-Flow — Konsistenz mit DPA

Der Account-Lösch-Flow (`delete_my_account()` RPC) ist konsistent mit den DPA-Anforderungen:

| Datenkategorie | Aktion bei Löschung |
|---|---|
| Auth-User (E-Mail, Passwort-Hash) | ✅ dauerhaft gelöscht (auth.users) |
| Profil, Avatar, persönliche Daten | ✅ dauerhaft gelöscht |
| Direktnachrichten | ✅ dauerhaft gelöscht |
| Spielpartner-Verbindungen | ✅ dauerhaft gelöscht |
| Bewertungen, Kommentare | ✅ dauerhaft gelöscht |
| Benachrichtigungen | ✅ dauerhaft gelöscht |
| Teilnahmen an Spielrunden | ✅ dauerhaft gelöscht |
| Zukünftige Spielrunden (eigene) | ✅ dauerhaft gelöscht |
| Vergangene Spielrunden | anonymisiert (creator_id → NULL) |
| Plattenvorschläge / Fotos (freigegeben) | anonymisiert (submitted_by → NULL) |
| Meldungen/Reports | anonymisiert (reporter_id → NULL) |

Datenschutzerklärung (Abschnitt 20) beschreibt dies korrekt.

---

## 8. Store-Compliance (Supabase-relevante Punkte)

### Apple App Store — App Privacy

Vollständige Dokumentation: **`docs/APP_STORE_PRIVACY.md`**

| Data Type | Linked to User | Tracking | Purposes |
|---|---|---|---|
| Contact Info → Email Address | Yes | **No** | App Functionality, Account Management |
| Contact Info → Name | Yes | **No** | App Functionality, User Profile/Community |
| User Content → Photos or Videos | Yes | **No** | App Functionality, User-generated Content |
| User Content → Other User Content | Yes | **No** | App Functionality, Community, Moderation/Safety |
| Location → Precise Location | Yes | **No** | App Functionality, Location-based Features |
| Identifiers → User ID | Yes | **No** | App Functionality, Account Management, Analytics |
| Usage Data → Product Interaction | Yes | **No** | Analytics, App Functionality, Product Improvement |
| Diagnostics | — | — | Nicht zutreffend (kein Crash-SDK) |
| Tracking (gesamt) | — | **No** | Kein IDFA, kein ATT-Prompt, kein Cross-App-Tracking |

### Google Play — Data Safety

Vollständige Dokumentation: **`docs/GOOGLE_PLAY_DATA_SAFETY.md`**

| Data Type | Collected | Shared | Tracking | Purpose |
|---|---|---|---|---|
| Personal info → Email address | Yes | No | **No** | Account management, App functionality |
| Personal info → Name | Yes | No | **No** | App functionality, User profile/Community |
| Photos and videos → Photos | Yes | No | **No** | App functionality, User-generated content |
| Location → Precise location | Yes | No | **No** | App functionality, Location-based features |
| Messages → Other in-app messages | Yes | No | **No** | App functionality, Communications |
| App activity → App interactions | Yes | No | **No** | Analytics, App functionality, Product improvement |
| User content → Other user content | Yes | No | **No** | App functionality, Community, Moderation/Safety |
| Diagnostics | No | — | — | Kein Crash-SDK |
| Advertising ID / Werbedaten / Tracking | **No** | — | — | Nicht verwendet |

**Account Deletion URL:** `https://plattentreff.app/account-loeschen/`  
**Privacy Policy URL:** `https://plattentreff.app/datenschutz/`

---

## 9. Offene TODOs

- [x] DPA-Unterzeichnungsdatum eingetragen: 2026-07-07
- [x] DPA-PDF abgelegt: `docs/Supabase_DPA_signed_Plattentreff_2026-07-07.pdf`
- [x] Apple App Store App Privacy Angaben dokumentiert → `docs/APP_STORE_PRIVACY.md` (2026-07-07)
- [ ] Apple App Store App Privacy Formular in App Store Connect ausfüllen (Anleitung in `docs/APP_STORE_PRIVACY.md` Abschnitt 12)
- [x] Google Play Data Safety Angaben dokumentiert → `docs/GOOGLE_PLAY_DATA_SAFETY.md` (2026-07-07)
- [ ] Google Play Data Safety Formular in Play Console ausfüllen (Anleitung in `docs/GOOGLE_PLAY_DATA_SAFETY.md` Abschnitt 13)
- [ ] Resend DPA abschließen: https://resend.com/legal/dpa
- [ ] Datenschutzerklärung juristisch prüfen lassen vor Launch
- [ ] **Analytics-Retention automatisieren**: Datenschutzerklärung nennt 180 Tage —
  technisch noch nicht automatisch. Umsetzungsoptionen:
  - Supabase pg_cron Extension (falls aktiviert): `SELECT cron.schedule('analytics-cleanup', '0 3 * * *', 'DELETE FROM public.analytics_events WHERE created_at < now() - interval ''180 days''');`
  - Oder: monatliche manuelle Ausführung der Abfrage in `docs/analytics_queries.sql` (Query 14)
  - Solange keine Automatisierung aktiv ist: "automatisch" aus Datenschutzerklärung entfernt ✅

---

## 10. Verantwortlicher

Michael Tröster · Neutorstraße 31 · 97421 Schweinfurt
E-Mail: troester.micha@gmail.com

Letzte Aktualisierung: 2026-07-07
