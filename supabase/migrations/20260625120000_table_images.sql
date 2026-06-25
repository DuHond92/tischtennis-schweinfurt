-- ════════════════════════════════════════════════════════════════════════
-- table_images — Baseline
-- Wurde ursprünglich manuell im SQL-Editor angelegt.
-- Vollständig idempotent: sicher auch auf einem DB-Stand wo es schon existiert.
-- ════════════════════════════════════════════════════════════════════════

-- Tabelle
CREATE TABLE IF NOT EXISTS public.table_images (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id     integer     NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  uploaded_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  image_url    text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz DEFAULT now(),
  reviewed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz
);

ALTER TABLE public.table_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies (DROP IF EXISTS + CREATE = idempotent)
DROP POLICY IF EXISTS "table_images_select_approved" ON public.table_images;
CREATE POLICY "table_images_select_approved"
  ON public.table_images FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "table_images_select_own" ON public.table_images;
CREATE POLICY "table_images_select_own"
  ON public.table_images FOR SELECT
  USING (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "table_images_select_mod" ON public.table_images;
CREATE POLICY "table_images_select_mod"
  ON public.table_images FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator','admin'))
  );

DROP POLICY IF EXISTS "table_images_insert" ON public.table_images;
CREATE POLICY "table_images_insert"
  ON public.table_images FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "table_images_update_mod" ON public.table_images;
CREATE POLICY "table_images_update_mod"
  ON public.table_images FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('moderator','admin'))
  );

DROP POLICY IF EXISTS "table_images_delete_own" ON public.table_images;
CREATE POLICY "table_images_delete_own"
  ON public.table_images FOR DELETE
  USING (auth.uid() = uploaded_by AND status = 'pending');

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('table-images', 'table-images', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "table_images_storage_read"   ON storage.objects;
CREATE POLICY "table_images_storage_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'table-images');

DROP POLICY IF EXISTS "table_images_storage_insert" ON storage.objects;
CREATE POLICY "table_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'table-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "table_images_storage_delete" ON storage.objects;
CREATE POLICY "table_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'table-images' AND auth.uid() IS NOT NULL);
