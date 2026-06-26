-- ════════════════════════════════════════════════════════════════════════
-- event_images — Bilder für Spielrunden
-- Idempotent: sicher mehrfach ausführbar.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.event_images (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id     integer     NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploaded_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  image_url    text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz DEFAULT now(),
  reviewed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz
);

ALTER TABLE public.event_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_images_select_approved" ON public.event_images;
CREATE POLICY "event_images_select_approved"
  ON public.event_images FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "event_images_select_own" ON public.event_images;
CREATE POLICY "event_images_select_own"
  ON public.event_images FOR SELECT USING (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "event_images_select_mod" ON public.event_images;
CREATE POLICY "event_images_select_mod"
  ON public.event_images FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('moderator','admin')));

DROP POLICY IF EXISTS "event_images_insert" ON public.event_images;
CREATE POLICY "event_images_insert"
  ON public.event_images FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "event_images_update_mod" ON public.event_images;
CREATE POLICY "event_images_update_mod"
  ON public.event_images FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('moderator','admin')));

DROP POLICY IF EXISTS "event_images_delete_mod" ON public.event_images;
CREATE POLICY "event_images_delete_mod"
  ON public.event_images FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('moderator','admin')));

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-images', 'event-images', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "event_images_storage_read"   ON storage.objects;
CREATE POLICY "event_images_storage_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event_images_storage_insert" ON storage.objects;
CREATE POLICY "event_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "event_images_storage_delete" ON storage.objects;
CREATE POLICY "event_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-images' AND auth.uid() IS NOT NULL);
