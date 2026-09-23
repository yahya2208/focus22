/**
 * GATE V1.4 — admin advance migration gate (offline, structural).
 * No live DB. Pins 00107_admin_order_advance.sql: explicit transition
 * whitelist, admin-only gating, history writes, least-privilege grants,
 * and zero contact with courier/pricing/inventory/ledger/RBAC surfaces.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M107 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00107_admin_order_advance.sql'),
  'utf-8',
);

const FN_IN = (src: string, name: string): string => {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in migration source`).toBeGreaterThan(-1);
  const tail = src.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('00107 — explicit transition whitelist', () => {
  const FN = FN_IN(M107, 'pilot_admin_advance_order');

  it('allows exactly the approved pairs', () => {
    expect(FN).toContain("v_cur = 'pending'   AND p_to_status IN ('confirmed', 'cancelled')");
    expect(FN).toContain("v_cur = 'confirmed' AND p_to_status IN ('preparing', 'cancelled')");
    expect(FN).toContain("v_cur = 'preparing' AND p_to_status = 'delivered'");
  });

  it('rejects everything else, including terminal exits and courier states', () => {
    expect(FN).toContain('TRANSITION_NOT_ALLOWED');
    expect(FN).not.toContain('out_for_delivery');
    // No enum change: only pre-existing statuses are nameable.
    expect(FN).not.toMatch(/'ready'/);
  });

  it('validates arguments and existence with coded errors', () => {
    expect(FN).toContain('ARGUMENTS_INVALID');
    expect(FN).toContain('ORDER_NOT_FOUND');
  });
});

describe('00107 — admin-only, no courier binding', () => {
  const FN = FN_IN(M107, 'pilot_admin_advance_order');

  it('is SECURITY DEFINER gated on fn_admin_uid', () => {
    expect(FN).toContain('SECURITY DEFINER');
    expect(FN).toContain("SET search_path = ''");
    expect(FN).toContain('fn_admin_uid()');
    expect(FN).toContain('PERMISSION_DENIED');
  });

  it('never reads or writes courier assignment', () => {
    expect(FN).not.toMatch(/courier_user_id|courier_assigned_at/i);
  });

  it('writes the existing status-history table with admin actor', () => {
    expect(FN).toContain('order_status_history');
    expect(FN).toContain("'admin'");
  });

  it('grants authenticated-only with anon explicitly revoked', () => {
    expect(M107).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_admin_advance_order(uuid, text) TO authenticated',
    );
    expect(M107).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.pilot_admin_advance_order\(uuid, text\) FROM anon/,
    );
  });
});

describe('00107 — no-governance-surface contact', () => {
  // Documentation comments may name neighboring systems; the pin applies to
  // executable SQL only.
  const CODE = M107.split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('touches no money, inventory, RBAC, or schema-governance objects', () => {
    // NOTE: 'actor_role' (history column write) is legitimate and asserted above.
    for (const token of ['ledger', 'PURCHASE', 'price', 'inventory_items', 'POLICY', 'TRIGGER', 'INDEX', 'CHECK (']) {
      expect(CODE).not.toContain(token);
    }
    expect(CODE).not.toMatch(/delivery_create_order|settle|deposit|public\.users/);
  });
});
