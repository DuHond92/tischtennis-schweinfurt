-- ════════════════════════════════════════════════════════════════════════
-- table_images — Erweiterungen
-- Spalte sort_order: Reihenfolge der Bilder pro Platte steuerbar
-- Index auf (table_id, status): beschleunigt Abfragen beim Laden einer Platte
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.table_images
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_table_images_table_status
  ON public.table_images (table_id, status);
