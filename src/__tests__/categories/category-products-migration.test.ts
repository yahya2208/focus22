/**
 * 00051 (Product ↔ Category membership) migration-content gate.
 *
 * Enforces the approved additive contract:
 *   - 00051 is the highest migration and does NOT modify existing objects
 *     (it must not re-CREATE categories_is_admin or 00050 delivery RPCs).
 *   - The `category_products` join table carries real FKs to categories and
 *     inventory_items plus a membership-uniqueness constraint.
 *   - Every admin write RPC is gated by `categories_is_admin()` — the SAME
 *     check 00050 uses (no weaker authorization).
 *   - Public reads are visibility-gated through `v_public_listings`.
 *   - 00050_categories_delivery.sql and CategoryNav.tsx are FROZEN (unchanged).
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import migration51 from '../../../supabase/migrations/00051_category_content.sql?raw';
import migration50 from '../../../supabase/migrations/00050_categories_delivery.sql?raw';

const SRC = path.resolve(__dirname, '../..');
const categoryNavSource = fs.readFileSync(
  path.join(SRC, 'components', 'categories', 'CategoryNav.tsx'),
  'utf-8',
);

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

describe('00051 — Product ↔ Category content layer', () => {
  it('is present on disk (00052 supersedes it as the highest additive migration)', () => {
    const names = Object.keys(MIGRATIONS).map(basename);
    const nums = names.map(numericPrefix).filter((n): n is number => n !== null);
    expect(Math.max(...nums)).toBe(52);
    expect(names).toContain('00051_category_content.sql');
  });

  it('creates category_products with real FKs + membership uniqueness', () => {
    expect(migration51).toContain('CREATE TABLE IF NOT EXISTS public.category_products');
    expect(migration51).toContain('REFERENCES public.categories(id)');
    expect(migration51).toContain('REFERENCES public.inventory_items(id)');
    expect(migration51).toContain('UNIQUE (category_id, product_id)');
    expect(migration51).toContain('idx_category_products_category_ordered');
    expect(migration51).toContain('idx_category_products_product');
  });

  it('is additive — never re-creates existing authz or 00050 delivery objects', () => {
    expect(migration51).not.toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin');
    expect(migration51).not.toContain('delivery_create_order');
    expect(migration51).not.toContain('CREATE OR REPLACE FUNCTION public.update_updated_at');
    expect(migration51).toContain('categories_is_admin()');
  });

  it('gates every admin write RPC with categories_is_admin()', () => {
    const adminRpcNames = [
      'category_products_admin_list',
      'category_products_admin_assign',
      'category_products_admin_remove',
      'category_products_admin_set_active',
      'category_products_admin_set_featured',
      'category_products_admin_reorder',
    ];
    for (const name of adminRpcNames) {
      expect(migration51, `${name} must exist`).toContain(`public.${name}(`);
      expect(migration51, `${name} must check categories_is_admin`).toContain('categories_is_admin()');
    }
    // Admin RPCs are not executable by anon (least privilege).
    expect(migration51).toMatch(/REVOKE ALL ON FUNCTION public\.category_products_admin_/);
    expect(migration51).toContain('GRANT EXECUTE ON FUNCTION public.category_products_admin_list(uuid) TO authenticated');
  });

  it('public read is visibility-gated through the published-listings view', () => {
    expect(migration51).toContain('category_products_for_category');
    expect(migration51).toContain('JOIN public.v_public_listings v');
    expect(migration51).toContain('cp.is_active = TRUE');
  });

  it('every jsonb_agg ORDER BY t.created_at is backed by cp.created_at in its inner SELECT (42703 fix)', () => {
    // Regression: the aggregation `ORDER BY t.sort_order, t.created_at` was run
    // against an inner SELECT missing `created_at` → ERROR 42703 column does not
    // exist. Both aggregation functions must expose cp.created_at in their
    // subquery projection so the ORDER BY resolves.
    const aggCount = (migration51.match(/ORDER BY t\.sort_order, t\.created_at/g) ?? []).length;
    // category_products_for_category + category_products_admin_list
    expect(aggCount).toBe(2);
    // Both inner SELECTs project cp.created_at (admin_list already did; the
    // public read now does too).
    expect(migration51.match(/cp\.created_at[,]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('00050_categories_delivery.sql is FROZEN (its authz gate is intact)', () => {
    expect(migration50).toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin()');
    expect(migration50).toContain('SECURITY DEFINER');
    expect(migration50).toContain('GRANT EXECUTE ON FUNCTION public.categories_is_admin() TO authenticated');
  });

  it('CategoryNav.tsx is FROZEN (no membership awareness leaked into nav)', () => {
    expect(categoryNavSource).not.toContain('category_products');
    expect(categoryNavSource).not.toContain('getCategoryMembers');
  });
});
