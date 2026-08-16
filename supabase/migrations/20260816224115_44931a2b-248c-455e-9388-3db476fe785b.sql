CREATE POLICY "media_read_authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('review-photos','avatars'));
CREATE POLICY "media_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('review-photos','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "media_update_own_folder" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('review-photos','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "media_delete_own_folder" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('review-photos','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);