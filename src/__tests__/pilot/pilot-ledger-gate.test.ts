/**
 * GATE A — ledger migration gate tests (offline, structural).
 *
 * No live DB. These assert that 00100–00103 codify the FINAL GATE A contract:
 *   • Balance source of truth is SUM(ledger.amount) and nothing else.
 *   • debts is monitoring of the uncovered remainder of a PURCHASE — never a
 *     ledger account, never a second financial movement, never added to SUM.
 *   • p_intentional is an INTENT MARKER ONLY (no privilege, bypasses nothing).
 *   • All server-authoritative validation stays in place (auth.uid(), family
 *     resolution, pilot-store gate, catalog resolution, retry window).
 *   • No RBAC, no new roles, no online payment, no buy/sell-price touch.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M100 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00100_family_ledger_foundation.sql'), 'utf-8');
const M101 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00101_produce_decimal_actuals.sql'), 'utf-8');
const M102 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00102_family_order_settlement.sql'), 'utf-8');
const M103 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00103_financial_idempotency_guards.sql'), 'utf-8');

const GATE_A = [M100, M101, M102, M103];

const FN_IN = (src: string, name: string): string => {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in migration source`).toBeGreaterThan(-1);
  const tail = src.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\.|\nDO \$\$/);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('GATE A — balance model (Correction 1: SUM-only, debt is tracking)', () => {
  it('never computes balance = SUM(ledger) + debt in executable code', () => {
    // Strip `--` comment lines first (comments legitimately DISCUSS the rule).
    const codeOnly = (m: string) => m.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const m of [M100, M101, M102]) {
      const code = codeOnly(m);
      expect(code).not.toMatch(/COALESCE\(\s*SUM\(l\.amount\)\s*,\s*0\s*\)\s*[+]|SUM\(l\.amount\)\s*[+]|SUM\(ledger\)\s*[+]/i);
    }
    // 00103 only FORBIDS the equation: its executable body is a sentinel guard
    // (RAISE on the forbidden literal), never an actual sum computation.
    expect(M103).toMatch(/COALESCE\(SUM\(l\.amount\), 0\) \+ COALESCE\(d\.remaining/);
    expect(M103).not.toMatch(/:=.*COALESCE\(SUM\(l\.amount\).*\+.*remaining/);
  });

  it('00100 ledger sign rule enforces the single full-value movement', () => {
    expect(M100).toMatch(/PURCHASE' AND amount < 0/);
    expect(M100).toContain('CASH_DEPOSIT');
    const account = FN_IN(M100, 'pilot_my_account');
    // The ONLY balance computation: SUM(amount) — no debt arithmetic.
    expect(account).toContain('COALESCE(SUM(l.amount), 0) INTO v_balance');
    expect(account).toContain("'balance', v_balance");
  });

  it('00100 debts is a monitoring record with an explicit covered+remaining invariant', () => {
    expect(M100).toContain('CREATE TABLE IF NOT EXISTS public.debts');
    expect(M100).toContain('UNIQUE (family_id, order_id)');
    expect(M100).toMatch(/CHECK \(covered \+ remaining = original_total\)/);
    expect(M100).toContain('MONITORING record of the uncovered remainder');
  });

  it('00100 expose the financial tables to NO client write path (least privilege)', () => {
    expect(M100).toContain('REVOKE ALL ON public.ledger FROM authenticated;');
    expect(M100).toContain('REVOKE ALL ON public.debts FROM authenticated;');
    expect(M100).toContain('REVOKE INSERT, UPDATE, DELETE ON public.family_members FROM authenticated;');
    expect(M100).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\.(ledger|debts)/);
  });

  it('00100 family model backstops OQ1=B/OQ2=B (one principal, one family per user)', () => {
    expect(M100).toContain('user_id    uuid NOT NULL UNIQUE REFERENCES public.users(id)');
    expect(M100).toContain('idx_family_members_one_active_principal');
    expect(M100).toMatch(/role\s+text NOT NULL DEFAULT 'principal'[\s\S]*?CHECK \(role IN \('principal'\)\)/);
  });

  it('00102 posts exactly ONE financial movement per settlement (the full PURCHASE)', () => {
    const ledgerInserts = (M102.match(/INSERT INTO public\.ledger/g) ?? []).length;
    expect(ledgerInserts).toBe(1);
    expect(M102).toContain("'PURCHASE', -v_final_total");
  });

  it('00102 debt is DERIVED and tracked, never a second movement', () => {
    const settle = FN_IN(M102, 'pilot_family_settle_and_deliver');
    expect(settle).toContain('INSERT INTO public.debts');
    expect(settle).toContain('v_remaining := GREATEST(v_final_total - GREATEST(v_prior, 0), 0)');
    // The ledger PURCHASE row writes NO debt columns — the movement is full and
    // complete; debts are derived separately.
    const ledgerInsertCols = settle.match(/INSERT INTO public\.ledger\s*\(([\s\S]*?)\)\s*VALUES/)?.[1] ?? '';
    expect(ledgerInsertCols).not.toMatch(/remaining|covered|debt/i);
  });
});

describe('GATE A — p_intentional intent marker (Correction 2: no security boundary)', () => {
  it('00102 delivery_create_order has a DEFAULT-false third parameter (legacy call sites intact)', () => {
    expect(M102).toMatch(/CREATE OR REPLACE FUNCTION public\.delivery_create_order\(\s*p_customer\s+jsonb,\s*p_items\s+jsonb,\s*p_intentional\s+boolean\s+DEFAULT false\s*\)/s);
  });

  it('server gates run BEFORE any intent-driven branch (family + catalog + zone + dup)', () => {
    const block = M102.split('CREATE OR REPLACE FUNCTION public.delivery_create_order')[1] ?? M102;
    const gate = block.indexOf("RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED'");
    const intentUse = block.indexOf('COALESCE(p_intentional, FALSE)');
    expect(gate).toBeGreaterThan(-1);
    expect(intentUse).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(intentUse);
  });

  it('p_intentional grants nothing: no GRANT, no bypass of auth/ownership/catalog rules', () => {
    for (const m of [M102, M103]) {
      expect(m).not.toMatch(/GRANT[^;]*p_intentional/);
    }
    const orderFn = M102.split('CREATE OR REPLACE FUNCTION public.delivery_create_order')[1] ?? M102;
    for (const required of ['UNAUTHENTICATED', 'CUSTOMER_INFO_REQUIRED', 'ZONE_NOT_ACTIVE', 'ITEMS_REQUIRED', 'v_public_listings', 'DUPLICATE_ORDER']) {
      expect(orderFn, required).toContain(required);
    }
  });

  it('the retry window only fires on identical basket fingerprints, not on intent', () => {
    const orderFn = M102.split('CREATE OR REPLACE FUNCTION public.delivery_create_order')[1] ?? M102;
    expect(orderFn).toContain("created_at >= now() - interval '60 seconds'");
    expect(orderFn).toContain('o.subtotal = v_subtotal');
    expect(orderFn).toContain('NOT COALESCE(p_intentional, FALSE)');
  });
});

describe('GATE A — order.family_id is SERVER-write-only (D2/D3)', () => {
  it('adds family_id additively and indexes it', () => {
    expect(M102).toContain('ADD COLUMN IF NOT EXISTS family_id');
    expect(M102).toContain('idx_orders_family');
    expect(M102).toContain('REFERENCES public.family_groups(id)');
  });

  it('family resolution comes from auth.uid(), never from client input', () => {
    const orderFn = M102.split('CREATE OR REPLACE FUNCTION public.delivery_create_order')[1] ?? M102;
    expect(orderFn).toContain('fm.user_id = v_uid');
    expect(orderFn).toContain('fm.status = \'active\'');
    // The INSERT never accepts a client-supplied family value beyond the resolved one.
    expect(orderFn).not.toMatch(/family_id\s*=>|p_customer->>'family/);
  });

  it('pilot-store ordering demands a family account regardless of intent', () => {
    const orderFn = M102.split('CREATE OR REPLACE FUNCTION public.delivery_create_order')[1] ?? M102;
    expect(orderFn).toContain("s.slug LIKE 'pilot-%'");
    expect(orderFn).toContain("RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED'");
  });

  it('the settlement server-resolves and aggregates by the order family', () => {
    const settle = FN_IN(M102, 'pilot_family_settle_and_deliver');
    expect(settle).toContain('o.family_id');
    expect(settle).toContain('l.family_id = v_family');
  });
});

describe('GATE A — real actuals at delivery (D6=D)', () => {
  it('00101 adds delivered_quantity (numeric) + sell_unit additively', () => {
    expect(M101).toContain('ADD COLUMN IF NOT EXISTS delivered_quantity numeric(12,3)');
    expect(M101).toContain('ADD COLUMN IF NOT EXISTS sell_unit text NOT NULL DEFAULT \'unit\'');
    expect(M101).toMatch(/CHECK \(sell_unit IN \('unit', 'kg'\)\)/);
    expect(M101).not.toMatch(/ALTER COLUMN/);
  });

  it('00102 settlement values from DELIVERED quantities when recorded', () => {
    const settle = FN_IN(M102, 'pilot_family_settle_and_deliver');
    expect(settle).toContain('oi.delivered_quantity');
    expect(settle).toContain('oi.unit_price');
  });

  it('00101 actual-recording RPC is author-scoped and state-guarded', () => {
    const fn = FN_IN(M101, 'pilot_set_delivered_actuals');
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain("v_status NOT IN ('preparing', 'out_for_delivery')");
    expect(fn).toContain("RAISE EXCEPTION 'PERMISSION_DENIED'");
    expect(fn).toContain("RAISE EXCEPTION 'ACTUALS_NOT_RECORDABLE'");
  });
});

describe('GATE A — settlement lives in the canonical state machine (D5=B)', () => {
  it('00102 settlement routes through pilot_assert_transition before posting money', () => {
    const settle = FN_IN(M102, 'pilot_family_settle_and_deliver');
    expect(settle).toContain("pilot_assert_transition(p_order_id, 'delivered', false)");
    expect(settle).toContain('ORDER_ALREADY_SETTLED');
  });

  it('00103 makes a double settlement structurally impossible', () => {
    expect(M103).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ledger_one_primary_settlement_per_order');
    expect(M103).toMatch(/WHERE transaction_type = 'PURCHASE'/);
  });
});

describe('GATE A — out of scope stays untouched (prohibited surfaces)', () => {
  it('no RBAC / roles / online payment / pricing columns in any Gate A migration', () => {
    for (const m of GATE_A) {
      expect(m).not.toMatch(/INSERT INTO public\.ROLE_PERMISSIONS/);
      expect(m).not.toMatch(/INSERT INTO public\.ROLE_CAPABILITY_MAP/);
      expect(m).not.toMatch(/CREATE ROLE/);
      expect(m.toLowerCase()).not.toMatch(/payment|stripe|paypal/);
      expect(m).not.toMatch(/ALTER TABLE[\s\S]{0,200}\b(buy_price|sell_price)\b/);
      expect(m).not.toMatch(/ALTER COLUMN\s+(buy_price|sell_price)\b/);
      expect(m).not.toMatch(/ALTER TABLE public\.users/);
      expect(m).not.toMatch(/ALTER COLUMN\s+quantity/);
    }
  });

  it('every new Gate A RPC is SECURITY DEFINER with fixed search_path and REVOKE-then-GRANT', () => {
    const rpcs: ReadonlyArray<{ file: string; name: string }> = [
      { file: M100, name: 'pilot_my_family' },
      { file: M100, name: 'pilot_my_account' },
      { file: M100, name: 'pilot_admin_provision_family_member' },
      { file: M100, name: 'pilot_admin_deposit' },
      { file: M100, name: 'pilot_admin_list_family_members' },
      { file: M101, name: 'pilot_set_delivered_actuals' },
      { file: M102, name: 'delivery_create_order' },
      { file: M102, name: 'pilot_family_settle_and_deliver' },
    ];
    for (const r of rpcs) {
      const block = FN_IN(r.file, r.name);
      expect(block, `${r.name} SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(block, `${r.name} search_path`).toContain("SET search_path = ''");
      expect(r.file, `${r.name} revoke-all`).toContain(`REVOKE ALL ON FUNCTION public.${r.name}(`);
      expect(r.file, `${r.name} not-anon`).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${r.name}\\([^)]*\\) TO anon`));
    }
  });
});