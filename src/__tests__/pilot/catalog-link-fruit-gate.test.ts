import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const mig = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations', name), 'utf-8');

describe('00115 — additive per-row store link (no delete-first)', () => {
  const sql = mig('00115_admin_store_link.sql');
  const code = (sql.split('Post-checks')[0] ?? '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  it('creates pilot_admin_link_store_inventory with admin gate', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.pilot_admin_link_store_inventory(');
    expect(sql).toContain('fn_admin_uid()');
    expect(sql).toContain('PERMISSION_DENIED');
  });
  it('never deletes store links', () => {
    expect(code).not.toMatch(/DELETE FROM public\.store_inventory/);
    expect(code).toContain('ON CONFLICT (store_id, inventory_id) DO NOTHING');
  });
  it('grants authenticated only, revokes anon/PUBLIC', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.pilot_admin_link_store_inventory(uuid, uuid[]) TO authenticated');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_admin_link_store_inventory(uuid, uuid[]) FROM anon');
  });
});

describe('00116 — fruit category widen preserves legacy values', () => {
  const sql = mig('00116_fruit_category.sql');
  it('admits fruit while keeping phone/car/property/produce', () => {
    for (const v of ['phone', 'car', 'property', 'produce', 'fruit']) {
      expect(sql).toContain(`'${v}'`);
    }
  });
  it('performs no data writes', () => {
    expect(sql).not.toMatch(/^\s*INSERT INTO/m);
    expect(sql).not.toMatch(/^\s*UPDATE /m);
    expect(sql).not.toMatch(/^\s*DELETE FROM/m);
  });
});
