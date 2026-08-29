import { describe, expect, it } from 'vitest';
import m35 from '../../../supabase/migrations/00035_listing_category_core.sql?raw';
import m36 from '../../../supabase/migrations/00036_car_property_details.sql?raw';
import m37 from '../../../supabase/migrations/00037_v_public_listings.sql?raw';
import m38 from '../../../supabase/migrations/00038_listing_rpcs.sql?raw';
import m39 from '../../../supabase/migrations/00039_listing_admin_surface.sql?raw';
import m19 from '../../../supabase/migrations/00019_inventory_central.sql?raw';
import reconcileSql from '../../../supabase/inventory-central/05-constraint-data-reconciliation.sql?raw';
import { LISTING_FILTER_SCHEMAS } from '../../domains/listings';
import {
  CAR_BODY_TYPE_VALUES,
  CAR_CONDITION_STATES,
  CAR_FUEL_VALUES,
  CAR_TRANSMISSION_VALUES,
  PROPERTY_CONDITION_STATES,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_TYPE_VALUES,
} from '../../domains/listings/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function normalizeTuple(raw: string): string[] {
  return raw
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
}

/** Extract the column tuple of a UNIQUE/index definition body. */
function tupleOf(def: string, marker: RegExp): string[] {
  const m = def.match(marker);
  if (!m || !m[1]) throw new Error(`marker ${marker} not found`);
  return normalizeTuple(m[1]);
}

