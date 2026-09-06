-- ============================================================================
-- 00073 SECURITY HARDENING WAVE — WORKSTREAM C: storage bucket listing
--
-- Public SELECT/listing policy on storage.objects grants ANY visitor the
-- ability to enumerate object names inside a bucket. That capability is only
-- needed where the client calls storage .list():
--   * ads-images        -> client only uses getPublicUrl/upload/remove (no list)
--   * category-covers   -> client only uses getPublicUrl (no list)
--   * inventory-images  -> KEPT: centralListImages() lists folders for anon +
--                          authenticated public display (see WORKSTREAM C note)
--
-- Public object READS (public-bucket GET URLs) are unaffected by dropping the
-- SELECT policy. All authenticated staff upload/update/delete policies are
-- preserved verbatim. Existing public image URLs keep working.
-- ============================================================================

DROP POLICY IF EXISTS "Public read ads-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read category-covers" ON storage.objects;

-- END 00073