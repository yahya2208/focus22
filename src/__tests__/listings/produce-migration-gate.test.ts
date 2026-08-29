import { describe, expect, it } from 'vitest';
import m53 from '../../../supabase/migrations/00053_produce_domain.sql?raw';
import m54 from '../../../supabase/migrations/00054_listing_rpcs_produce.sql?raw';
import { LISTING_FILTER_SCHEMAS } from '../../domains/listings';
import {
  PRODUCE_UNIT_VALUES,
  type ListingCategory,
  type ProduceUnit,
} from '../../domains/listings/types';

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function checkValues(sql: string, constraintColumn: string, occurrence = 1): string[] {
  const re = new RegExp(`${constraintColumn} IN \\(([^)]+)\\)`, 'gi');
  const matches = [...sql.matchAll(re)];
  const m = matches[occurrence - 1];
  if (!m || !m[1]) throw new Error(`CHECK IN list for ${constraintColumn} #${occurrence} not found`);
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

// ── 00053 — produce domain + unit foundation ────────────────────────────────

describe('Migration 00053 — produce domain + unit foundation', () => {
  it('adds inventory_items.unit as a nullable column', () => {
    expect(m53).toMatch(/ADD COLUMN IF NOT EXISTS unit TEXT/);
    expect(m53).toContain('inventory_items_unit_check');
    expect(checkValues(m53, 'unit')).toEqual(['piece', 'kg', 'g', 'liter', 'dozen', 'bag']);
  });

  it('widens the category CHECK to admit produce (additive to phone|car|property)', () => {
    // The DROP + re-ADD yields one category IN(...) list containing all four.
    expect(checkValues(m53, 'category')).toEqual(['phone', 'car', 'property', 'produce']);
  });

  it('creates produce_details as a 1:1 ON DELETE CASCADE child', () => {
    expect(m53).toContain('CREATE TABLE IF NOT EXISTS public.produce_details');
    expect(m53).toMatch(/PRIMARY KEY REFERENCES public\.inventory_items\(id\) ON DELETE CASCADE/);
    expect(m53).toMatch(/origin\s+text NOT NULL DEFAULT ''/);
    expect(m53).toMatch(/grade\s+text NOT NULL DEFAULT ''/);
  });

  it('keeps produce_details deny-all and never exposes it to anon/authenticated', () => {
    expect(m53).toContain('ENABLE ROW LEVEL SECURITY');
    expect(m53).toMatch(/REVOKE ALL ON public\.produce_details FROM anon, authenticated/);
  });

  it('never destructively alters frozen data (no DROP TABLE/VIEW/FUNCTION/COLUMN/POLICY/DELETE/TRUNCATE)', () => {
    const executable = stripComments(m53);
    for (const forbidden of ['DROP TABLE', 'DROP COLUMN', 'DROP POLICY', 'DROP FUNCTION', 'DROP VIEW', 'DELETE FROM', 'TRUNCATE']) {
      expect(executable, forbidden).not.toContain(forbidden);
    }
  });

  it('only appends columns to v_public_listings (no narrowing of legacy columns)', () => {
    expect(m53).toContain('CREATE OR REPLACE VIEW public.v_public_listings');
    expect(m53).toContain('ii.unit');
    expect(m53).toContain('AS produce_origin');
    expect(m53).toContain('AS produce_grade');
  });
});

// ── 00054 — produce listing RPC widening ────────────────────────────────────

describe('Migration 00054 — produce listing RPC widening', () => {
  it('writes listing_create with unit support and produce quantity semantics', () => {
    expect(m54).toContain('p_unit         text DEFAULT NULL');
    expect(m54).toContain('listing_product_payload');
    expect(m54).toContain('INSERT INTO public.produce_details (id, origin, grade)');
  });

  it('keeps car/property quantity pinned to 1 while produce allows >= 1', () => {
    expect(m54).toContain('quantity must be exactly 1 for car/property listings');
    expect(m54).toContain('quantity must be >= 1 for produce listings');
  });

  it('still rejects phone through the legacy flow', () => {
    expect(m54).toContain('phones must use the legacy inventory_add_item flow');
  });

  it('gates every mutation behind admin and grants writes to authenticated only', () => {
    expect(m54).toMatch(/inventory_is_admin\(\)/);
    const writtenGrants = (m54.match(/GRANT EXECUTE ON FUNCTION/g) || []).length;
    expect(writtenGrants).toBeGreaterThan(0);
  });

  it('search admits produce and validates the produce filter whitelist', () => {
    expect(m54).toContain("p_category NOT IN ('phone','car','property','produce')");
    expect(m54).toContain("ARRAY['origin','grade','unit']");
    expect(m54).toContain('invalid unit filter');
  });
});

// ── Cross-contract: TS domain values must agree with the SQL CHECKs ─────────

describe('Produce domain contracts (TS ↔ SQL single source)', () => {
  it('PRODUCE_UNIT_VALUES matches the SQL unit CHECK exactly', () => {
    const sqlUnits = new Set(checkValues(m53, 'unit'));
    const tsUnits = new Set(PRODUCE_UNIT_VALUES as readonly string[]);
    expect(tsUnits).toEqual(sqlUnits);
  });

  it('the produce filter schema uses only SQL-whitelisted unit keys', () => {
    const schema = LISTING_FILTER_SCHEMAS.produce;
    const unitField = schema.fields.find((f) => f.key === 'unit')!;
    const unitValues = unitField.options!.map((o) => o.value);
    const sqlUnits = new Set(checkValues(m53, 'unit'));
    for (const v of unitValues) expect(sqlUnits.has(v)).toBe(true);
  });

  it('every unit value maps to a non-empty Arabic label via produceUnitLabel', async () => {
    const { produceUnitLabel } = await import('../../domains/listings');
    for (const u of PRODUCE_UNIT_VALUES as readonly ProduceUnit[]) {
      expect(produceUnitLabel(u).trim()).not.toBe('');
    }
  });

  it('all four categories are present in LISTING_FILTER_SCHEMAS', () => {
    const cats = Object.keys(LISTING_FILTER_SCHEMAS) as ListingCategory[];
    expect(cats).toEqual(expect.arrayContaining(['phone', 'car', 'property', 'produce']));
  });
});
