/**
 * 00055 (category → product domain) migration-content gate.
 *
 * Enforces the approved additive contract for GENERIC admin product creation:
 *   - 00055 only ADDS a nullable `domain` hint to public.categories and widens
 *     the two existing admin category RPCs (create/update). It must NOT recreate
 *     categories_is_admin, category_products, or any delivery/listing objects.
 *   - The concrete seeded domains are data-driven (vegetables/fruits → produce),
 *     never a client-side special case.
 */

import { describe, expect, it } from 'vitest';
import migration55 from '../../../supabase/migrations/00055_category_product_domain.sql?raw';
import migration50 from '../../../supabase/migrations/00050_categories_delivery.sql?raw';
import migration51 from '../../../supabase/migrations/00051_category_content.sql?raw';

const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function numericPrefix(name: string): number | null {
  const m = /^(\d{5})_/.exec(name);
  return m ? Number(m[1]) : null;
}

describe('00055 — category → product domain resolution', () => {
  it('is the highest five-digit migration (additive on top of 00050/00051/00053/00054)', () => {
    const names = Object.keys(MIGRATIONS).map(basename);
    const nums = names.map(numericPrefix).filter((n): n is number => n !== null);
    expect(Math.max(...nums)).toBe(55);
    expect(names).toContain('00055_category_product_domain.sql');
  });

  it('adds a nullable `domain` hint column to public.categories', () => {
    expect(migration55).toContain('ALTER TABLE public.categories');
    expect(migration55).toContain('ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT');
    expect(migration55).toContain('chk_categories_domain');
    expect(migration55).toContain("'phone', 'car', 'property', 'produce'");
  });

  it('widens categories_admin_create/update to accept the domain without loosening authz', () => {
    expect(migration55).toContain('CREATE OR REPLACE FUNCTION public.categories_admin_create');
    expect(migration55).toContain('CREATE OR REPLACE FUNCTION public.categories_admin_update');
    // Both keep the SAME categories_is_admin() gate (authorization never weakened).
    expect(migration55.match(/categories_is_admin\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Unknown domain rejected server-side.
    expect(migration55).toContain('INVALID_PRODUCT_DOMAIN');
  });

  it('is additive — never re-creates membership/authz/delivery objects', () => {
    expect(migration55).not.toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin');
    expect(migration55).not.toContain('CREATE TABLE IF NOT EXISTS public.category_products');
    expect(migration55).not.toContain('delivery_create_order');
  });

  it('seeds the produce-capable navigation categories (vegetables/fruits → produce) by data, not special case', () => {
    expect(migration55).toContain("slug IN ('vegetables', 'fruits')");
    expect(migration55).toContain("SET domain = 'produce'");
  });

  it('the underlying 00050/00051 authz gates remain intact', () => {
    expect(migration50).toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin()');
    expect(migration51).toContain('categories_is_admin()');
  });
});
