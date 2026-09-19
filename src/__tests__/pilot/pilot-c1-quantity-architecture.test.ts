/**
 * GATE C1 — numeric quantity architecture migration gate (offline, structural).
 *
 * No live DB. Asserts 00104 codifies the approved model:
 *   • inventory/order/movement quantities widen integer -> numeric(12,3), losslessly.
 *   • kg is the ONLY decimal unit; every other unit is server-enforced whole.
 *   • `unit` (00053) stays canonical; `sell_unit` becomes a derived projection.
 *   • inventory_calc_status + stock RPCs move to numeric with NO integer overload.
 *   • delivery_create_order keeps its signature and ALL server authority.
 *   • money/family/ledger/RBAC/RLS are untouched (additive + widening only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00104_numeric_quantity_architecture.sql'),
  'utf-8',
);
const M53 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00053_produce_domain.sql'),
  'utf-8',
);

/** Slice a function body: CREATE FUNCTION, CREATE OR REPLACE FUNCTION. */
const FN_IN = (src: string, name: string): string => {
  const re = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b`);
  const m = re.exec(src);
  expect(m, `${name} must be defined in migration source`).not.toBeNull();
  const tail = src.slice(m!.index);
  const end = tail.slice(1).search(/\n(?:CREATE (?:OR REPLACE )?FUNCTION|DROP FUNCTION|GRANT |REVOKE |COMMENT ON|DO \$\$|ALTER )/);
  return end === -1 ? tail : tail.slice(0, end + 1);
};

const codeOnly = (src: string): string =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

describe('GATE C1 — quantity columns widen losslessly (integer -> numeric(12,3))', () => {
  it('inventory_items.quantity / total_purchased / total_sold become numeric(12,3)', () => {
    expect(M).toMatch(/ALTER TABLE public\.inventory_items[\s\S]*?quantity\s+TYPE numeric\(12,3\) USING quantity::numeric\(12,3\)/);
    expect(M).toMatch(/total_purchased\s+TYPE numeric\(12,3\) USING total_purchased::numeric\(12,3\)/);
    expect(M).toMatch(/total_sold\s+TYPE numeric\(12,3\) USING total_sold::numeric\(12,3\)/);
  });

  it('order_items.quantity and inventory_movements.delta become numeric(12,3)', () => {
    expect(M).toMatch(/ALTER TABLE public\.order_items[\s\S]*?quantity\s+TYPE numeric\(12,3\) USING quantity::numeric\(12,3\)/);
    expect(M).toMatch(/ALTER TABLE public\.inventory_movements[\s\S]*?delta\s+TYPE numeric\(12,3\) USING delta::numeric\(12,3\)/);
  });

  it('preserves NOT NULL/DEFAULT and re-asserts the quantity CHECKs', () => {
    expect(M).toContain('inventory_items_quantity_nonneg CHECK (quantity >= 0)');
    expect(M).toContain('order_items_quantity_check CHECK (quantity > 0)');
    expect(M).toMatch(/ALTER COLUMN quantity SET NOT NULL/);
    expect(M).toMatch(/ALTER COLUMN quantity SET DEFAULT 0/);
    expect(M).toMatch(/ALTER COLUMN quantity SET DEFAULT 1/);
  });

  it('is additive: no table/column drops, no DROP TABLE', () => {
    const code = codeOnly(M);
    expect(code).not.toMatch(/DROP TABLE/);
    expect(code).not.toMatch(/DROP COLUMN/);
  });
});

describe('GATE C1 — kg is the only decimal unit; server is authoritative', () => {
  const orderFn = FN_IN(M, 'delivery_create_order');

  it('delivery_create_order keeps its exact 3-arg signature + default', () => {
    expect(M).toMatch(/CREATE OR REPLACE FUNCTION public\.delivery_create_order\(\s*p_customer\s+jsonb,\s*p_items\s+jsonb,\s*p_intentional\s+boolean\s+DEFAULT false\s*\)/s);
  });

  it('validates kg with round(.,3) and every other unit with trunc()', () => {
    expect(orderFn).toContain("IF v_row_unit = 'kg' THEN");
    expect(orderFn).toContain('IF v_item_qty <> round(v_item_qty, 3) THEN');
    expect(orderFn).toMatch(/ELSE[\s\S]*?IF v_item_qty <> trunc\(v_item_qty\) THEN/);
    expect((orderFn.match(/QUANTITY_INVALID/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('resolves the unit from the public view (00053 canonical `unit`)', () => {
    expect(orderFn).toContain('v_row_unit');
    expect(orderFn).toMatch(/SELECT[\s\S]*?v\.unit[\s\S]*?FROM public\.v_public_listings v/);
    expect(M53).toContain("unit IN ('piece','kg','g','liter','dozen','bag')");
  });

  it('never silently writes a fractional quantity for a whole unit (quantity is cast numeric)', () => {
    expect(orderFn).not.toContain("(v_item->>'quantity')::integer");
    expect(orderFn).toContain("(v_item->>'quantity')::numeric");
  });

  it('keeps full server authority (auth, family, catalog, zone, store, retry, pricing)', () => {
    for (const required of [
      'auth.uid()',
      'family_members',
      'v_public_listings',
      'delivery_zones',
      "s.slug LIKE 'pilot-%'",
      "RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED'",
      "interval '60 seconds'",
      'COALESCE(v_row_price, 0)',
      'LEAST(v_item_qty, v_row_qty)',
    ]) {
      expect(orderFn, required).toContain(required);
    }
  });

  it('re-asserts REVOKE-then-GRANT and strips anon', () => {
    expect(M).toContain('REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM PUBLIC');
    expect(M).toContain('REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM anon');
    expect(M).toContain('GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated');
  });
});

describe('GATE C1 — inventory helpers move to numeric with no ambiguous overload', () => {
  it('drops the integer inventory_calc_status then creates a single numeric one', () => {
    expect(M).toContain('DROP FUNCTION IF EXISTS public.inventory_calc_status(integer);');
    expect(M).toContain('CREATE FUNCTION public.inventory_calc_status(p_quantity numeric)');
    expect((M.match(/FUNCTION public\.inventory_calc_status\(/g) ?? []).length).toBe(2); // drop + create
    expect(M).not.toMatch(/FUNCTION public\.inventory_calc_status\(p_quantity integer\)/);
  });

  it('drops the integer stock RPCs then recreates them as numeric', () => {
    for (const fn of ['inventory_add_stock', 'inventory_remove_stock', 'inventory_adjust_stock']) {
      expect(M, fn).toContain(`DROP FUNCTION IF EXISTS public.${fn}(uuid, integer, text, jsonb, text);`);
      expect(M, fn).toContain(`CREATE FUNCTION public.${fn}(`);
      const block = FN_IN(M, fn);
      expect(block, fn).toContain('p_quantity     numeric');
      expect(block, fn).toContain('SECURITY DEFINER');
      expect(block, fn).toContain("SET search_path = public");
      expect(block, fn).toContain('p_quantity <> round(p_quantity, 3)');
      expect(M, fn).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(uuid, numeric, text, jsonb, text) TO authenticated;`);
      expect(M, fn).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}(uuid, numeric, text, jsonb, text) FROM anon;`);
    }
  });

  it('no integer stock-RPC signature survives anywhere', () => {
    expect(M).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.inventory_(add|remove|adjust)_stock\([\s\S]*?p_quantity\s+integer/);
  });
});

describe('GATE C1 — sell_unit is a derived projection of canonical `unit`', () => {
  it('backfills and syncs without inventing a third unit system', () => {
    expect(M).toContain("SET sell_unit = CASE WHEN unit = 'kg' THEN 'kg' ELSE 'unit' END");
    expect(M).toContain('CREATE OR REPLACE FUNCTION public.sync_inventory_sell_unit()');
    expect(M).toMatch(/trg_inventory_items_sell_unit[\s\S]*?BEFORE INSERT OR UPDATE ON public\.inventory_items/);
    expect(M).toContain("NEW.sell_unit := CASE WHEN NEW.unit = 'kg' THEN 'kg' ELSE 'unit' END;");
  });
});

describe('GATE C1 — financial / RBAC / RLS surfaces stay untouched', () => {
  it('never redefines settlement, ledger, debts or family money functions', () => {
    const code = codeOnly(M);
    for (const forbidden of [
      'pilot_family_settle_and_deliver',
      'pilot_set_delivered_actuals',
      'pilot_my_account',
      'INSERT INTO public.ledger',
      'INSERT INTO public.debts',
      'ALTER TABLE public.ledger',
      'ALTER TABLE public.debts',
      'ALTER TABLE public.family_members',
      'CREATE ROLE',
      'ROLE_PERMISSIONS',
      'ROLE_CAPABILITY_MAP',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('does not touch pricing columns or accepted money rounding', () => {
    const code = codeOnly(M);
    expect(code).not.toMatch(/ALTER COLUMN\s+(buy_price|sell_price)\b/);
    // amounts stay numeric(12,2): no widening/narrowing of money columns here
    expect(code).not.toMatch(/ledger[\s\S]{0,80}TYPE numeric/);
  });

  it('the movement audit (delta = NEW - OLD) is left to 00019, not redefined', () => {
    const code = codeOnly(M);
    // 00019 owns the movement ledger; 00104 only widens the delta column type.
    expect(code).not.toContain('INSERT INTO public.inventory_movements');
    expect(code).not.toContain('NEW.quantity - OLD.quantity');
    // The only trigger 00104 introduces is the sell_unit projection.
    const triggers = code.match(/CREATE TRIGGER\s+(\w+)/g) ?? [];
    expect(triggers).toEqual(['CREATE TRIGGER trg_inventory_items_sell_unit']);
  });
});
