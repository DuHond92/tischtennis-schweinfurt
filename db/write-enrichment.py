#!/usr/bin/env python3
"""
Schreibt eine Enrichment-CSV nach public.table_candidates via
`npx supabase db query --linked` (Management-API, kein Service-Role-Key).

Verwendung:
  python3 db/write-enrichment.py <csv-datei>

Beispiel:
  python3 db/write-enrichment.py db/enrichment-v4.csv

Die CSV muss die Spalten enthalten, die osm-enrich.py ausgibt:
  external_id, enriched_display_name, enriched_name_source,
  context_type, context_name, context_osm_id, context_method,
  context_distance_m, context_confidence

Sicherheitsregeln:
- Überschreibt NIEMALS echte/manuelle Namen (name_source in NEVER_OVERWRITE).
- Überschreibt NIEMALS enriched_display_name wenn enriched_name_source
  bereits ein echter Wert ist (nicht in FALLBACK_SOURCES).
- Backup der betroffenen DB-Zeilen vor dem ersten Schreiben.
- Resumable: bereits geschriebene external_ids werden übersprungen.
- Setzt immer context_osm_id (Format: way/*, node/*, relation/*) und
  enriched_at = NOW() (serverseitiger UTC-Zeitstempel bei jedem Batch).
"""

import argparse
import csv
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ── Konstanten ───────────────────────────────────────────────────────────────

# Repo-Wurzel: Elternverzeichnis von db/
PROJECT_DIR = str(Path(__file__).resolve().parent.parent)

BATCH_SIZE = 200

NEVER_OVERWRITE_NAME_SOURCE = frozenset({
    'osm_name', 'osm_name_de', 'osm_operator', 'admin_input',
})

FALLBACK_SOURCES = frozenset({
    'fallback', 'enriched', 'osm_addr_street', 'osm_addr_city',
    'osm_park', 'osm_playground', 'osm_school', 'osm_kindergarten',
    'osm_sports', 'osm_pool', 'osm_camping', 'osm_recreation',
    'osm_square', 'osm_suburb', 'osm_street', 'osm_street_extended',
    'osm_cemetery',
})


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
    depth = 0
    end = start
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


def backup_current_state(external_ids: list[str], backup_dir: Path) -> Path:
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = backup_dir / f'enrichment-backup-{ts}.csv'
    print(f'── Backup wird erstellt: {backup_path}')
    all_rows = []
    for i in range(0, len(external_ids), 500):
        batch = external_ids[i:i + 500]
        ids_sql = ', '.join(esc(x) for x in batch)
        result = run_sql(f"""
SELECT external_id, matched_table_id, enriched_display_name,
       enriched_name_source, context_type, context_name,
       context_method, context_osm_id, enriched_at
FROM public.table_candidates
WHERE external_id IN ({ids_sql})
""")
        all_rows.extend(result.get('rows', []))
        print(f'   {min(i + 500, len(external_ids))}/{len(external_ids)} Backup-Zeilen geladen …')
    if all_rows:
        with open(backup_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=all_rows[0].keys())
            w.writeheader()
            w.writerows(all_rows)
    print(f'   Backup: {len(all_rows)} Zeilen gespeichert → {backup_path}')
    return backup_path


def load_done(done_file: Path) -> set[str]:
    if done_file.exists():
        return set(done_file.read_text(encoding='utf-8').splitlines())
    return set()


def save_done(done: set[str], done_file: Path):
    done_file.write_text('\n'.join(sorted(done)), encoding='utf-8')


def build_update_sql(rows: list[dict]) -> str:
    fallback_sql = ', '.join(esc(s) for s in sorted(FALLBACK_SOURCES))
    fallback_sql += ', NULL'
    value_parts = []
    for r in rows:
        osm_id = esc(r['context_osm_id']) if r.get('context_osm_id') else 'NULL'
        value_parts.append(
            f"  ({esc(r['external_id'])}, {esc(r['enriched_display_name'] or '')}, "
            f"{esc(r['enriched_name_source'] or '')}, {esc(r['context_type'] or '')}, "
            f"{esc(r['context_name'] or '')}, {esc(r['context_method'] or '')}, "
            f"{r['context_distance_m'] or 'NULL'}::int, "
            f"{r.get('context_confidence') or 'NULL'}::real, "
            f"{osm_id})"
        )
    values_str = ',\n'.join(value_parts)
    return f"""
UPDATE public.table_candidates AS tc
SET
  enriched_display_name  = v.display_name,
  enriched_name_source   = v.name_source,
  context_type           = v.ctx_type,
  context_name           = v.ctx_name,
  context_method         = v.method,
  context_distance_m     = v.dist,
  context_confidence     = v.conf,
  context_osm_id         = v.osm_id,
  enriched_at            = NOW()
FROM (VALUES
{values_str}
) AS v(external_id, display_name, name_source, ctx_type, ctx_name, method, dist, conf, osm_id)
WHERE tc.external_id = v.external_id
  AND (
    tc.enriched_name_source IS NULL
    OR tc.enriched_name_source IN ({fallback_sql})
  )
"""


