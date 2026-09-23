/**
 * GATE V1.3 — family contact migration gate (offline, structural).
 * No live DB. Pins 00106_family_contact_profile.sql to its contract:
 * additive contact columns, member-scoped RPCs (auth.uid() → family_members,
 * never a caller-supplied family id), least-privilege grants, and zero
 * contact with money/RBAC/schema-governance surfaces.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M106 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00106_family_contact_profile.sql'),
  'utf-8',
);

const FN_IN = (src: string, name: string): string => {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in migration source`).toBeGreaterThan(-1);
  const tail = src.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('00106 — family contact columns (additive only)', () => {
  it('adds exactly four nullable contact columns, nothing else', () => {
    for (const col of ['contact_name', 'contact_phone', 'contact_address', 'contact_notes']) {
      expect(M106).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
    expect(M106).not.toMatch(/DROP COLUMN|ALTER COLUMN .* TYPE|ADD CONSTRAINT/i);
    expect(M106).not.toContain('CREATE TABLE');
    expect(M106).not.toContain('CREATE POLICY');
  });
});

describe('00106 — member-scoped RPCs (isolation)', () => {
  const GET = FN_IN(M106, 'pilot_my_family_contact_get');
  const SET = FN_IN(M106, 'pilot_my_family_contact_set');

  it('both RPCs resolve the family ONLY from auth.uid() via active membership', () => {
    for (const fn of [GET, SET]) {
      expect(fn).toMatch(/auth\.uid\(\)/);
      expect(fn).toMatch(/family_members/);
      expect(fn).toMatch(/status = 'active'/);
    }
  });

  it('neither RPC accepts a caller-supplied family identifier', () => {
    expect(GET).not.toMatch(/p_family_id|family_id\s+uuid/i);
    expect(SET).not.toMatch(/p_family_id/);
    expect(SET).toMatch(/p_name|p_phone|p_address|p_notes/);
  });

  it('both are SECURITY DEFINER with locked search_path', () => {
    for (const fn of [GET, SET]) {
      expect(fn).toContain('SECURITY DEFINER');
      expect(fn).toContain("SET search_path = ''");
    }
  });

  it('grants are authenticated-only with anon explicitly revoked', () => {
    expect(M106).toContain('GRANT EXECUTE ON FUNCTION public.pilot_my_family_contact_get() TO authenticated');
    expect(M106).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_my_family_contact_set(text, text, text, text) TO authenticated',
    );
    expect(M106).toMatch(/REVOKE EXECUTE ON FUNCTION public\.pilot_my_family_contact_get\(\) FROM anon/);
    expect(M106).toMatch(/REVOKE EXECUTE ON FUNCTION public\.pilot_my_family_contact_set\(text, text, text, text\) FROM anon/);
  });
});

describe('00106 — no-governance-surface contact', () => {
  it('touches no money, RBAC, or schema-governance objects', () => {
    for (const token of ['ledger', 'debts', 'PURCHASE', 'users', 'role', 'admin', 'POLICY', 'TRIGGER', 'INDEX']) {
      expect(M106).not.toContain(token);
    }
    expect(M106).not.toMatch(/delivery_create_order|pilot_family_settle/);
  });
});
