-- ════════════════════════════════════════════════════════════════════════
-- TISCHTENNIS SCHWEINFURT — table_images Migration
-- Ausführen im Supabase SQL-Editor: https://supabase.com/dashboard
-- ════════════════════════════════════════════════════════════════════════

-- 1. Tabelle erstellen
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

-- 2. RLS aktivieren
ALTER TABLE public.table_images ENABLE ROW LEVEL SECURITY;

-- 3. Jeder (auch anonym) sieht freigegebene Bilder
CREATE POLICY "table_images_select_approved"
  ON public.table_images FOR SELECT
  USING (status = 'approved');

-- 4. Eingeloggte Nutzer sehen ihre eigenen Bilder (inkl. pending/rejected)
CREATE POLICY "table_images_select_own"
  ON public.table_images FOR SELECT
  USING (auth.uid() = uploaded_by);

-- 5. Moderatoren und Admins sehen alle Bilder
CREATE POLICY "table_images_select_mod"
  ON public.table_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('moderator', 'admin')
    )
  );

-- 6. Eingeloggte Nutzer können eigene Bilder einstellen
CREATE POLICY "table_images_insert"
  ON public.table_images FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by AND auth.uid() IS NOT NULL);

-- 7. Moderatoren/Admins können Status ändern (approve/reject)
CREATE POLICY "table_images_update_mod"
  ON public.table_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('moderator', 'admin')
    )
  );

-- 8. Eigene pending-Bilder können gelöscht werden
CREATE POLICY "table_images_delete_own"
  ON public.table_images FOR DELETE
  USING (auth.uid() = uploaded_by AND status = 'pending');

-- ════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- ════════════════════════════════════════════════════════════════════════

-- 9. Bucket erstellen (5 MB Limit, nur JPEG/PNG/WebP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'table-images',
  'table-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 10. Storage-RLS: Lesezugriff für alle (Bucket ist public)
CREATE POLICY "table_images_storage_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'table-images');

-- 11. Storage-RLS: Eingeloggte Nutzer können hochladen
CREATE POLICY "table_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'table-images' AND auth.uid() IS NOT NULL);

-- 12. Storage-RLS: Eigene Dateien löschen (Pfad: tableId/userId_timestamp.jpg)
CREATE POLICY "table_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'table-images' AND auth.uid() IS NOT NULL);
