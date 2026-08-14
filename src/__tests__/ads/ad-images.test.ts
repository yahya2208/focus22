import { describe, it, expect } from 'vitest';
import applySql from '../../../supabase/ads-multi-image/01-ads-multi-image-apply.sql?raw';
import backfillSql from '../../../supabase/ads-multi-image/05-ad-images-backfill.sql?raw';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ');
}

describe('ad_images SQL migration surface (Phase C — 01-ads-multi-image-apply.sql)', () => {
  it('creates the ad_images table with the documented columns and constraints', () => {
    expect(applySql).toContain('CREATE TABLE IF NOT EXISTS public.ad_images');
    expect(applySql).toContain('id           UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(applySql).toContain('ad_placement TEXT NOT NULL REFERENCES public.ads(placement) ON DELETE CASCADE');
    expect(applySql).toContain('position     INTEGER NOT NULL DEFAULT 0');
    expect(applySql).toContain('is_cover     BOOLEAN NOT NULL DEFAULT FALSE');
    expect(applySql).toContain('CONSTRAINT ad_images_unique_path UNIQUE (ad_placement, path)');
  });

  it('enforces exactly one cover per placement (partial unique index)', () => {
    expect(applySql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_images_cover');
    expect(applySql).toContain('ON public.ad_images (ad_placement) WHERE is_cover = TRUE');
  });

  it('keeps the legacy mirror: sync_ads_image_mirror trigger writes only the cover', () => {
    const fnStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror()');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = applySql.slice(fnStart, applySql.indexOf('$$;', fnStart));
    expect(applySql).toContain('CREATE TRIGGER trg_ad_images_mirror');
    expect(applySql).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.ad_images');
    expect(fn).toContain('SET image_path = v_cover_path,');
    expect(fn).toContain("image_url  = ''");
    expect(fn).toContain("SET image_path = ''");
  });

  it('exposes ad_images as SELECT-only for public — writes only via RPCs', () => {
    expect(applySql).toContain('ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY');
    expect(applySql).toContain('CREATE POLICY "Public read enabled ad images"');
    expect(applySql).toContain('ON public.ad_images FOR SELECT TO anon, authenticated');
    expect(applySql).toContain('a.placement = ad_placement AND a.enabled = TRUE');
    expect(applySql).toContain('REVOKE ALL ON public.ad_images FROM anon, authenticated');
    expect(applySql).toContain('GRANT SELECT ON public.ad_images TO anon, authenticated');
    expect(applySql).not.toContain('GRANT INSERT, UPDATE, DELETE ON public.ad_images');
  });

  it('defines the admin gate ad_is_admin as SECURITY DEFINER', () => {
    const fnStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.ad_is_admin()');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = applySql.slice(fnStart, applySql.indexOf('$$;', fnStart));
    expect(fn).toContain('LANGUAGE sql');
    expect(fn).toContain('STABLE');
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain('SET search_path = public');
    expect(fn).toContain("u.role IN ('admin','super_admin')");
  });

  it('ad_add_image guards placement prefix and object existence', () => {
    const fnStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.ad_add_image(');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = applySql.slice(fnStart, applySql.indexOf('$$;', fnStart));
    expect(fn).toContain("p_path LIKE 'ads-images/' || p_ad_placement || '/%'");
    expect(fn).toContain("OR p_path LIKE 'ads/' || p_ad_placement || '/%'");
    expect(fn).toContain('storage.objects');
    expect(fn).toContain('FOR UPDATE');
    expect(fn).toContain("IF NOT public.ad_is_admin() THEN");
  });

  it('ad_replace_images and ad_remove_image are present with the planned signatures', () => {
    const n = normalized(applySql);
    expect(n).toContain(
      'CREATE OR REPLACE FUNCTION public.ad_replace_images( p_ad_placement text, p_paths text[], p_covers boolean[] DEFAULT NULL )',
    );
    expect(n).toContain('RETURNS SETOF public.ad_images');
    expect(n).toContain('CREATE OR REPLACE FUNCTION public.ad_remove_image( p_image_id uuid ) RETURNS text');
  });

  it('grants EXECUTE to authenticated and revokes PUBLIC for exactly the 4 RPCs', () => {
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.ad_is_admin() TO authenticated');
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.ad_add_image(text, text, integer, boolean) TO authenticated');
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.ad_remove_image(uuid) TO authenticated');
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.ad_replace_images(text, text[], boolean[]) TO authenticated');
    expect(countOccurrences(applySql, 'REVOKE ALL ON FUNCTION')).toBe(4);
    expect(countOccurrences(applySql, 'GRANT EXECUTE ON FUNCTION')).toBe(4);
  });

  it('adds ad_images to realtime via the guarded publication (no raw internal inserts)', () => {
    expect(applySql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_images');
    expect(applySql).not.toContain('INSERT INTO supabase_realtime');
  });
});

describe('05-ad-images-backfill.sql (Phase C — legacy single-image ads → gallery)', () => {
  it('mirrors each legacy ad with an image as one cover row', () => {
    expect(backfillSql).toContain('INSERT INTO public.ad_images (ad_placement, path, position, is_cover, created_at)');
    expect(backfillSql).toContain('SELECT placement, image_path, 0, TRUE, COALESCE(updated_at, now())');
    expect(backfillSql).toContain('FROM public.ads');
    expect(backfillSql).toContain("WHERE image_path IS NOT NULL AND image_path <> ''");
  });

  it('is idempotent and all-or-nothing (guarded transaction)', () => {
    expect(backfillSql).toContain('BEGIN;');
    expect(backfillSql).toContain('ON CONFLICT (ad_placement, path) DO NOTHING');
    expect(backfillSql).toContain('COMMIT;');
    expect(backfillSql).toContain('RAISE EXCEPTION');
  });
});
