-- ════════════════════════════════════════════════════════════════════════
-- SEED: tables (Tischtennisplatten)
-- IDs 1–9 sind manuell angelegte Demo-Platten.
-- IDs 18–35 wurden automatisch über OpenStreetMap / Overpass API importiert.
-- Neue OSM-Importe werden durch die App selbst nachgezogen — hier nur Basis-Set.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO public.tables (id, name, address, lat, lng, type, icon)
VALUES
  -- Demo-Platten (für Events und Tests)
  (1,  'Stadtpark',              'Stadtpark Schweinfurt',              50.0497,   10.2322,  'outdoor', '🌳'),
  (2,  'Obere Marktstraße',      'Obere Marktstraße, SW',              50.0521,   10.2352,  'outdoor', '🏙️'),
  (3,  'TTC Halle Bellevue',     'Turnhalle Bellevue, SW',             50.0448,   10.2280,  'indoor',  '🏢'),
  (4,  'Schillerplatz',          'Schillerplatz, SW',                  50.0535,   10.2398,  'outdoor', '🌆'),
  (7,  'Bürgerpark Ost',         'Bürgerpark, SW-Ost',                 50.0460,   10.2450,  'outdoor', '🌿'),
  (9,  'Mainkai',                'Mainkai, SW',                        50.0500,   10.2200,  'outdoor', '🌊'),
  -- OSM-Importe
  (18, 'Wehranlage Schweinfurt', 'Im I. Wehr, 97424 Schweinfurt',      50.042948, 10.243729,'outdoor', '🌊'),
  (19, 'Celtis Gymnasium',       'Gymnasiumstraße 5, 97421 Schweinfurt',50.047395, 10.229667,'outdoor', '🏫'),
  (20, 'Verkehrsgarten',         'Friedrich-Stein-Straße, 97421 SW',   50.044443, 10.223161,'outdoor', '🏓'),
  (21, 'Fritz-Drescher-Straße',  'Fritz-Drescher-Straße, 97421 SW',    50.043752, 10.214198,'outdoor', '🏓'),
  (22, 'FOSBOS Niederwerrner',   'Goethestraße, 97421 Schweinfurt',    50.047227, 10.217599,'outdoor', '🎓'),
  (23, 'Nikolaus-Hofmann-Str.',  'Nikolaus-Hofmann-Str., 97421 SW',    50.050706, 10.222063,'outdoor', '🏓'),
  (24, 'Marienbach / SC 1900',   'Deutschhöfer Straße, 97422 SW',      50.055101, 10.230964,'outdoor', '⚽'),
  (25, 'Jugendhaus Franz-Schubert','Franz-Schubert-Str., 97421 SW',    50.052526, 10.214495,'outdoor', '🎮'),
  (26, 'Spielplatz Galgenleite', 'Galgenleite, 97424 Schweinfurt',     50.054122, 10.223383,'outdoor', '🏓'),
  (27, 'GS Kleinflürlein',       'Kleinflürleinsweg, 97424 SW',        50.058205, 10.219902,'outdoor', '🏓'),
  (28, 'Sperlingstraße',         'Sperlingstraße, 97422 Schweinfurt',  50.062334, 10.222064,'outdoor', '🏓'),
  (29, 'Freibad Silvaner',       'Schermbacherstraße, 97422 SW',       50.062545, 10.239703,'outdoor', '🏓'),
  (30, 'Spielplatz Seinäjokipark','Konrad-Adenauer-Str., 97422 SW',    50.062735, 10.251436,'outdoor', '🏓'),
  (31, 'Spielplatz Volksfestplatz','Florian-Geyer-Str., 97421 SW',     50.046597, 10.205330,'outdoor', '🏓'),
  (32, 'Oskar-von-Miller-Straße','Oskar-von-Miller-Str., 97424 SW',    50.042691, 10.192895,'outdoor', '🏓'),
  (33, 'Spielplatz Wohnscheibe', 'Oskar-von-Miller-Str., 97424 SW',    50.041321, 10.195222,'outdoor', '🏓'),
  (34, 'Spielplatz Max-Planck',  'Max-Planck-Straße, 97424 SW',        50.042324, 10.192818,'outdoor', '🏓'),
  (35, 'GS Am Sonnenteller',     'Schweinfurt',                         50.071829, 10.217510,'outdoor', '🏓')
ON CONFLICT (id) DO NOTHING;

-- Sequence anpassen damit neue Platten keine ID-Kollision verursachen
SELECT setval('public.tables_id_seq', (SELECT MAX(id) FROM public.tables));
