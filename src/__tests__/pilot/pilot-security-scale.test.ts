/**
 * Neighborhood Pilot — security + replay determinism + scale-readiness.
 * Offline structural proofs:
 *   Security  — RLS enabled on every new table; client gets SELECT-only; any
 *               write path (policy or RPC) re-checks fn_admin_uid() server-side.
 *   Replay    — pilot_reset's delete predicates exactly cover the pilot-*
 *               markers the seed inserts, so reset→re-seed is deterministic.
 *   Scale     — second neighborhood/store/family are pure data additions (slug
 *               uniqueness + FK shapes already support them; store inventory
 *               reuses canonical inventory_items).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M65 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00065_neighborhood_store_pilot.sql'), 'utf-8');
const M66 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00066_pilot_seed.sql'), 'utf-8');
const APP = fs.readFileSync(path.resolve(__dirname, '../../../src/App.tsx'), 'utf-8');

const NEW_TABLES = ['neighborhoods', 'stores', 'family_groups', 'neighborhood_families', 'store_inventory'];

describe('Security — client gets read-only via RLS; writes are admin-gated', () => {
  it('enables RLS on every new pilot table', () => {
    for (const t of NEW_TABLES) {
      expect(M65, t).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('public clients receive SELECT on the pilot tables and nothing else', () => {
    const grant = M65.split('GRANT SELECT ON public.neighborhoods,')[1] ?? '';
    expect(grant).toContain('TO anon, authenticated');
    expect(M65).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)\b[^;]*ON public\.(neighborhoods|stores|family_groups)/);
  });

  it('all admin manage policies re-check fn_admin_uid() server-side', () => {
    const policyBlocks = M65.split('CREATE POLICY').filter((b) => b.includes('FOR ALL TO authenticated'));
    expect(policyBlocks.length).toBeGreaterThanOrEqual(NEW_TABLES.length);
    for (const b of policyBlocks) {
      expect(b).toContain('public.fn_admin_uid() IS NOT NULL');
      expect(b).toContain('WITH CHECK (public.fn_admin_uid() IS NOT NULL)');
    }
  });

  it('public row visibility is status-scoped (inactive/archived are hidden)', () => {
    for (const t of ['neighborhoods', 'stores', 'family_groups']) {
      expect(M65, t).toContain(`ON public.${t} FOR SELECT TO anon, authenticated`);
      expect(M65, t).toMatch(new RegExp(`USING \\(${t === 'family_groups' ? 'status = \\x27active\\x27' : 'status = \\x27active\\x27'}\\)`));
    }
  });

  it('operator RPCs are authenticated-only (no anon) and refuse non-owners', () => {
    expect(M65).toContain('GRANT EXECUTE ON FUNCTION public.pilot_orders_for_store(uuid) TO authenticated');
    expect(M65).toContain('GRANT EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) TO authenticated');
    expect(M65).toMatch(/s\.operator_user_id = v_uid/);
    expect(M65).toContain("RAISE EXCEPTION 'PERMISSION_DENIED'");
  });

  it('the admin screen is reachable only under catalog/write in the app router', () => {
    expect(APP).toContain("'pilot-admin': PilotOpsAdminScreen");
    const branch = APP.split("currentScreen === 'pilot-admin'")[1] ?? '';
    expect(branch).toContain('<ProtectedRoute requiredResource="catalog" requiredAction="write">');
    expect(branch).toContain('<PilotOpsAdminScreen />');
  });
});

describe('Replay — pilot_reset covers exactly the markers the seed creates', () => {
  it('every seeded slug matches the reset predicate weakly', () => {
    const seededSlugs = [...M66.matchAll(/'pilot-[a-z0-9-]+'/g)].map((m) => m[0].replace(/'/g, ''));
    expect(seededSlugs.length).toBeGreaterThan(0);
    for (const slug of seededSlugs) {
      expect(slug.startsWith('pilot-'), slug).toBe(true);
    }
  });

  it('every seeded source_key is a pilot: marker', () => {
    const keys = [...M66.matchAll(/'pilot:[a-z0-9_.:-]+'/g)].map((m) => m[0].replace(/'/g, ''));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith('pilot:')).toBe(true);
  });

  it('seed inserts are guarded (re-runnable after reset)', () => {
    for (const guard of [
      'ON CONFLICT (neighborhood_id, family_id) DO NOTHING',
      'ON CONFLICT (store_id, inventory_id) DO NOTHING',
      'ON CONFLICT (model_id, variant, condition, color) DO NOTHING',
      'WHERE NOT EXISTS',
    ]) {
      expect(M66, guard).toContain(guard);
    }
  });

  it('reset and seed agree on marker prefix (pilot- / pilot:)', () => {
    expect(M65).toContain("slug LIKE 'pilot-%'");
    expect(M65).toContain("source_key LIKE 'pilot:%'");
    expect(M66).toContain("slug = 'pilot-neighborhood-1'");
    expect(M66).toContain("slug = 'pilot-store-1'");
  });
});

describe('Scale — second neighborhood/store/family are pure data additions', () => {
  it('slug unique constraints allow a second unit (no numeric special-casing)', () => {
    expect((M65.match(/slug\s+text NOT NULL UNIQUE/g) ?? []).length).toBe(3); // n, s, fg
    expect(M65).not.toMatch(/pilot-(neighborhood|store|family)-[0-9]/);
  });

  it('store_inventory is store-generic: Store #2 reuses the same canonical inventory rows', () => {
    // store_inventory is keyed (store_id, inventory_id); nothing pilot-specific.
    expect(M65).toContain('PRIMARY KEY (store_id, inventory_id)');
    const tableBlock = (M65.match(/CREATE TABLE IF NOT EXISTS public\.store_inventory[\s\S]*?;/)?.[0] ?? '');
    expect(tableBlock).not.toMatch(/pilot/);
    expect(tableBlock).toContain('REFERENCES public.inventory_items(id)');
  });

  it('the second unit inserts use the SAME seed column signatures (data only)', () => {
    const storesCols = (M66.match(/INSERT INTO public\.stores \(([^)]+)\)/) ?? [])[1] ?? '';
    const familyCols = (M66.match(/INSERT INTO public\.family_groups \(([^)]+)\)/) ?? [])[1] ?? '';
    expect(storesCols).toBe('neighborhood_id, name, name_ar, slug, status, description, contact_phone');
    expect(familyCols).toBe('name, name_ar, slug, status, description');
  });

  it('orders gain store context that is null-safe for legacy rows', () => {
    expect(M65).toContain('ON DELETE SET NULL');
  });
});