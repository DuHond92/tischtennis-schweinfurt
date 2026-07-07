# Supabase AVV/DPA Compliance — PlattenTreff

## Status: ⬜ PRÜFUNG AUSSTEHEND

Dieses Dokument muss vor dem App-Launch ausgefüllt werden.
Alle mit `[ ]` markierten Punkte sind offene Aufgaben.

---

## 1. Supabase-Projekt

| Feld | Wert |
|---|---|
| Projektname | *(im Dashboard prüfen: Project Settings → General → Project Name)* |
| Project Ref | `quelfdpqvzgnnvpuwljq` |
| Supabase-URL | `https://quelfdpqvzgnnvpuwljq.supabase.co` |
| Organisation | *(im Dashboard prüfen: Organization Settings → General)* |

---

## 2. Region / Hosting-Region

**Zielregion: `eu-central-1` (Frankfurt, Deutschland)**

**Prüfen im Dashboard:**
> Supabase Dashboard → Project Settings → General → Infrastructure → Region

| Feld | Wert |
|---|---|
| Bestätigte Region | *(hier eintragen, z. B. eu-central-1 oder us-east-1)* |
| EU-Region bestätigt? | ⬜ Ja / ⬜ Nein |
| Datum der Prüfung | *(Datum eintragen)* |

**Risiko bei Nicht-EU-Region:**
- In der Datenschutzerklärung darf nicht behauptet werden, Daten liegen in der EU
- Drittlandtransfer muss über SCCs abgesichert sein (bereits im DPA enthalten — Abschnitt 5)
- Ggf. Datenschutzerklärung anpassen

---

## 3. DPA / Auftragsverarbeitungsvertrag

**Prüfen im Dashboard:**
> Supabase Dashboard → Organization Settings → Legal → Data Processing Agreement

| Feld | Wert |
|---|---|
| DPA verfügbar? | ✅ Ja (Supabase stellt DPA bereit) |
| DPA akzeptiert? | ⬜ Ja / ⬜ Nein / ⬜ Ausstehend |
| Datum der Annahme | *(Datum eintragen nach Akzeptanz)* |
| Für Organisation | *(Org-Name aus Dashboard eintragen)* |
| DPA-Dokument | https://supabase.com/privacy (Abschnitt DPA / legal) |
| PDF heruntergeladen? | ⬜ Ja → Pfad: `docs/supabase-dpa.pdf` / ⬜ Nein |

**⚠️ LAUNCH-BLOCKER: DPA muss akzeptiert sein, bevor die App mit echten Nutzerdaten live geht.**

### DPA-Akzeptanz durchführen:
1. Supabase Dashboard öffnen: https://supabase.com/dashboard
2. Organization → Settings → Legal
3. „Data Processing Agreement" anklicken
4. DPA prüfen und akzeptieren
5. Bestätigung/Datum hier dokumentieren
6. PDF-Export speichern (falls verfügbar)

---

## 4. DPA-Inhalt (Supabase — öffentlich bekannt)

Supabase veröffentlicht den DPA unter https://supabase.com/privacy.
Der DPA enthält folgende relevante Punkte (Stand: 2025):

| Punkt | Status |
|---|---|
| Supabase als Auftragsverarbeiter gem. Art. 28 DSGVO | ✅ enthalten |
| Zweck der Verarbeitung | ✅ Betrieb der Plattform-Infrastruktur |
| Kategorien personenbezogener Daten | ✅ Account-, Nutzungs-, Inhaltsdaten |
| Betroffene Personen | ✅ Endnutzer der App |
| Technische und organisatorische Maßnahmen (TOMs) | ✅ enthalten |
| EU-Standardvertragsklauseln (SCCs) | ✅ enthalten (für Drittlandübermittlungen) |
| Liste der Unterauftragsverarbeiter | ✅ supabase.com/privacy → Sub-processors |
| Löschung / Rückgabe der Daten | ✅ enthalten |
| Unterstützung bei Betroffenenrechten | ✅ enthalten |
| Unterstützung bei Datenpannen | ✅ enthalten |
| Audit-/Nachweismöglichkeiten | ✅ enthalten |

---

## 5. Unterauftragsverarbeiter (Sub-processors)

Supabase-Subprocessor-Liste: https://supabase.com/privacy

Relevante Unterauftragsverarbeiter (Stand: bekannt aus öffentlicher Liste):

| Anbieter | Zweck | Standort |
|---|---|---|
| Amazon Web Services (AWS) | Datenbankinfrastruktur, Storage | USA/EU (je nach Projektregion) |
| Cloudflare | CDN, DDoS-Schutz, Netzwerk | USA/global |

**Hinweis:** Für Drittlandübermittlungen (z. B. AWS us-east-1) sind SCCs im Supabase-DPA enthalten.
Aktuelle Liste immer unter https://supabase.com/privacy prüfen.

---

## 6. Datenschutzerklärung — Abgleich

| Punkt | Status |
|---|---|
| Supabase als Auftragsverarbeiter erwähnt | ✅ Abschnitt 4 |
| DPA nach Art. 28 DSGVO erwähnt | ✅ Abschnitt 4 |
| SCCs für Drittlandtransfer erwähnt | ✅ Abschnitt 4 |
| Sub-processors (AWS, Cloudflare) erwähnt | ✅ Abschnitt 4 und 18 |
| Vercel als Web-Host erwähnt | ✅ Abschnitt 3 |
| Region-Aussage: neutral (kein Behaupten von EU) | ✅ korrekt formuliert |
| Keine falsche Aussage „Daten liegen in Frankfurt" | ✅ solange Region nicht verifiziert |

**Nach Region-Prüfung:** Falls `eu-central-1` bestätigt → Datenschutzerklärung optional um
„Daten werden auf Servern in Frankfurt (Deutschland) verarbeitet." ergänzen.

---

## 7. Store-Compliance (Supabase)

| Store | Angabe | Status |
|---|---|---|
| Apple App Store | Data Storage: Supabase | ⬜ in App Privacy eintragen |
| Google Play | Data Safety: Daten werden geteilt (Supabase) | ⬜ in Data Safety eintragen |
| Beide | Account-Löschung implementiert | ✅ implementiert (delete_my_account RPC) |
| Beide | Privacy Policy URL | ✅ https://plattentreff.app/datenschutz/ |

---

## 8. Offene TODOs / Launch-Blocker

- [ ] **LAUNCH-BLOCKER:** Supabase DPA im Dashboard akzeptieren (Org Settings → Legal → DPA)
- [ ] Supabase-Projektregion im Dashboard prüfen und hier dokumentieren
- [ ] Falls Region = EU: Datenschutzerklärung Abschnitt 4 mit EU-Region ergänzen
- [ ] Falls Region = US: SCC-Formulierung in Datenschutzerklärung belassen (bereits korrekt)
- [ ] DPA-PDF herunterladen und als `docs/supabase-dpa.pdf` ablegen (falls exportierbar)
- [ ] Apple App Store Data Safety Formular ausfüllen (Supabase-Daten)
- [ ] Google Play Data Safety Formular ausfüllen (Supabase-Daten)
- [ ] Datenschutzerklärung juristisch prüfen lassen

---

## 9. Verantwortlicher

Michael Tröster · Neutorstraße 31 · 97421 Schweinfurt
E-Mail: troester.micha@gmail.com

Letzte Prüfung: 2026-07-07
