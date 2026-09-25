/**
 * GATE V1.5 — produce seed gate (offline, structural).
 * Pins 00109_pilot_produce_seed.sql: exactly the 8 approved items, pilot
 * scoping, idempotent guards, store links — and no schema/governance contact.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M109 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00109_pilot_produce_seed.sql'),
  'utf-8',
);

const EXPECTED = [
  'pilot:veg-tomato',
  'pilot:veg-potato',
  'pilot:veg-onion',
  'pilot:veg-carrot',
  'pilot:veg-cucumber',
  'pilot:veg-pepper',
  'pilot:veg-zucchini',
  'pilot:veg-eggplant',
];

describe('00109 — eight scoped produce items, nothing else', () => {
  it('seeds exactly the approved source_keys', () => {
    for (const sk of EXPECTED) expect(M109).toContain(`'${sk}'`);
    const others = M109.match(/'pilot:[a-z0-9-]+'/g) ?? [];
    expect(new Set(others)).toEqual(new Set(EXPECTED.map((s) => `'${s}'`)));
  });

  it('uses produce/kg/published/in_stock legal values', () => {
    expect(M109).toContain("'produce'");
    expect(M109).toContain("'kg'");
    expect(M109).toContain("'in_stock'");
    expect(M109).toMatch(/is_published,\s*source_key/);
  });

  it('is idempotent and store-scoped', () => {
    expect(M109).toContain('NOT IN (SELECT COALESCE(source_key');
    expect(M109).toContain('ON CONFLICT (model_id, variant, condition, color) DO NOTHING');
    expect(M109).toContain("s.slug = 'pilot-store-1'");
    expect(M109).toContain('ON CONFLICT (store_id, inventory_id) DO NOTHING');
  });

  it('touches no schema, RLS, RPC, ledger, or pricing surfaces', () => {
    // Documentation header names neighboring systems; the pin applies to
    // executable SQL only.
    const CODE = M109.split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    for (const token of [
      'CREATE TABLE', 'ALTER TABLE', 'ADD COLUMN', 'CREATE POLICY', 'CREATE OR REPLACE FUNCTION',
      'CREATE TRIGGER', 'CREATE INDEX', 'ledger', 'PURCHASE', 'users', 'role', 'GRANT',
    ]) {
      expect(CODE).not.toContain(token);
    }
  });
});
