import { describe, it, expect } from 'vitest';
import applySql from '../../../supabase/ads-slide-devices/01-ads-slide-devices-apply.sql?raw';
import rollbackSql from '../../../supabase/ads-slide-devices/02-ads-slide-devices-rollback.sql?raw';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sliceFn(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('00021 — per-slide device_id on ad_images (ads-slide-devices)', () => {
  it('adds ad_images.device_id as an additive NOT NULL DEFAULT column', () => {
    expect(applySql).toContain('ALTER TABLE public.ad_images');
    expect(applySql).toContain('ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT \'\'');
  });

  it('guards the format with a NOT VALID constraint (two-phase, no backfill)', () => {
    expect(applySql).toContain('ADD CONSTRAINT ad_images_device_id_format');
    expect(applySql).toContain("CHECK (device_id = '' OR char_length(device_id) BETWEEN 1 AND 128)");
    expect(applySql).toContain('NOT VALID');
    expect(applySql).not.toContain('VALIDATE CONSTRAINT');
    // The backfill's idempotency marker must NOT leak into the apply script.
    expect(applySql).not.toContain('ON CONFLICT (ad_placement, path) DO NOTHING');
  });

  it('ad_add_image_devices mirrors 00020 ad_add_image: admin gate, prefix, ad-exists, storage object existence', () => {
    const fn = sliceFn(applySql, 'CREATE OR REPLACE FUNCTION public.ad_add_image_devices(');
    expect(fn).toContain('IF NOT public.ad_is_admin() THEN');
    expect(fn).toContain("p_path LIKE 'ads-images/' || p_ad_placement || '/%'");
    expect(fn).toContain("OR p_path LIKE 'ads/' || p_ad_placement || '/%'");
    expect(fn).toContain('PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;');
    expect(fn).toContain('RAISE EXCEPTION \'ad % not found\'');
    expect(fn).toContain('SELECT 1 FROM storage.objects');
    expect(fn).toContain("bucket_id = 'ads-images' AND name = p_path");
    expect(fn).toContain('INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id)');
    expect(fn).toContain("COALESCE(p_device_id, '')");
    expect(fn).toContain('invalid device_id format');
  });

  it('ad_replace_images_devices has the planned signature and validates device_ids length/format', () => {
    const fn = sliceFn(applySql, 'CREATE OR REPLACE FUNCTION public.ad_replace_images_devices(');
    expect(fn).toContain('RETURNS SETOF public.ad_images');
    expect(fn).toContain('p_device_ids   text[] DEFAULT NULL');
    expect(fn).toContain('covers array length (%) must match paths (%)');
    expect(fn).toContain('at most one image can be the cover');
    expect(fn).toContain('device_ids array length (%) must match paths (%)');
    expect(fn).toContain('invalid device_id format');
  });

  it('ad_replace_images_devices validates every path (prefix + storage object) BEFORE any write', () => {
    const fn = sliceFn(applySql, 'CREATE OR REPLACE FUNCTION public.ad_replace_images_devices(');
    const validationStart = fn.indexOf('-- Validate every path BEFORE any write');
    const deleteStart = fn.indexOf('DELETE FROM public.ad_images');
    expect(validationStart).toBeGreaterThanOrEqual(0);
    expect(deleteStart).toBeGreaterThan(validationStart);
    expect(fn).toContain("v_path LIKE 'ads-images/' || p_ad_placement || '/%'");
    expect(fn).toContain('SELECT 1 FROM storage.objects');
    expect(fn).toContain('object % does not exist in ads-images bucket');
  });

  it('grants EXECUTE to authenticated and revokes PUBLIC for exactly the 2 new RPCs', () => {
    expect(countOccurrences(applySql, 'GRANT EXECUTE ON FUNCTION')).toBe(2);
    expect(countOccurrences(applySql, 'REVOKE ALL ON FUNCTION')).toBe(2);
    expect(applySql).toContain(
      'GRANT EXECUTE ON FUNCTION public.ad_add_image_devices(text, text, integer, boolean, text) TO authenticated',
    );
    expect(applySql).toContain(
      'GRANT EXECUTE ON FUNCTION public.ad_replace_images_devices(text, text[], boolean[], text[]) TO authenticated',
    );
  });

  it('does not touch the 00020 RPCs, policies, or the migration number of other batches', () => {
    expect(applySql).not.toContain('CREATE OR REPLACE FUNCTION public.ad_add_image(');
    expect(applySql).not.toContain('CREATE OR REPLACE FUNCTION public.ad_replace_images(');
    expect(applySql).not.toContain('CREATE POLICY');
    expect(applySql).not.toContain('ALTER PUBLICATION');
  });

  it('rollback drops the column, constraint, and both new RPCs (no-op on rerun)', () => {
    expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS public.ad_add_image_devices(text, text, integer, boolean, text)');
    expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS public.ad_replace_images_devices(text, text[], boolean[], text[])');
    expect(rollbackSql).toContain('ALTER TABLE public.ad_images DROP CONSTRAINT IF EXISTS ad_images_device_id_format');
    expect(rollbackSql).toContain('ALTER TABLE public.ad_images DROP COLUMN IF EXISTS device_id');
  });
});