function checkValues(sql: string, constraintColumn: string, occurrence = 1): string[] {
  const re = new RegExp(`${constraintColumn} IN \\(([^)]+)\\)`, 'gi');
  const matches = [...sql.matchAll(re)];
  const m = matches[occurrence - 1];
  if (!m || !m[1]) {
    throw new Error(`CHECK IN list for ${constraintColumn} #${occurrence} not found`);
  }
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

// ── 00035 — category + price_period + SKU swap ─────────────────────────────

describe('Migration 00035 — listing category core', () => {
  it('adds category with default phone and the exact approved CHECK set', () => {
    expect(m35).toContain(
      "ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'phone'",
    );
    expect(m35).toContain('inventory_items_category_check');
    expect(checkValues(m35, 'category')).toEqual(['phone', 'car', 'property']);
  });

  it('adds price_period defaulting to sale with sale|monthly CHECK', () => {
    expect(m35).toContain(
      "ADD COLUMN IF NOT EXISTS price_period TEXT NOT NULL DEFAULT 'sale'",
    );
    expect(m35).toContain('inventory_items_price_period_check');
    expect(checkValues(m35, 'price_period')).toEqual(['sale', 'monthly']);
  });

  it('drops ONLY the phone-SKU constraint — no other destructive DDL', () => {
    const executable = stripComments(m35);
    expect(executable).toContain(
      'DROP CONSTRAINT IF EXISTS inventory_items_unique_sku',
    );
    for (const forbidden of [
      'DROP TABLE',
      'DROP COLUMN',
      'DROP POLICY',
      'DROP TRIGGER',
      'DROP FUNCTION',
      'DROP VIEW',
      'DELETE FROM',
      'TRUNCATE',
      'ALTER PUBLICATION',
      'CREATE TABLE',
      'CREATE OR REPLACE FUNCTION',
    ]) {
      expect(executable, `00035 must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('PRESERVES PHONE BEHAVIOR: partial index tuple is byte-identical to the dropped constraint tuple', () => {
    // Original constraint as defined by migration 00019.
    const original = tupleOf(
      m19,
      /CONSTRAINT\s+inventory_items_unique_sku\s+UNIQUE\s*\(([^)]+)\)/,
    );
    expect(original).toEqual(['model_id', 'variant', 'condition', 'color']);

    // New partial unique index in 00035.
    const swapped = tupleOf(
      m35,
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_sku_phone\s+ON public\.inventory_items \(([^)]+)\)\s*WHERE category = 'phone'/,
    );

    expect(swapped).toEqual(original);
  });

  it('scopes the replacement index to phones only', () => {
    expect(stripComments(m35)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_sku_phone[\s\S]*WHERE category = 'phone'/,
    );
  });

  it('performs the constraint→index swap atomically inside one transaction', () => {
    const executable = stripComments(m35);
    const begin = executable.indexOf('BEGIN;');
    const commit = executable.indexOf('COMMIT;');
    const drop = executable.indexOf('DROP CONSTRAINT IF EXISTS inventory_items_unique_sku');
    const create = executable.indexOf('uq_inventory_items_sku_phone');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    expect(drop).toBeGreaterThan(begin);
    expect(drop).toBeLessThan(commit);
    expect(create).toBeGreaterThan(drop);
    expect(create).toBeLessThan(commit);
  });

  it('adds category-aware lookup indexes', () => {
    expect(m35).toContain(
      'CREATE INDEX IF NOT EXISTS idx_inventory_items_category_status',
    );
    expect(m35).toContain('(category, status)');
    expect(m35).toContain(
      'CREATE INDEX IF NOT EXISTS idx_inventory_items_category_published',
    );
    expect(m35).toContain('(category, is_published)');
  });

  it('documents a rollback that restores the original constraint verbatim', () => {
    expect(m35).toContain(
      'ADD CONSTRAINT inventory_items_unique_sku UNIQUE (model_id, variant, condition, color)',
    );
  });
});

// ── 00036 — car/property details ────────────────────────────────────────────

describe('Migration 00036 — car + property details', () => {
  it('creates both detail tables keyed by the listing id with CASCADE', () => {
    const executable = stripComments(m36);
    expect(executable).toContain('CREATE TABLE IF NOT EXISTS public.car_details');
    expect(executable).toContain('CREATE TABLE IF NOT EXISTS public.property_details');
    const cascades = executable.match(/ON DELETE CASCADE/g) ?? [];
    expect(cascades.length).toBe(2);
    expect(executable.match(/id\s+uuid PRIMARY KEY REFERENCES public\.inventory_items\(id\)/g)?.length)
      .toBe(2);
  });

  it('never uses variant for car/property identity', () => {
    // The word variant must not appear in any column definition or index.
    expect(stripComments(m36)).not.toMatch(/\bvariant\b/);
  });

  it('car vocabulary matches the TS domain unions exactly', () => {
    expect(checkValues(m36, 'fuel')).toEqual([
      'benzin', 'diesel', 'hybrid', 'electric', 'lpg',
    ]);
    expect(checkValues(m36, 'transmission')).toEqual(['manual', 'automatic']);
    expect(checkValues(m36, 'body_type')).toEqual([
      'sedan', 'suv', 'hatchback', 'pickup', 'coupe', 'van',
    ]);
    expect(checkValues(m36, 'condition_state', 1)).toEqual(['new', 'used', 'damaged']);
  });

  it('property vocabulary matches the TS domain unions exactly', () => {
    expect(checkValues(m36, 'property_type')).toEqual([
      'apartment', 'villa', 'house', 'land', 'shop', 'office',
    ]);
    expect(checkValues(m36, 'transaction_type')).toEqual(['sale', 'rent']);
    expect(checkValues(m36, 'condition_state', 2)).toEqual([
      'new', 'good', 'needs_renovation',
    ]);
  });

  it('SQL CHECK sets are coherent with the P8.1 filter schemas', () => {
    const schema = (c: 'car' | 'property') => LISTING_FILTER_SCHEMAS[c];

    for (const field of schema('car').fields) {
      if (field.kind !== 'select' || !field.options) continue;
      const column = { fuel: 'fuel', transmission: 'transmission', bodyType: 'body_type' }[
        field.key as 'fuel' | 'transmission' | 'bodyType'
      ];
      const sqlValues = checkValues(m36, column);
      for (const opt of field.options) {
        expect(sqlValues, `${column} must admit '${opt.value}'`).toContain(opt.value);
      }
    }

    for (const field of schema('property').fields) {
      if (field.kind !== 'select' || !field.options) continue;
      const column =
        field.key === 'propertyType' ? 'property_type' : 'transaction_type';
      const sqlValues = checkValues(m36, column);
      for (const opt of field.options) {
        expect(sqlValues, `${column} must admit '${opt.value}'`).toContain(opt.value);
      }
    }
  });

  it('enforces sane numeric bounds per the minimum-viable schema', () => {
    expect(m36).toContain('year BETWEEN 1900 AND 2100');
    expect(m36).toContain('mileage_km >= 0');
    expect(m36).toContain('engine_cc > 0');
    expect(m36).toContain('area_m2 > 0');
    expect(m36).toContain('bedrooms >= 0');
    expect(m36).toContain('bathrooms >= 0');
    expect(m36).toContain('floor BETWEEN -5 AND 200');
  });

  it('keeps parent security parity: RLS deny-all + full revoke', () => {
    const executable = stripComments(m36);
    expect(executable.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(2);
    expect(
      executable.match(/REVOKE ALL ON public\.(car_details|property_details) FROM anon, authenticated/g)
        ?.length,
    ).toBe(2);
    expect(executable).not.toContain('CREATE POLICY');
    expect(executable).not.toContain('GRANT SELECT');
  });

  it('reuses set_inventory_updated() from 00019 instead of duplicating trigger logic', () => {
    const executable = stripComments(m36);
    expect(executable.match(/EXECUTE FUNCTION public\.set_inventory_updated\(\)/g)?.length)
      .toBe(2);

    // Dependency really exists in the base migration.
    expect(stripComments(m19)).toContain(
      'CREATE OR REPLACE FUNCTION public.set_inventory_updated()',
    );

    // Preflight fails loudly when applied out of order.
    expect(executable).toContain(
      "'public.set_inventory_updated() missing — apply migration 00019 first'",
    );
    expect(executable).toContain(
      "'inventory_items.category missing — apply migration 00035 first'",
    );
  });

  it('touches neither realtime publication nor storage nor RPCs', () => {
    const executable = stripComments(m36);
    expect(executable).not.toContain('ALTER PUBLICATION');
    expect(executable).not.toContain('storage.');
    expect(executable).not.toContain('CREATE OR REPLACE FUNCTION');
  });
});

// ── Reconciliation script parity (post-00035) ───────────────────────────────

describe('05-constraint-data-reconciliation.sql — SKU check tracks the 00035 swap', () => {
  it('verifies the phone-scoped partial index, not the dropped constraint', () => {
    const executable = stripComments(reconcileSql);
    expect(executable).toContain('uq_sku_phone_scoped');
    expect(executable).toContain("'uq_inventory_items_sku_phone'");
    // Predicate + ordered column tuple pinned verbatim.
    expect(executable).toContain("'(category = ''phone'')'");
    expect(executable).toContain("= 'model_id,variant,condition,color'");
    // The old constraint name must not be referenced by executable SQL.
    expect(executable).not.toContain('inventory_items_unique_sku');
  });
});

// ── Runtime vocabularies ↔ SQL CHECK coherence (single source contract) ─────

function joinValues(values: string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

describe('Runtime vocabulary arrays mirror the 00036 CHECK sets exactly', () => {
  it('car arrays', () => {
    expect(joinValues([...CAR_FUEL_VALUES])).toBe(joinValues(checkValues(m36, 'fuel')));
    expect(joinValues([...CAR_TRANSMISSION_VALUES])).toBe(joinValues(checkValues(m36, 'transmission')));
    expect(joinValues([...CAR_BODY_TYPE_VALUES])).toBe(joinValues(checkValues(m36, 'body_type')));
    expect(joinValues([...CAR_CONDITION_STATES])).toBe(joinValues(checkValues(m36, 'condition_state', 1)));
  });

  it('property arrays', () => {
    expect(joinValues([...PROPERTY_TYPE_VALUES])).toBe(joinValues(checkValues(m36, 'property_type')));
    expect(joinValues([...PROPERTY_TRANSACTION_TYPES])).toBe(joinValues(checkValues(m36, 'transaction_type')));
    expect(joinValues([...PROPERTY_CONDITION_STATES])).toBe(joinValues(checkValues(m36, 'condition_state', 2)));
  });
});

// ── 00037 — public category-aware view ──────────────────────────────────────

describe('Migration 00037 — v_public_listings', () => {
  it('fails loudly when applied out of order (00019/00035/00036 deps)', () => {
    const executable = stripComments(m37);
    expect(executable).toContain("'car/property details missing — apply migration 00036 first'");
    expect(executable).toContain("'inventory_items.category missing — apply migration 00035 first'");
  });

  it('visibility gate is byte-identical to v_public_inventory (published + qty + active)', () => {
    for (const marker of [
      'is_published = TRUE',
      'quantity > 0',
      "status NOT IN ('archived','discontinued','deleted')",
    ]) {
      expect(stripComments(m19), `00019 gate: ${marker}`).toContain(marker);
      expect(stripComments(m37), `00037 gate: ${marker}`).toContain(marker);
    }
  });

  it('exposes money ONLY as sell_price aliased to price — never a second column', () => {
    expect(m37).toContain('ii.sell_price AS price');
    expect(m37).toContain('ii.price_period');
    const executable = stripComments(m37);
    expect(executable).not.toMatch(/price\s+NUMERIC|ADD COLUMN.*price/);
  });

  it('flattens detail tables under unambiguous prefixes (phone_ / car_ / property_)', () => {
    for (const alias of [
      'AS phone_variant',
      'AS phone_condition',
      'AS car_trim',
      'AS car_mileage_km',
      'AS car_condition_state',
      'AS property_district',
      'AS property_area_m2',
      'AS property_condition_state',
    ]) {
      expect(m37, alias).toContain(alias);
    }
    expect(m37).toContain('pd.property_type');
    expect(m37).toContain('pd.transaction_type');
  });

  it('aggregates ordered image paths without granting the images table', () => {
    const executable = stripComments(m37);
    expect(executable).toContain('FROM public.inventory_images im');
    expect(executable).toContain('ORDER BY im.position, im.created_at');
    expect(executable).not.toContain('GRANT SELECT ON public.inventory_images');
  });

  it('runs as owner with security_invoker=false and grants SELECT only', () => {
    expect(m37).toContain('ALTER VIEW public.v_public_listings SET (security_invoker = false)');
    expect(m37).toContain('GRANT SELECT ON public.v_public_listings TO anon, authenticated');
    expect(stripComments(m37)).not.toContain('GRANT INSERT');
    expect(stripComments(m37)).not.toContain('GRANT UPDATE');
  });

  it('is additive-only and never touches v_public_inventory or any table/RPC/policy', () => {
    const executable = stripComments(m37);
    expect(executable).not.toContain('v_public_inventory'); // sibling view untouched
    for (const forbidden of [
      'CREATE TABLE',
      'CREATE OR REPLACE FUNCTION',
      'CREATE POLICY',
      'DROP TABLE',
      'DROP VIEW',
      'ALTER TABLE',
      'ALTER PUBLICATION',
      'REVOKE ALL ON public.',
    ]) {
      expect(executable, `00037 must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

// ── 00038 — listing RPC family ──────────────────────────────────────────────

const M38_FUNCTIONS = [
  'listing_car_payload',
  'listing_property_payload',
  'listing_assert_publishable',
  'listing_create',
  'listing_update_core',
  'listing_update_details',
  'listing_search',
] as const;

function m38FunctionBody(name: string): string {
  const start = m38.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`${name} not found in 00038`);
  const end = m38.indexOf('$$;', start);
  return m38.slice(start, end);
}

describe('Migration 00038 — listing RPCs', () => {
  it('creates exactly the seven functions and nothing else', () => {
    const created = [...stripComments(m38).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)]
      .map((mm) => mm[1]);
    expect(created.sort()).toEqual([...M38_FUNCTIONS].sort());
  });

  it('mutations are SECURITY DEFINER; helpers are plain invoker functions', () => {
    for (const name of ['listing_create', 'listing_update_core', 'listing_update_details', 'listing_search']) {
      expect(m38FunctionBody(name), `${name} SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(m38FunctionBody(name), `${name} search_path`).toContain('SET search_path = public');
    }
    for (const name of ['listing_car_payload', 'listing_property_payload', 'listing_assert_publishable']) {
      expect(m38FunctionBody(name), `${name} must NOT be definer`).not.toContain('SECURITY DEFINER');
    }
  });

  it('every mutation gates on the SAME inventory_is_admin() as the legacy phone RPCs', () => {
    for (const name of ['listing_create', 'listing_update_core', 'listing_update_details']) {
      expect(m38FunctionBody(name), `${name} admin gate`).toContain(
        'IF NOT public.inventory_is_admin() THEN',
      );
    }
    // Search is PUBLIC — no admin gate inside it.
    expect(m38FunctionBody('listing_search')).not.toContain('inventory_is_admin');
  });

  it('rejects phones explicitly (legacy flow stays the single phone write path) and unknown categories', () => {
    const create = m38FunctionBody('listing_create');
    expect(create).toContain("p_category = 'phone'");
    expect(create).toContain("'phones must use the legacy inventory_add_item flow'");
    expect(create).toContain("p_category NOT IN ('car','property')");
  });

  it('pins quantity to exactly 1 for car/property', () => {
    const create = m38FunctionBody('listing_create');
    expect(create).toContain('p_quantity IS DISTINCT FROM 1');
    expect(create).toContain("'quantity must be exactly 1 for car/property listings'");
  });

  it('enforces the price_period pairing rules (car=sale, rent=monthly, sale-property=sale)', () => {
    const create = stripComments(m38);
    expect(create).toContain("'car listings pair with price_period=sale'");
    expect(create).toContain("'rental property pairs with price_period=monthly'");
    expect(create).toContain("'for-sale property pairs with price_period=sale'");
  });

  it('documents + implements the condition compatibility projection (authoritative value stays in details)', () => {
    const create = m38FunctionBody('listing_create');
    expect(create).toContain("WHEN 'new'     THEN 'New'");
    expect(create).toContain("WHEN 'damaged' THEN 'For Parts'");
    expect(create).toContain("WHEN 'needs_renovation' THEN 'Fair'");
    expect(create).toContain('-- compatibility projection (see header note)');
    // Both child inserts end with the AUTHORITATIVE state, never the projection.
    expect((create.match(/v_payload->>'condition_state'\);/g) ?? []).length).toBe(2);
  });

  it('publish-completeness gate covers price, city and per-category required fields', () => {
    const gate = m38FunctionBody('listing_assert_publishable');
    const raises = gate.match(/cannot publish incomplete listing/g) ?? [];
    expect(raises.length).toBe(8); // price, city, car×4, property×2
    expect(gate).toContain("btrim(COALESCE(p_city, '')) = ''");
    expect(gate).toContain("p_details->>'property_type' <> 'land'"); // land needs no bedrooms
    // Gate re-checked after core/details edits on LIVE listings.
    expect(m38FunctionBody('listing_update_core').match(/listing_assert_publishable/g)?.length)
      .toBeGreaterThanOrEqual(1);
    expect(m38FunctionBody('listing_update_details').match(/listing_assert_publishable/g)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it('search validates enums against the SAME sets as the DB CHECK constraints', () => {
    const search = m38FunctionBody('listing_search');
    expect(search).toContain(`NOT IN (${joinValues(checkValues(m36, 'fuel'))})`);
    expect(search).toContain(`NOT IN (${joinValues(checkValues(m36, 'transmission'))})`);
    expect(search).toContain(`NOT IN (${joinValues(checkValues(m36, 'body_type'))})`);
    expect(search).toContain(`NOT IN (${joinValues(checkValues(m36, 'property_type'))})`);
    expect(search).toContain(`NOT IN (${joinValues(checkValues(m36, 'transaction_type'))})`);
  });

  it('search whitelists filters/sorts, clamps pagination, reads ONLY the public view', () => {
    const search = m38FunctionBody('listing_search');
    expect(search).toContain("p_sort NOT IN ('latest','cheapest','expensive')");
    expect(search).toContain("ARRAY['fuel','transmission','bodyType','yearMin','yearMax','mileageKmMax']");
    expect(search).toContain(
      "ARRAY['propertyType','transactionType','bedroomsMin','bathroomsMin','areaM2Min','areaM2Max','furnished']",
    );
    expect(search).toContain("'phone search takes no filters'"); // P8.1 empty schema enforced
    expect(search).toContain('LEAST(GREATEST(coalesce(p_limit, 24), 1), 100)');
    expect(search).toContain('GREATEST(coalesce(p_offset, 0), 0)');
    expect(search).toContain('FROM public.v_public_listings v');
    expect(search).not.toMatch(/FROM public\.(inventory_items|car_details|property_details)\b/);
  });

  it('grants follow the house model: mutations → authenticated, search → anon+authenticated', () => {
    const executable = stripComments(m38);
    expect(executable.match(/REVOKE ALL ON FUNCTION/g)?.length).toBe(M38_FUNCTIONS.length);
    expect(executable.match(/GRANT EXECUTE ON FUNCTION public\.listing_create\([^)]*\) TO authenticated/g)?.length)
      .toBe(1);
    expect(executable.match(/GRANT EXECUTE ON FUNCTION public\.listing_update_core\([^)]*\) TO authenticated/g)?.length)
      .toBe(1);
    expect(executable.match(/GRANT EXECUTE ON FUNCTION public\.listing_update_details\(uuid, jsonb\) TO authenticated/g)?.length)
      .toBe(1);
    expect(executable).toContain(
      'GRANT EXECUTE ON FUNCTION public.listing_search(text, text, jsonb, text, integer, integer) TO anon, authenticated',
    );
  });

  it('never redefines/drops any legacy inventory_* function (backward compat is structural)', () => {
    const executable = stripComments(m38);
    expect(executable).not.toContain('CREATE OR REPLACE FUNCTION public.inventory_');
    expect(executable).not.toContain('DROP FUNCTION IF EXISTS public.inventory_');
    for (const forbidden of ['DROP TABLE', 'DROP POLICY', 'DROP TRIGGER', 'DROP VIEW', 'ALTER TABLE', 'ALTER PUBLICATION']) {
      expect(executable, `00038 must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('details upsert keeps merge semantics and rejects cross-category payloads via key whitelists', () => {
    const upd = m38FunctionBody('listing_update_details');
    expect(upd).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(upd).toContain("COALESCE(v_current, '{}'::jsonb) || p_details");
    const carPayload = m38FunctionBody('listing_car_payload');
    const propPayload = m38FunctionBody('listing_property_payload');
    expect(carPayload).toContain('unknown car key "%"');
    expect(propPayload).toContain('unknown property key "%"');
    // An all-defaults car payload is rejected — details must be meaningful.
    expect(carPayload).toContain("'listing details: car payload is empty'");
    // Car whitelist admits no property keys and vice-versa.
    expect(carPayload).not.toContain('propertyType');
    expect(propPayload).not.toContain('mileageKm');
  });
});

// ── 00039 — listing admin surface (my_listings + soft delete) ───────────────

function m39FunctionBody(fnName: string): string {
  const start = m39.indexOf(`FUNCTION public.${fnName}(`);
  if (start < 0) throw new Error(`${fnName} not found in migration 00039`);
  const bodyStart = m39.indexOf('AS $$', start) + 5;
  const bodyEnd = m39.indexOf('$$;', bodyStart);
  return m39.slice(bodyStart, bodyEnd);
}

describe('Migration 00039 — listing admin surface', () => {
  it('is PURELY additive: defines only the two new functions', () => {
    const executable = stripComments(m39);
    const created = [...executable.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(['listing_delete', 'listing_my_listings']);
    // 00038 stays historical: nothing from it is redefined here.
    for (const frozen of ['listing_create', 'listing_update_core', 'listing_update_details', 'listing_search']) {
      expect(executable).not.toContain(`CREATE OR REPLACE FUNCTION public.${frozen}(`);
    }
    expect(executable).not.toContain('DROP FUNCTION IF EXISTS public.listing_create');
  });

  it('preflight fails loudly unless 00038 is applied first', () => {
    expect(m39).toContain("proname = 'listing_create'");
    expect(m39).toContain('apply migration 00038 first');
  });

  it('both functions are SECURITY DEFINER behind the SAME inventory_is_admin gate', () => {
    for (const fn of ['listing_my_listings', 'listing_delete']) {
      const body = m39FunctionBody(fn);
      expect(body).toContain('inventory_is_admin()');
      expect(body).toContain("'admin role required' USING ERRCODE = '42501'");
    }
    const myDef = m39.slice(m39.indexOf('FUNCTION public.listing_my_listings('), m39.indexOf('AS $$', m39.indexOf('FUNCTION public.listing_my_listings(')));
    const delDef = m39.slice(m39.indexOf('FUNCTION public.listing_delete('), m39.indexOf('AS $$', m39.indexOf('FUNCTION public.listing_delete(')));
    expect(myDef).toContain('SECURITY DEFINER');
    expect(delDef).toContain('SECURITY DEFINER');
  });

  it('phones are rejected: inventory_management_list stays their single admin read path', () => {
    const body = m39FunctionBody('listing_my_listings');
    expect(body).toContain("p_category = 'phone'");
    expect(body).toContain('phones are managed through inventory_management_list');
    const del = m39FunctionBody('listing_delete');
    expect(del).toContain("r.category NOT IN ('car','property')");
  });

  it('my_listings exposes drafts/unpublished via an explicit is_published flag', () => {
    const body = m39FunctionBody('listing_my_listings');
    // The whole point: no is_published predicate may filter the admin read.
    expect(body).toContain('i.is_published');
    expect(body).toMatch(/WHERE i\.category = p_category\s+AND i\.status <> 'deleted'/);
    expect(body).not.toMatch(/is_published = TRUE/);
    // Least-data projection: no cost side, no audit columns.
    expect(body).not.toContain('buy_price');
    expect(body).not.toContain('total_purchased');
    expect(body).not.toContain('created_by');
  });

  it('delete is SOFT ONLY: status := deleted, no DELETE FROM anywhere in the file', () => {
    const body = m39FunctionBody('listing_delete');
    expect(body).toContain("status     = 'deleted'");
    const executable = stripComments(m39);
    expect(executable).not.toMatch(/\bDELETE FROM\b/);
  });

  it('grants follow the house model (admin-only; never anonymous)', () => {
    const executable = stripComments(m39);
    expect(executable).toContain('REVOKE ALL ON FUNCTION public.listing_my_listings(text) FROM PUBLIC, anon, authenticated');
    expect(executable).toContain('GRANT EXECUTE ON FUNCTION public.listing_my_listings(text) TO authenticated');
    expect(executable).toContain('REVOKE ALL ON FUNCTION public.listing_delete(uuid) FROM PUBLIC');
    expect(executable).toContain('GRANT EXECUTE ON FUNCTION public.listing_delete(uuid) TO authenticated');
    expect(executable).not.toContain('TO anon');
  });

  it('image aggregation mirrors the 00037 recipe exactly (path ordered by position)', () => {
    const body = m39FunctionBody('listing_my_listings');
    expect(body).toContain('array_agg(im.path ORDER BY im.position, im.created_at)');
    expect(body).toContain('ARRAY[]::text[]');
  });
});
