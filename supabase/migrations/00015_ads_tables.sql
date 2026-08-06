-- ============================================================================
-- FOCUS — Ads to Supabase (placement-driven banners)
--
-- Type: Additive
-- Needs backfill: optional — INSERT rows with enabled=false for the 6 known
--   placements below so the Ads Manager starts from a clean, visible grid.
-- Directly reversible: yes (DROP TABLE ads; drop storage bucket/policies).
-- Depends on: users table (FK updated_by / role checks), update_updated_at().
--
-- PURPOSE
--   Move ads out of public/ads.json + localStorage into Supabase so that:
--     * Admin edits are stored in the DB (survive refresh / any device).
--     * Every visitor sees the current ad immediately (no rebuild needed).
--     * AdSpot can subscribe via Realtime for instant updates.
--
-- SECURITY
--   * Public (anon + authenticated) can SELECT only *enabled* rows.
--   * Full read/write (including disabled ads) is restricted to
--     admin/super_admin via the authenticated role.
--   * Storage bucket ads-images: public read; upload/update/delete admin-only.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ads;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads (
  placement   TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  image_path  TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  alt         TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_enabled ON public.ads (enabled, sort_order);

DROP TRIGGER IF EXISTS trg_ads_updated_at ON public.ads;
CREATE TRIGGER trg_ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- Public: only enabled placements (what AdSpot renders for visitors).
CREATE POLICY "Public read enabled ads"
  ON public.ads FOR SELECT TO anon, authenticated
  USING (enabled = TRUE);

-- Staff (admin/super_admin): full read including disabled rows (Ads Manager).
CREATE POLICY "Staff read all ads"
  ON public.ads FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

-- Staff (admin/super_admin): write (insert/update/delete).
CREATE POLICY "Staff manage ads"
  ON public.ads FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.ads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ads TO authenticated;

-- ----------------------------------------------------------------------------
-- Storage bucket: ads-images (public read; admin write)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads-images', 'ads-images', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read ads-images" ON storage.objects;
CREATE POLICY "Public read ads-images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ads-images');

DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects;
CREATE POLICY "Staff upload ads-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff update ads-images" ON storage.objects;
CREATE POLICY "Staff update ads-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff delete ads-images" ON storage.objects;
CREATE POLICY "Staff delete ads-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ----------------------------------------------------------------------------
-- Realtime: propagate admin ad edits to visitors instantly.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ads;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Optional seed: known placements disabled (idempotent).
-- ----------------------------------------------------------------------------
INSERT INTO public.ads (placement, enabled)
VALUES ('home', FALSE), ('phones', FALSE), ('repair', FALSE),
       ('results', FALSE), ('exchange', FALSE), ('phone-details', FALSE)
ON CONFLICT (placement) DO NOTHING;