# ── Hauptprogramm ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Enrichment-CSV nach Supabase schreiben')
    parser.add_argument('csv', type=Path, help='Pfad zur Enrichment-CSV (Ausgabe von osm-enrich.py)')
    args = parser.parse_args()

    csv_in: Path = args.csv.resolve()
    done_file = csv_in.with_suffix('.write-done')
    backup_dir = csv_in.parent

    if not csv_in.exists():
        sys.exit(f'Fehler: CSV nicht gefunden: {csv_in}')

    print(f'── Lade CSV: {csv_in}')
    rows_to_write = []
    with open(csv_in, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if not row.get('enriched_display_name') or row.get('enriched_name_source') == 'fallback':
                continue
            rows_to_write.append(row)
    print(f'   {len(rows_to_write):,} Zeilen mit Kontext')

    done = load_done(done_file)
    pending = [r for r in rows_to_write if r['external_id'] not in done]
    print(f'   Bereits geschrieben: {len(done):,}')
    print(f'   Ausstehend:          {len(pending):,}')

    if not pending:
        print('── Nichts zu schreiben. Fertig.')
    else:
        if not done:
            backup_current_state([r['external_id'] for r in rows_to_write], backup_dir)
        else:
            print('── Resume-Modus: Backup bereits vorhanden, wird übersprungen.')

        print(f'\n── Schreibe {len(pending):,} Zeilen in Batches à {BATCH_SIZE} …')
        ok = err = 0
        total = len(pending)

        for start in range(0, total, BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            try:
                run_sql(build_update_sql(batch))
                for r in batch:
                    done.add(r['external_id'])
                ok += len(batch)
            except Exception as e:
                print(f'   FEHLER Batch {start}–{start+len(batch)}: {e}', file=sys.stderr)
                err += len(batch)

            processed = start + len(batch)
            if processed % 1000 == 0 or processed == total:
                save_done(done, done_file)
                print(f'   {processed:,}/{total:,} ({100*processed//total}%) ok={ok} err={err}')

        save_done(done, done_file)
        print(f'\n── Schreiben abgeschlossen: ok={ok:,}  err={err:,}  gesamt={total:,}')

    # public.tables: generische Namen nachpflegen
    print('\n── Aktualisiere public.tables (generische Namen) …')
    never_sql = ', '.join(esc(s) for s in sorted(NEVER_OVERWRITE_NAME_SOURCE))
    fallback_sql = ', '.join(esc(s) for s in sorted(FALLBACK_SOURCES))
    try:
        result = run_sql(f"""
WITH updated AS (
  UPDATE public.tables t
     SET name        = tc.enriched_display_name,
         name_source = tc.enriched_name_source
    FROM public.table_candidates tc
   WHERE t.id        = tc.matched_table_id
     AND tc.enriched_display_name IS NOT NULL
     AND tc.enriched_name_source NOT IN ('fallback')
     AND (t.name_source IS NULL OR t.name_source IN ({fallback_sql}))
     AND t.name_source NOT IN ({never_sql})
  RETURNING 1
)
SELECT count(*)::integer AS updated_tables FROM updated
""")
        n = result.get('rows', [{}])[0].get('updated_tables', '?')
        print(f'   public.tables aktualisiert: {n} Einträge')
    except Exception as e:
        print(f'   FEHLER: {e}', file=sys.stderr)

    # Abschlussbericht
    print('\n── Statistik aus DB …')
    try:
        result = run_sql("""
SELECT enriched_name_source, count(*)::int AS n
FROM public.table_candidates
WHERE enriched_display_name IS NOT NULL
GROUP BY enriched_name_source
ORDER BY n DESC
""")
        print(f'   {"Quelle":<30} {"Anzahl":>8}')
        print('   ' + '─' * 40)
        total_enriched = 0
        for row in result.get('rows', []):
            src = row.get('enriched_name_source') or '(null)'
            n = int(row.get('n', 0))
            total_enriched += n
            print(f'   {src:<30} {n:>8}')
        print(f'   {"GESAMT":<30} {total_enriched:>8}')
    except Exception as e:
        print(f'   FEHLER: {e}', file=sys.stderr)


if __name__ == '__main__':
    main()
