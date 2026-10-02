/**
 * GATE S1 (00123) — settlement bounds: actuals cap, zero-delivery, no storeless.
 *
 * Static contract on the migration text (?raw pattern): the three re-issued
 * bodies enforce 0 <= delivered <= ordered, reject storeless creation, and
 * preserve every existing check, signature, grant, and return shape.
 * Pins the migration — touches no database.
 */
import { describe, expect, it } from 'vitest';
import migration123 from '../../../supabase/migrations/00123_gate_s1_settlement_bounds.sql?raw';

function bodyOf(createMarker: string): string {
  const start = migration123.indexOf(createMarker);
  const end = migration123.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration123.slice(start, end);
}

const actualsBody = () =>
  bodyOf('CREATE OR REPLACE FUNCTION public.pilot_set_delivered_actuals(');
const settleBody = () =>
  bodyOf('CREATE OR REPLACE FUNCTION public.pilot_family_settle_and_deliver(');
const createBody = () =>
  bodyOf('CREATE OR REPLACE FUNCTION public.delivery_create_order(');

describe('S1-D1 — delivered cap at record time', () => {
  it('over-ordered actual is rejected', () => {
    expect(actualsBody()).toMatch(/IF v_qty > v_ordered THEN/);
  });

  it('negative actual is rejected, zero is accepted', () => {
    const body = actualsBody();
    expect(body).toMatch(/v_qty < 0/);
    expect(body).not.toMatch(/v_qty <= 0/);
  });

  it('exact ordered and partial values pass (only strictly-greater raises)', () => {
    const body = actualsBody();
    expect(body).not.toMatch(/v_qty >= v_ordered/);
  });

  it('cap reads the same order line (no cross-order confusion)', () => {
    expect(actualsBody()).toMatch(
      /WHERE oi\.id = v_id AND oi\.order_id = p_order_id/,
    );
  });
});

describe('S1-D1/D3 — settle-time cap and zero handling', () => {
  it('settle re-checks the cap (defense in depth)', () => {
    expect(settleBody()).toMatch(/v_need > v_line\.ordered/);
  });

  it('zero need skips stock, money, and both counters, then continues', () => {
    const body = settleBody();
    const zeroAt = body.indexOf('IF v_need = 0 THEN');
    expect(zeroAt).toBeGreaterThan(-1);
    const afterZero = body.slice(zeroAt);
    // The zero branch continues before any stock read or counter.
    expect(afterZero.slice(0, 400)).toContain('CONTINUE;');
    // NULL still raises; negative still raises.
    expect(body).toMatch(/IF v_need IS NULL THEN/);
    expect(body).toMatch(/v_need < 0 OR v_need > v_line\.ordered/);
  });

  it('NULL keeps its fallback-to-ordered meaning', () => {
    expect(settleBody()).toContain(
      'COALESCE(oi.delivered_quantity, oi.quantity) AS need',
    );
  });

  it('zero and cap guards precede every skip path (ordering correction)', () => {
    const body = settleBody();
    const zeroAt = body.indexOf('IF v_need = 0 THEN');
    const capAt = body.indexOf('v_need > v_line.ordered');
    const firstSkipAt = body.indexOf('v_skipped := v_skipped + 1');
    expect(zeroAt).toBeGreaterThan(-1);
    expect(capAt).toBeGreaterThan(-1);
    expect(firstSkipAt).toBeGreaterThan(-1);
    expect(zeroAt).toBeLessThan(firstSkipAt);
    expect(capAt).toBeLessThan(firstSkipAt);
  });

  it('subtotal still values recorded zero at zero (no special-casing needed)', () => {
    expect(settleBody()).toContain('oi.delivered_quantity * oi.unit_price');
  });
});

describe('S1-D2 — storeless creation rejected', () => {
  it('NOT v_any_store raises ARGUMENTS_INVALID before the order INSERT', () => {
    const body = createBody();
    const guardAt = body.indexOf('IF NOT v_any_store THEN');
    expect(guardAt).toBeGreaterThan(-1);
    expect(body.slice(guardAt, guardAt + 200)).toContain(
      "RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023'",
    );
    expect(guardAt).toBeLessThan(body.indexOf('INSERT INTO public.orders'));
  });

  it('no NULL-store assignment survives on the creation path', () => {
    expect(createBody()).not.toMatch(/v_store_id := NULL/);
  });

  it('B4 authority and all other create validations are intact', () => {
    const body = createBody();
    for (const marker of [
      'UNAUTHENTICATED',
      'CUSTOMER_INFO_REQUIRED',
      'ZONE_NOT_ACTIVE',
      'ITEMS_REQUIRED',
      "IF v_ref = '' THEN",
      'ITEM_NOT_FOUND',
      'ITEM_NOT_ORDERABLE',
      'QUANTITY_INVALID',
      'MULTI_STORE_ORDER',
      'FAMILY_ACCOUNT_REQUIRED',
      'DUPLICATE_ORDER',
      'v_public_listings',
    ]) {
      expect(body).toContain(marker);
    }
    expect(body).not.toContain("v_item->>'unit_price'");
  });
});

describe('S1 — contracts, constraints, grants preserved', () => {
  it('all three signatures and security postures unchanged', () => {
    for (const body of [actualsBody(), settleBody(), createBody()]) {
      expect(body).toContain('SECURITY DEFINER');
      expect(body).toMatch(/SET\s+search_path\s*=\s*''/);
    }
    expect(migration123).toContain(
      'public.pilot_set_delivered_actuals(\n  p_order_id uuid,\n  p_items    jsonb\n)',
    );
  });

  it('CHECK relaxed to >= 0 with no cross-column CHECK added', () => {
    expect(migration123).toContain(
      'CHECK (delivered_quantity IS NULL OR delivered_quantity >= 0)',
    );
    // The relaxed CHECK is added exactly once (DROP IF EXISTS + one ADD);
    // caps live in function bodies, never as table constraints.
    const adds = migration123.match(
      /ADD CONSTRAINT order_items_delivered_quantity_check/g,
    ) ?? [];
    expect(adds.length).toBe(1);
  });

  it('grants re-asserted verbatim for all three functions (no widening)', () => {
    const esc = (s: string) => s.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    for (const sig of [
      'public.pilot_set_delivered_actuals(uuid, jsonb)',
      'public.pilot_family_settle_and_deliver(uuid, jsonb, text)',
      'public.delivery_create_order(jsonb, jsonb, boolean)',
    ]) {
      expect(migration123).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC`);
      expect(migration123).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${esc(sig)}[^;]*TO\\s+(anon|PUBLIC)`),
      );
      expect(migration123).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`);
    }
  });

  it('exactly three functions re-issued, single transaction', () => {
    const creates = migration123.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(creates.length).toBe(3);
    expect(migration123).toContain('\nBEGIN;');
    expect(migration123).toContain('\nCOMMIT;');
  });
});
