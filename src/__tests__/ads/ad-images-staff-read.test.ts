import { describe, it, expect } from 'vitest';
import applySql from '../../../supabase/migrations/00028_ads_images_staff_read_policy.sql?raw';

describe('00028 — ad_images staff read policy (fix disabled ad gallery visibility)', () => {
  it('creates a "Staff read all ad images" SELECT policy on ad_images', () => {
    expect(applySql).toContain('CREATE POLICY "Staff read all ad images"');
    expect(applySql).toContain('ON public.ad_images FOR SELECT TO authenticated');
  });

  it('uses the existing ad_is_admin() gate (SECURITY DEFINER function)', () => {
    expect(applySql).toContain('public.ad_is_admin()');
  });

  it('drops any previous version of the policy for idempotency', () => {
    expect(applySql).toContain('DROP POLICY IF EXISTS "Staff read all ad images" ON public.ad_images');
  });

  it('does NOT grant INSERT, UPDATE, or DELETE to public/staff via this migration', () => {
    expect(applySql).not.toContain('GRANT INSERT');
    expect(applySql).not.toContain('GRANT UPDATE');
    expect(applySql).not.toContain('GRANT DELETE');
  });

  it('does NOT drop or alter the existing public read policy', () => {
    // The public policy from 00020 gates on ads.enabled = TRUE.
    // This migration must NOT remove or modify it.
    const lines = applySql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toContain('DROP POLICY "Public read enabled ad images"');
    expect(nonComment).not.toContain('DROP POLICY IF EXISTS "Public read enabled ad images"');
  });
});
