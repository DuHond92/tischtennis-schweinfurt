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
| Datum der Unterzeichnung | *(aus unterzeichneter PDF entnehmen)* |
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

## 5. Unterauftragsverarbeiter (Sub-processors)

Aktuelle Supabase-Subprocessor-Liste: https://supabase.com/privacy

| Anbieter | Zweck | Standort |
|---|---|---|
| Amazon Web Services (AWS) | Datenbankinfrastruktur, Storage | EU (eu-west-1 für unser Projekt) |
| Cloudflare | CDN, DDoS-Schutz, Netzwerk | USA/global (SCCs enthalten) |

Drittlandübermittlungen durch Sub-processors (z. B. Cloudflare USA) sind durch
SCCs im Supabase-DPA abgesichert.

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
| Account-Löschung beschrieben | ✅ Abschnitt 20 |

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
| Kategorie | Angabe |
|---|---|
| Contact Info (E-Mail) | Erfasst — App Functionality — mit Nutzer verknüpft |
| User Content (Fotos, Kommentare) | Erfasst — App Functionality — mit Nutzer verknüpft |
| Identifiers (User ID) | Erfasst — App Functionality — mit Nutzer verknüpft |
| Location (Standort) | Erfasst — App Functionality — nicht verknüpft (nur lokal) |
| Usage Data / Product Interaction | ✅ Ja — interne Nutzungsanalyse (analytics_events) |
| Linked to User (Usage Data) | ✅ Ja (pseudonyme User-ID, sofern eingeloggt) |
| Tracking | ❌ Nein (kein Advertising-SDK, kein Cross-App-Tracking) |
| Weitergabe an Dritte (Werbung) | ❌ Nein |

### Google Play — Data Safety
| Punkt | Status |
|---|---|
| Daten werden erhoben | ✅ Ja (Account, Profil, Inhalte, Nutzungsanalyse) |
| App activity / App interactions (analytics) | ✅ Ja — interne Nutzungsanalyse |
| Daten werden mit Drittanbietern geteilt | ✅ Ja (Supabase als Auftragsverarbeiter) |
| Zweck: App-Funktionalität | ✅ |
| Zweck: Analytics | ✅ (intern, kein externes SDK) |
| Zweck: Werbung | ❌ Nein |
| Verschlüsselung in Transit | ✅ HTTPS/TLS |
| Datenlöschung möglich | ✅ Account-Lösch-Flow (user_id → NULL in analytics_events) |
| Analytics optional / Required | Opt-out möglich (Profil → Einstellungen → Nutzungsanalyse) |

---

## 9. Offene TODOs

- [ ] DPA-Unterzeichnungsdatum in Zeile „Datum der Unterzeichnung" oben eintragen
- [ ] DPA-PDF als `docs/supabase-dpa.pdf` ablegen, falls exportierbar
- [ ] Apple App Store App Privacy Formular ausfüllen (Kategorien aus Abschnitt 8)
- [ ] Google Play Data Safety Formular ausfüllen
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
