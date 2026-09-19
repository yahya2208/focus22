/**
 * GATE 3 — ORDER LIFECYCLE + STATUS HISTORY — DEDICATED NEGATIVE-PATH SUITE
 * (migration 00079). Offline structural proofs, same convention as 00078.
 *
 * START state assumptions (read-only, non-destructive):
 *   the pilot runs today with 4 legacy orders (1 delivered, 3 pending).
 *   Legacy KEEPS delivered/cancelled TERMINAL: nothing may move those forward.
 *
 * This suite proves the SERVER side has NO positive escape hatch for any of
 * the forbidden behaviours:
 *   * invalid (from,to) pairs are NOT in the only matrix (extracted pair set)
 *   * invalid status arguments are rejected (ARGUMENTS_INVALID) before the
 *     matrix is touched
 *   * delivered / cancelled are unreachable as a "from" state
 *   * customers have no transition branch (default role is customer → PERMISSION_DENIED)
 *   * couriers hold NO store-wide override (assignment-scoped, active-membership
 *     is the only way to BECOME a courier for the matrix)
 *   * cross-courier / wrong-store / suspended actors are structurally blocked
 *   * anonymous callers are rejected with UNAUTHENTICATED before any effect
 *   * stale/non-latest transitions are rejected (guarded UPDATE + ROW_COUNT=0)
 *   * a lost claim race raises ORDER_UNASSIGNABLE (never silently over-assigns)
 *   * timeline hides non-authorised ids (ORDER_NOT_FOUND, no enumeration)
 *   * 'reassigned'/'status_set' stay reserved event types with NO write path
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M79 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00079_order_lifecycle_status_history.sql'), 'utf-8');
const CODE = M79.replace(/^\s*--.*$/gm, '').trim();

const FN = (name: string): string => {
  const start = M79.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00079`).toBeGreaterThan(-1);
  const tail = M79.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

// Extract EVERY (from -> to) pair literal from the single v_allowed matrix.
const matrixPairs = (): string[] => {
  const helper = FN('pilot_assert_transition');
  const start = helper.indexOf('v_allowed := (');
  const end = helper.indexOf(');', start);
  const region = helper.slice(start, end === -1 ? undefined : end);
  const pairs: string[] = [];
  const re = /v_cur = '([a-z_]+)'\s+AND p_new_status = '([a-z_]+)'/g;
  for (const m of region.matchAll(re)) pairs.push(`${m[1]}:${m[2]}`);
  return pairs;
};

const VALID = [
  'pending:confirmed',
  'pending:cancelled',
  'confirmed:preparing',
  'confirmed:cancelled',
  'preparing:out_for_delivery',
  'preparing:cancelled',
  'out_for_delivery:delivered',
];

describe('Negative — the matrix admits ONLY the 7 GATE-1 pairs', () => {
  it('extracted transition set == the canonical whitelist (no extras, no gaps)', () => {
    const pairs = matrixPairs();
    expect(new Set(pairs)).toEqual(new Set(VALID));
    // 9 disjuncts in code = 7 unique O/A rows + the 2 courier-assigned rows.
    expect(pairs).toHaveLength(9);
  });

  it('every hop that GATE-1 forbids is structurally absent', () => {
    const pairs = new Set(matrixPairs());
    const forbidden = [
      'pending:preparing', 'pending:out_for_delivery', 'pending:delivered',
      'confirmed:out_for_delivery', 'confirmed:delivered', 'confirmed:pending',
      'preparing:pending', 'preparing:confirmed', 'preparing:delivered',
      'out_for_delivery:pending', 'out_for_delivery:confirmed',
      'out_for_delivery:preparing', 'out_for_delivery:cancelled',
      'delivered:pending', 'delivered:confirmed', 'delivered:preparing',
      'delivered:out_for_delivery', 'delivered:cancelled',
      'cancelled:pending', 'cancelled:confirmed', 'cancelled:preparing',
      'cancelled:out_for_delivery', 'cancelled:delivered',
    ];
    for (const hop of forbidden) {
      expect(pairs, hop).not.toContain(hop);
    }
  });

  it('no role gets a matrix bypass: NOT v_allowed turns into a hard raise', () => {
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain('IF NOT v_allowed THEN');
    expect(helper).toContain("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';");
    // NO body of the matrix references a single admin-only override lane.
    expect(helper).not.toMatch(/v_role = 'admin'/);
    expect(helper).not.toMatch(/v_role = 'customer' AND \(/);
  });
});

describe('Negative — argument + identity failures raise BEFORE any mutation', () => {
  it('UNAUTHENTICATED is the first guard in every attacker-visible RPC + helper', () => {
    for (const n of ['pilot_assert_transition', 'pilot_order_set_status', 'pilot_courier_set_status', 'pilot_order_accept', 'delivery_create_order', 'pilot_order_timeline']) {
      const block = FN(n);
      const unauth = block.indexOf('UNAUTHENTICATED');
      const firstGated = Math.min(...[block.indexOf('UPDATE public.orders'), block.indexOf('INSERT INTO public.order_status_history'), block.indexOf('SELECT o.status'), block.indexOf('SELECT EXISTS')].filter((i) => i > -1));
      expect(unauth, n).toBeGreaterThan(-1);
      expect(unauth, n).toBeLessThan(firstGated);
    }
  });

  it('a non-status string (garbage/new invented status) is rejected with ARGUMENTS_INVALID', () => {
    // Helper uses p_new_status; both client RPCs use p_status — same whitelist.
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain("COALESCE(p_new_status, '') NOT IN");
    expect(helper).toContain("('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')");
    for (const n of ['pilot_order_set_status', 'pilot_courier_set_status']) {
      const block = FN(n);
      expect(block, n).toContain("COALESCE(p_status, '') NOT IN (");
      expect(block, n).toMatch(/\(\s*'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'\s*\)/);
    }
    for (const n of ['pilot_assert_transition', 'pilot_order_set_status', 'pilot_courier_set_status']) {
      expect(FN(n), n).toContain("RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';");
    }
    // A NEW status value the client imagines (e.g. 'courier_assigned') cannot
    // be a status: it is not in the six, and never appears as a p_new_status
    // feed in the matrix region.
    expect(matrixPairs().join(' ')).not.toContain('courier_assigned');
  });

  it('NULL order id is ARGUMENTS_INVALID everywhere, a missing order is ORDER_NOT_FOUND', () => {
    for (const n of ['pilot_assert_transition', 'pilot_order_set_status', 'pilot_courier_set_status', 'pilot_order_accept', 'pilot_order_timeline']) {
      expect(FN(n), n).toMatch(/p_order_id IS NULL/);
      expect(FN(n), n).toContain("RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';");
      expect(FN(n), n).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';");
    }
  });

  it('delivery_create_order still rejects empty/invalid baskets (customer-side)', () => {
    const block = FN('delivery_create_order');
    expect(block).toContain("v_cust_name = '' OR v_cust_phone = ''");
    expect(block).toContain("jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0");
  });
});

describe('Negative — terminal legacy states cannot be mutated', () => {
  it('delivered/cancelled appear only as TO-states or guards, never as FROM-states', () => {
    const pairs = matrixPairs();
    expect(pairs).toContain('pending:cancelled');
    expect(pairs).toContain('confirmed:cancelled');
    expect(pairs).toContain('preparing:cancelled');
    expect(pairs).not.toContain('delivered:cancelled');
    expect(pairs).not.toContain('cancelled:confirmed');
    // The helper never reads a from-state of delivered/cancelled at all.
    expect(FN('pilot_assert_transition')).not.toMatch(/v_cur = 'delivered'/);
    expect(FN('pilot_assert_transition')).not.toMatch(/v_cur = 'cancelled'/);
  });
});

describe('Negative — no customer is ever a status-writer', () => {
  it('the default resolved role is customer and that role hits PERMISSION_DENIED', () => {
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain("v_role        text := 'customer';");
    expect(helper).toContain("IF v_role = 'customer' OR (v_role = 'courier' AND v_assigned IS DISTINCT FROM v_uid) THEN");
    expect(helper).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';");
  });

  it("customer creations only ever yield the 'created' event (never a status row)", () => {
    const create = FN('delivery_create_order');
    // The ONLY history insert in creation is the created event.
    expect((create.match(/INSERT INTO public\.order_status_history/g) ?? []).length).toBe(1);
    expect(create).toMatch(/, '', 'confirmed', 'created',\s*v_uid, 'customer'/);
    // Customers never invoke the transition helper (no path, no grant).
    expect(create).not.toMatch(/pilot_assert_transition/);
    // Timeline authorises the owner to VIEW, not mutate.
    const timeline = FN('pilot_order_timeline');
    expect(timeline).toContain('o.user_id = v_uid');
    expect(timeline).not.toMatch(/UPDATE public\.orders/);
  });
});

describe('Negative — courier power is assignment-scoped, never store-scoped', () => {
  it('the only way to BE a courier for the matrix is ACTIVE membership of that order store', () => {
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain('pc.store_id = v_order_store');
    expect(helper).toContain('pc.status = ' + "'active'");
    // Exactly ONE assignment to courier-ness, and it happens ONLY inside the
    // ELSIF that already demanded the active membership — never as a default.
    const assigns = (helper.match(/\bv_role := 'courier';/g) ?? []).length;
    expect(assigns).toBe(1);
    expect(helper.slice(0, helper.indexOf("v_role := 'courier';"))).toContain("pc.status = 'active'");
  });

  it('every courier transition also requires v_assigned = v_uid (cross-courier dead)', () => {
    const helper = FN('pilot_assert_transition');
    const lane = helper.indexOf("v_role = 'courier' AND v_assigned = v_uid AND (");
    expect(lane).toBeGreaterThan(-1);
    // The courier ships BOTH C-hop rows underneath that assignment guard.
    for (const hop of ['preparing:out_for_delivery', 'out_for_delivery:delivered']) {
      const from = hop.split(':')[0];
      const to = hop.split(':')[1];
      const idx = helper.indexOf(`AND p_new_status = '${to}'`, lane);
      expect(idx, hop).toBeGreaterThan(lane);
      expect(helper.slice(lane, idx), hop).toContain(`v_cur = '${from}'`);
    }
    // confirmed -> out_for_delivery (skip) is not a courier hop: absent entirely.
    expect(matrixPairs()).not.toContain('confirmed:out_for_delivery');
    // The RPC pre-check independently blocks non-assignees (incl. other couriers).
    expect(FN('pilot_courier_set_status')).toContain('o.courier_user_id = v_uid OR public.fn_admin_uid() IS NOT NULL');
  });

  it('a suspended courier resolves to customer → PERMISSION_DENIED', () => {
    const helper = FN('pilot_assert_transition');
    // Only the 'active' row satisfies the courier ELSIF; otherwise default customer.
    const activeCount = (helper.match(/pc\.status\s*=\s*'active'/g) ?? []).length;
    expect(activeCount).toBe(1);
    expect(helper).toMatch(/ELSE\n    v_role := 'customer';/);
  });
});

describe('Negative — wrong store, stale state, and lost races', () => {
  it('a store operator is scoped to s.id = order store at BOTH layers', () => {
    expect(FN('pilot_order_set_status')).toContain('WHERE s.id = v_store AND s.operator_user_id = v_uid');
    expect(FN('pilot_assert_transition')).toContain('s.id = v_order_store AND s.operator_user_id = v_uid');
    expect(FN('pilot_order_accept')).toContain('s.operator_user_id = v_uid');
  });

  it('a stale client transition (status changed since read) is rejected by ROW_COUNT=0', () => {
    const helper = FN('pilot_assert_transition');
    const upd = helper.indexOf('UPDATE public.orders');
    const where = helper.indexOf('AND status = v_cur;', upd);
    const diag = helper.indexOf('GET DIAGNOSTICS v_done = ROW_COUNT;', where);
    const raise = helper.indexOf("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED'", diag);
    expect(where).toBeGreaterThan(upd);
    expect(diag).toBeGreaterThan(where);
    expect(raise).toBeGreaterThan(diag);
    // Race cannot double-apply: the UPDATE targets the exact status read above.
    expect(helper.slice(upd, where)).toContain('SET status = p_new_status');
  });

  it('a lost claim race raises ORDER_UNASSIGNABLE, never double-assigns', () => {
    const helper = FN('pilot_assert_transition');
    // The claim guard is a WHERE on an UNASSIGNED order in confirmed/preparing.
    expect(helper).toContain('AND courier_user_id IS NULL');
    expect(helper).toContain("AND status IN ('confirmed', 'preparing')");
    // If the guarded UPDATE matches 0 rows (already claimed / wrong status) the
    // caller gets ORDER_UNASSIGNABLE — the server never overwrites an assignment.
    expect(helper).toContain("RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';");
    // No application-level retry loop can paper over the race.
    expect(helper).not.toMatch(/FOR .* LOOP|\.replace\(|RETRY/);
    expect(helper).not.toMatch(/SELECT\b[\s\S]*FOR UPDATE/);
  });
});

describe('Negative — read surfaces leak nothing', () => {
  it('timeline never distinguishes a missing order from an unauthorised one', () => {
    const timeline = FN('pilot_order_timeline');
    // NON-authorized id → ORDER_NOT_FOUND (same as missing id), NO PERMISSION_DENIED.
    expect(timeline).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002'");
    expect(timeline).not.toMatch(/PERMISSION_DENIED/);
  });

  it("reserved event types ('reassigned','status_set') have NO producer", () => {
    // They exist ONLY once (inside the CHECK constraint), never as a write literal.
    for (const e of ['reassigned', 'status_set']) {
      const occurrences = (CODE.match(new RegExp(`'${e}'`, 'g')) ?? []).length;
      expect(occurrences, e).toBe(1);
    }
  });

  it('direct history reads by non-admin are impossible (RLS admin-only, no write grants)', () => {
    expect(M79).toContain('GRANT SELECT ON public.order_status_history TO authenticated;');
    expect(M79).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.order_status_history/);
    expect(M79).not.toMatch(/FOR SELECT TO anon/);
    const policies = M79.match(/CREATE POLICY "[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
  });
});