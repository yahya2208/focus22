/**
 * Settlement decision (00124) — static contract on the migration text.
 *
 * Pins: decision param + roles, family lock ordering, probe zero-mutation,
 * ACCEPT/REJECT money math, courier denial, matrix extension, push_log key,
 * grants. Runtime concurrency/idempotency proofs (T9/T10 live behavior)
 * require a staging database; here we pin the structural guarantees that
 * make them hold (lock-before-read, check-before-mutation).
 * Touches no database.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const M124 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00124_settlement_decision.sql'),
  'utf-8',
);

function settleBody(): string {
  const start = M124.indexOf(
    'CREATE OR REPLACE FUNCTION public.pilot_family_settle_and_deliver(',
  );
  const end = M124.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return M124.slice(start, end);
}

function transitionBody(): string {
  const start = M124.indexOf(
    'CREATE OR REPLACE FUNCTION public.pilot_assert_transition(',
  );
  const end = M124.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return M124.slice(start, end);
}

describe('00124 — decision parameter and roles', () => {
  it('adds p_decision with NORMAL default; rejects anything else', () => {
    const body = settleBody();
    expect(body).toContain("p_decision text DEFAULT 'NORMAL'");
    expect(body).toMatch(/IF p_decision NOT IN \('NORMAL', 'ACCEPT_DEBT', 'REJECT'\) THEN/);
  });

  it('T5/T6: courier cannot take debt decisions (admin/operator only)', () => {
    const body = settleBody();
    expect(body).toMatch(
      /IF p_decision IN \('ACCEPT_DEBT', 'REJECT'\) AND NOT \(v_is_admin OR v_is_operator\) THEN/,
    );
  });

  it('T11: invalid decision rejected before any other work', () => {
    const body = settleBody();
    const decideAt = body.indexOf("IF p_decision NOT IN");
    const firstMutation = body.indexOf('PERFORM public.pilot_set_delivered_actuals');
    expect(decideAt).toBeGreaterThan(-1);
    expect(decideAt).toBeLessThan(firstMutation);
  });
});

describe('00124 — lock ordering and probe purity (T2/T9/T10)', () => {
  it('T9: family lock precedes the balance read', () => {
    const body = settleBody();
    const lockAt = body.indexOf('FOR UPDATE');
    const balanceAt = body.indexOf('SELECT COALESCE(SUM(l.amount), 0) INTO v_prior');
    expect(lockAt).toBeGreaterThan(-1);
    expect(balanceAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(balanceAt);
  });

  it('T10: idempotency check precedes every mutation', () => {
    const body = settleBody();
    const idemAt = body.indexOf('ORDER_ALREADY_SETTLED');
    const firstWrite = Math.min(
      body.indexOf('PERFORM public.pilot_set_delivered_actuals'),
      body.indexOf('UPDATE public.inventory_items'),
      body.indexOf('INSERT INTO public.ledger'),
    );
    expect(idemAt).toBeGreaterThan(-1);
    expect(idemAt).toBeLessThan(firstWrite);
  });

  it('T2: probe shortfall returns before actuals/stock/ledger/status/history', () => {
    const body = settleBody();
    const probeIf = body.indexOf("IF v_shortfall > 0 AND p_decision = 'NORMAL' THEN");
    expect(probeIf).toBeGreaterThan(-1);
    // Bound the window to the probe branch itself (its RETURN statement end).
    const retAt = body.indexOf('RETURN jsonb_build_object(', probeIf);
    const probeBlock = body.slice(probeIf, body.indexOf(');', retAt) + 3);
    expect(probeBlock).toContain("'status', 'insufficient_balance'");
    // The probe branch persists nothing: no actuals, stock, money, status.
    expect(probeBlock).not.toMatch(/PERFORM public\.pilot_set_delivered_actuals/);
    expect(probeBlock).not.toMatch(/UPDATE public\.inventory_items/);
    expect(probeBlock).not.toMatch(/INSERT INTO public\.(ledger|debts|order_status_history)/);
    expect(probeBlock).not.toMatch(/pilot_assert_transition/);
  });
});

describe('00124 — ACCEPT_DEBT money math (T3/T7/T8)', () => {
  it('PURCHASE posts the covered portion; debt carries the shortfall open', () => {
    const body = settleBody();
    expect(body).toContain('v_covered := v_available');
    expect(body).toContain('v_covered := v_final_total');
    expect(body).toContain("'PURCHASE', -v_covered");
    expect(body).toContain('v_after := v_prior - v_covered');
  });

  it('balance_after can never go negative through ACCEPT (available >= 0)', () => {
    const body = settleBody();
    expect(body).toContain('v_available := GREATEST(v_prior, 0)');
  });
});

describe('00124 — REJECT path (T4)', () => {
  it('cancelled transition with attribution, zero money/stock/actuals', () => {
    const body = settleBody();
    const rejectAt = body.indexOf("IF p_decision = 'REJECT' THEN");
    expect(rejectAt).toBeGreaterThan(-1);
    const block = body.slice(rejectAt, rejectAt + 1200);
    expect(block).toContain("'cancelled'");
    expect(block).toContain('INSUFFICIENT_BALANCE');
    expect(block).not.toMatch(/INSERT INTO public\.(ledger|debts)/);
    expect(block).not.toMatch(/UPDATE public\.inventory_items/);
    expect(block).not.toMatch(/pilot_set_delivered_actuals/);
  });
});

describe('00124 — matrix extension + attribution params', () => {
  it('OFD->cancelled arm added for admin/operator only; courier unchanged', () => {
    const body = transitionBody();
    expect(body).toMatch(
      /\(v_cur = 'out_for_delivery' AND p_new_status = 'cancelled'\)/,
    );
    // The arm sits inside the admin/store_operator disjunct, not courier's.
    const armAt = body.indexOf("(v_cur = 'out_for_delivery' AND p_new_status = 'cancelled')");
    const courierAt = body.indexOf("v_role = 'courier'");
    expect(armAt).toBeGreaterThan(-1);
    expect(armAt).toBeLessThan(courierAt);
  });

  it('history carries reason/metadata via optional params (defaults preserve callers)', () => {
    const body = transitionBody();
    expect(body).toContain("p_reason     text DEFAULT ''");
    expect(body).toContain("p_metadata   jsonb DEFAULT '{}'");
    expect(body).toContain("v_uid, v_role, COALESCE(p_reason, ''), COALESCE(p_metadata, '{}')");
  });
});

describe('00124 — push_log event key + grants', () => {
  it('event dimension added data-preservingly', () => {
    expect(M124).toContain('ADD COLUMN IF NOT EXISTS event text NOT NULL DEFAULT');
    expect(M124).toContain('ADD PRIMARY KEY (order_id, endpoint, event)');
  });

  it('grants: settle 4-arg authenticated-only; assert_transition stays revoke-only', () => {
    expect(M124).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text, text) TO authenticated',
    );
    expect(M124).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pilot_family_settle_and_deliver\(uuid, jsonb, text, text\)[^;]*TO\s+(anon|PUBLIC)/,
    );
    expect(M124).toContain(
      'REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean, text, jsonb) FROM authenticated',
    );
  });

  it('legacy 3-arg overload dropped so old calls resolve to the guard', () => {
    expect(M124).toContain(
      'DROP FUNCTION IF EXISTS public.pilot_family_settle_and_deliver(uuid, jsonb, text)',
    );
  });
});
