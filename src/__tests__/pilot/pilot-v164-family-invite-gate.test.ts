/**
 * GATE V1.6.4 — family invite kind gate (offline, structural).
 * Pins 00110: member_kind CHECK admits operator/courier/family, plus the
 * family-lane reserve RPC (mirrored lifecycle rules, kind fixed). Old rows
 * untouched (no data migration); staff RPCs byte-untouched (asserted by
 * absence of their names).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M110 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00110_family_invite_kind.sql'),
  'utf-8',
);

// Executable SQL only — the documentation header names neighboring systems.
const CODE = M110.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('00110 — family invite kind (additive)', () => {
  it('widens the member_kind CHECK to operator/courier/family', () => {
    expect(CODE).toContain('DROP CONSTRAINT IF EXISTS pilot_invitations_member_kind_check');
    expect(CODE).toContain("CHECK (member_kind IN ('operator', 'courier', 'family'))");
  });

  it('moves no existing rows and creates no tables/policies/triggers', () => {
    expect(CODE).not.toMatch(/CREATE TABLE|CREATE POLICY|CREATE TRIGGER|CREATE INDEX/);
    expect(CODE).not.toMatch(/DELETE FROM/);
  });

  it('defines exactly one function: the family-lane reserve RPC', () => {
    expect(CODE.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(1);
    expect(CODE).toContain('CREATE OR REPLACE FUNCTION public.pilot_invitation_reserve_family(');
  });

  it('the reserve RPC is kind-fixed with mirrored lifecycle rules', () => {
    expect(CODE).toContain("AND member_kind = 'family'");
    expect(CODE).toContain("'MAX_SENDS_REACHED'");
    expect(CODE).toContain("'INVITATION_COMPLETED'");
    expect(CODE).toContain("'COOLDOWN_ACTIVE'");
    expect(CODE).toContain('SECURITY DEFINER');
    expect(CODE).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) TO service_role',
    );
  });

  it('touches no staff RPC, money, RBAC, or governance surface', () => {
    for (const name of [
      'pilot_invitation_reserve(',
      'pilot_invitation_reserve_by_email',
      'pilot_invitee_classify',
      'pilot_provision_new_membership',
      'ledger',
      'PURCHASE',
    ]) {
      expect(CODE).not.toContain(name);
    }
  });
});
