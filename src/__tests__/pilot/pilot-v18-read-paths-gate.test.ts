/**
 * GATE V1.8 — family read-paths gate (offline, structural).
 * Pins 00111: two read-only SECURITY DEFINER RPCs with explicit
 * authorization, correct grants, and zero mutation/RLS/governance contact.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M111 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00111_family_read_paths.sql'),
  'utf-8',
);

const FN_IN = (src: string, name: string): string => {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const tail = src.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nREVOKE ALL ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('00111 — pilot_family_order_items (owner-or-admin read)', () => {
  const FN = FN_IN(M111, 'pilot_family_order_items');

  it('is read-only, definer, locked search_path', () => {
    expect(FN).toContain('SECURITY DEFINER');
    expect(FN).toContain("SET search_path = ''");
    expect(FN).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/);
  });

  it('scopes to the owning active membership, admins bypass explicitly', () => {
    expect(FN).toMatch(/family_members/);
    expect(FN).toMatch(/status = 'active'/);
    expect(FN).toContain('PERMISSION_DENIED');
    expect(FN).toContain('fn_admin_uid()');
  });

  it('rejects cancelled orders and unknown ids with codes', () => {
    expect(FN).toContain('ORDER_CANCELLED');
    expect(FN).toContain('ORDER_NOT_FOUND');
  });

  it('returns display fields only, grants authenticated-only', () => {
    for (const f of ['catalog_ref', 'quantity', 'unit', 'unit_price']) expect(FN).toContain(f);
    expect(M111).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_family_order_items(uuid) TO authenticated',
    );
    expect(M111).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.pilot_family_order_items\(uuid\) FROM anon/,
    );
  });
});

describe('00111 — pilot_admin_family_ledger (admin read-only)', () => {
  const FN = FN_IN(M111, 'pilot_admin_family_ledger');

  it('is admin-gated, read-only, bounded', () => {
    expect(FN).toContain('SECURITY DEFINER');
    expect(FN).toContain('fn_admin_uid()');
    expect(FN).toContain('PERMISSION_DENIED');
    expect(FN).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/);
    expect(FN).toContain('LEAST(');
  });

  it('returns ledger display fields with order numbers', () => {
    for (const f of ['transaction_type', 'amount', 'related_order_id', 'order_number', 'balance_after']) {
      expect(FN).toContain(f);
    }
    expect(M111).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) TO authenticated',
    );
  });
});

describe('00111 — no-governance contact', () => {
  it('defines exactly two functions and touches no other surface', () => {
    expect(M111.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(2);
    const CODE = M111.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    for (const token of ['CREATE TABLE', 'ALTER TABLE', 'CREATE POLICY', 'CREATE TRIGGER', 'CREATE INDEX']) {
      expect(CODE).not.toContain(token);
    }
    expect(CODE).not.toMatch(/delivery_create_order|ROLE_PERMISSIONS|CREATE ROLE/);
  });
});
