-- ============================================================================
-- 00028 — Fix: Staff read access to ad_images for disabled ads
--
-- ROOT CAUSE: ad_images only had a "Public read enabled ad images" policy
-- that filtered rows where ads.enabled = TRUE. When an ad was disabled
-- (enabled = FALSE), admins could write images via SECURITY DEFINER RPCs
-- but could NOT read them back — RLS silently returned [].
--
-- FIX: Add a "Staff read all ad images" policy mirroring the existing
-- "Staff read all ads" policy on the ads table (00015).
--
-- SECURITY: Public visitors still only see images for enabled ads.
-- Staff (admin/super_admin) can now see all ad_images rows.
-- ============================================================================

-- Staff (admin/super_admin): read all ad_images rows including disabled ads.
-- Mirrors the "Staff read all ads" policy on the ads table.
DROP POLICY IF EXISTS "Staff read all ad images" ON public.ad_images;
CREATE POLICY "Staff read all ad images"
  ON public.ad_images FOR SELECT TO authenticated
  USING (public.ad_is_admin());
