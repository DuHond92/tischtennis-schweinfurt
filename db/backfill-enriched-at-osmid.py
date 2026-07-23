#!/usr/bin/env python3
"""
Backfill für context_osm_id und enriched_at in public.table_candidates.

Behebt zwei Lücken aus dem Enrichment-Lauf vom 2026-07-23:
- context_osm_id wurde vom Write-Skript nicht geschrieben (Spalte lag im CSV vor).
- enriched_at hat keinen DB-DEFAULT; wird als dokumentierter UTC-Zeitstempel gesetzt.

Sicherheitsregeln:
- Berührt NUR context_osm_id und enriched_at — keine anderen Spalten.
- WHERE: enriched_display_name IS NOT NULL (nur wirklich angereicherte Zeilen).
- WHERE: context_osm_id IS NULL OR enriched_at IS NULL (idempotent, kein Overwrite).
- Keine Kandidaten freigegeben, kein review_status verändert.
- Keine echten Namen, Reviewnotizen oder manuelle Daten berührt.

enriched_at-Zeitstempel:
  '2026-07-23 10:47:06+00' — UTC-Timestamp des Write-Lauf-Starts, abgeleitet aus
  dem Backup-Dateinamen enrichment-backup-20260723-104706.csv (Beginn des Writes).
  Da kein per-Row-Timestamp vorliegt, wird dieser dokumentierte Startzeitpunkt für
  alle Zeilen einheitlich gesetzt.

Aufruf:
  cd /Users/michaeltroster/tischtennis-schweinfurt
  python3 db/backfill-enriched-at-osmid.py

Resume: Abbruch und Neustart setzt nahtlos fort (done-Datei wird fortgeschrieben).
"""

import csv
import json
import subprocess
import sys
from pathlib import Path

# ── Konfiguration ────────────────────────────────────────────────────────────

CSV_IN     = Path('/Users/michaeltroster/.claude/jobs/69bc1e91/tmp/enrichment-v4.csv')
DONE_FILE  = Path('/Users/michaeltroster/.claude/jobs/69bc1e91/tmp/backfill-osmid-at.done')
PROJECT_DIR = '/Users/michaeltroster/tischtennis-schweinfurt'
BATCH_SIZE  = 200

# Dokumentierter UTC-Zeitstempel des Enrichment-Write-Starts (2026-07-23)
ENRICHED_AT = '2026-07-23 10:47:06+00'


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def run_sql(sql: str) -> dict:
    result = subprocess.run(
        ['npx', 'supabase', 'db', 'query', '--linked'],
        input=sql,
        capture_output=True,
        text=True,
        cwd=PROJECT_DIR,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f'db query fehlgeschlagen:\n{result.stderr}\n{result.stdout}')
    stdout = result.stdout
    start = stdout.find('{')
    if start == -1:
        return {'rows': []}
    depth, end = 0, start
    for i, ch in enumerate(stdout[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    return json.loads(stdout[start:end])


def esc(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def load_done() -> set:
    if DONE_FILE.exists():
        return set(DONE_FILE.read_text().splitlines())
    return set()


def save_done(done: set):
    DONE_FILE.write_text('\n'.join(sorted(done)))


def build_sql(rows: list[dict]) -> str:
    vals = []
    for r in rows:
        vals.append(f"  ({esc(r['external_id'])}, {esc(r['context_osm_id'])})")
    values_str = ',\n'.join(vals)
    return f"""
UPDATE public.table_candidates AS tc
SET
  context_osm_id = v.osm_id,
  enriched_at    = '{ENRICHED_AT}'::timestamptz
FROM (VALUES
{values_str}
) AS v(external_id, osm_id)
WHERE tc.external_id         = v.external_id
  AND tc.enriched_display_name IS NOT NULL
  AND (tc.context_osm_id IS NULL OR tc.enriched_at IS NULL)
"""


# ── Hauptprogramm ────────────────────────────────────────────────────────────

def main():
    print(f'── Lade CSV: {CSV_IN}')
    rows = []
    skipped_fallback = 0
    skipped_no_osm_id = 0

    with open(CSV_IN, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if not row.get('enriched_display_name') or row.get('enriched_name_source') == 'fallback':
                skipped_fallback += 1
                continue
            if not row.get('context_osm_id'):
                skipped_no_osm_id += 1
                continue
            rows.append({'external_id': row['external_id'], 'context_osm_id': row['context_osm_id']})

    print(f'   Mit Kontext + context_osm_id: {len(rows):,}')
    print(f'   Übersprungen (Fallback):       {skipped_fallback:,}')
    print(f'   Übersprungen (kein OSM-ID):    {skipped_no_osm_id:,}')

    done = load_done()
    pending = [r for r in rows if r['external_id'] not in done]
    print(f'   Bereits erledigt:              {len(done):,}')
    print(f'   Ausstehend:                    {len(pending):,}')

    if not pending:
        print('── Nichts zu tun. Fertig.')
    else:
        print(f'\n── Schreibe {len(pending):,} Zeilen in Batches à {BATCH_SIZE} …')
        ok = err = 0
        total = len(pending)

        for start in range(0, total, BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            try:
                run_sql(build_sql(batch))
                for r in batch:
                    done.add(r['external_id'])
                ok += len(batch)
            except Exception as e:
                print(f'   FEHLER Batch {start}–{start+len(batch)}: {e}', file=sys.stderr)
                err += len(batch)

            processed = start + len(batch)
            if processed % 1000 == 0 or processed == total:
                save_done(done)
                print(f'   {processed:,}/{total:,} ({100*processed//total}%) ok={ok} err={err}')

        save_done(done)
        print(f'\n── Abgeschlossen: ok={ok:,}  err={err:,}')

    # Abschlussprüfung aus DB
    print('\n── Verifikation aus DB:')
    result = run_sql("""
SELECT
  COUNT(*)                                                          AS gesamt,
  COUNT(*) FILTER (WHERE enriched_display_name IS NOT NULL)        AS mit_displayname,
  COUNT(*) FILTER (WHERE context_name IS NOT NULL)                 AS mit_kontextname,
  COUNT(*) FILTER (WHERE context_osm_id IS NOT NULL)               AS mit_osm_id,
  COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)                  AS mit_enriched_at,
  COUNT(*) FILTER (WHERE enriched_display_name IS NULL)            AS fallback
FROM public.table_candidates
""")
    for row in result.get('rows', []):
        print(f'   Kandidaten gesamt:             {row["gesamt"]:>7}')
        print(f'   Mit enriched_display_name:     {row["mit_displayname"]:>7}')
        print(f'   Mit context_name:              {row["mit_kontextname"]:>7}')
        print(f'   Mit context_osm_id:            {row["mit_osm_id"]:>7}')
        print(f'   Mit enriched_at:               {row["mit_enriched_at"]:>7}')
        print(f'   Fallback (kein Kontext):       {row["fallback"]:>7}')


if __name__ == '__main__':
    main()
