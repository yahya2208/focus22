import { describe, expect, it } from 'vitest';
import {
  composeAdminTriage,
  type TriageInput,
} from '../../services/admin-triage-service';

const STORE = { id: 'store-1', name: 'Pilot Store' };

function baseInput(over: Partial<TriageInput> = {}): TriageInput {
  return {
    operators: [],
    couriers: [],
    stores: [STORE],
    orders: [],
    buyableCountByStore: { 'store-1': 3 },
    timelineCountByOrder: {},
    ...over,
  };
}

function op(status: string, ready: boolean, userId = 'op-1') {
  return {
    userId,
    storeId: 'store-1',
    name: 'Op',
    status,
    operationalReady: ready,
  };
}

function co(status: string, ready: boolean, userId = 'co-1') {
  return {
    userId,
    storeId: 'store-1',
    name: 'Co',
    status,
    operationalReady: ready,
  };
}

function order(
  id: string,
  status: string,
  courierUserId: string | null = null,
) {
  return {
    id,
    orderNumber: `N-${id}`,
    storeId: 'store-1',
    status,
    courierUserId,
  };
}

describe('people rules', () => {
  it('emits nothing when everyone is operational', () => {
    const items = composeAdminTriage(
      baseInput({
        operators: [op('active', true)],
        couriers: [co('active', true)],
      }),
    );
    expect(items.filter((i) => i.entityType !== 'store')).toEqual([]);
  });

  it('flags pending operator and pending courier as action-required', () => {
    const items = composeAdminTriage(
      baseInput({ operators: [op('pending', false)], couriers: [co('pending', false)] }),
    );
    const kinds = items.map((i) => [i.entityType, i.severity, i.action.kind, i.destination]);
    expect(kinds).toContainEqual(['operator', 'action-required', 'approve-member', 'pilot-admin']);
    expect(kinds).toContainEqual(['courier', 'action-required', 'approve-member', 'pilot-admin']);
  });

  it('flags suspended/inactive as watch with view-detail (never approve)', () => {
    const items = composeAdminTriage(
      baseInput({
        stores: [],
        operators: [{ ...op('suspended', false) }],
        couriers: [{ ...co('inactive', false) }],
      }),
    );
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.severity === 'watch')).toBe(true);
    expect(items.every((i) => i.action.kind === 'view-detail')).toBe(true);
  });

  it('flags active-but-not-ready as action-required set-ready', () => {
    const items = composeAdminTriage(baseInput({ operators: [op('active', false)] }));
    expect(items).toHaveLength(2); // member item + store-no-operator item
    const member = items.find((i) => i.entityType === 'operator');
    expect(member?.severity).toBe('action-required');
    expect(member?.action).toMatchObject({ kind: 'set-ready', labelKey: 'triage.markReady' });
  });
});

describe('store rules', () => {
  it('operational store yields no store item', () => {
    const items = composeAdminTriage(
      baseInput({ operators: [op('active', true)] }),
    );
    expect(items.filter((i) => i.entityType === 'store')).toEqual([]);
  });

  it('store without operational operator but with members is action-required', () => {
    const items = composeAdminTriage(
      baseInput({ operators: [op('pending', false)] }),
    );
    const storeItems = items.filter((i) => i.entityType === 'store');
    expect(storeItems).toHaveLength(1);
    expect(storeItems[0]?.severity).toBe('action-required');
    expect(storeItems[0]?.reasonKey).toBe('triage.reasonStoreNoOperator');
  });

  it('store with no members at all is review (no invented corrective action)', () => {
    const items = composeAdminTriage(baseInput());
    const storeItems = items.filter((i) => i.entityType === 'store');
    expect(storeItems).toHaveLength(1);
    expect(storeItems[0]?.severity).toBe('review');
  });

  it('store with zero buyable products is review only when the source supports it', () => {
    const withZero = composeAdminTriage(
      baseInput({
        operators: [op('active', true)],
        buyableCountByStore: { 'store-1': 0 },
      }),
    );
    expect(
      withZero.some((i) => i.reasonKey === 'triage.reasonStoreNoProducts' && i.severity === 'review'),
    ).toBe(true);
    const withoutMap = composeAdminTriage(
      baseInput({ operators: [op('active', true)], buyableCountByStore: {} }),
    );
    expect(withoutMap.some((i) => i.reasonKey === 'triage.reasonStoreNoProducts')).toBe(false);
  });
});

describe('order rules', () => {
  it('confirmed with no courier is action-required advance', () => {
    const items = composeAdminTriage(baseInput({ orders: [order('o1', 'confirmed')] }));
    const o = items.find((i) => i.entityId === 'o1');
    expect(o?.severity).toBe('action-required');
    expect(o?.action).toMatchObject({ kind: 'advance-order', labelKey: 'triage.startPreparing' });
    expect(o?.destination).toBe('pilot-store-ops');
  });

  it('preparing with no courier is action-required', () => {
    const items = composeAdminTriage(baseInput({ orders: [order('o2', 'preparing')] }));
    expect(items.find((i) => i.entityId === 'o2')?.severity).toBe('action-required');
  });

  it('out_for_delivery with courier is watch (single item)', () => {
    const items = composeAdminTriage(
      baseInput({
        orders: [order('o3', 'out_for_delivery', 'co-1')],
        couriers: [co('active', true, 'co-1')],
        timelineCountByOrder: { o3: 2 },
      }),
    );
    const mine = items.filter((i) => i.entityId === 'o3');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.severity).toBe('watch');
  });

  it('unassigned non-terminal orders surface without duplication', () => {
    const items = composeAdminTriage(
      baseInput({ orders: [order('o4', 'confirmed'), order('o5', 'preparing')] }),
    );
    expect(items.filter((i) => i.entityId === 'o4')).toHaveLength(1);
    expect(items.filter((i) => i.entityId === 'o5')).toHaveLength(1);
  });

  it('assigned-to-inactive-courier is review (assignment-review)', () => {
    const items = composeAdminTriage(
      baseInput({
        orders: [order('o6', 'out_for_delivery', 'co-9')],
        couriers: [co('suspended', false, 'co-9')],
        timelineCountByOrder: { o6: 3 },
      }),
    );
    const rows = items.filter((i) => i.entityId === 'o6');
    expect(rows.some((i) => i.reasonKey === 'triage.reasonOrderAssignmentReview')).toBe(true);
    expect(rows.every((i) => i.severity !== 'action-required' || i.reasonKey !== 'triage.reasonOrderAssignmentReview')).toBe(true);
  });

  it('missing timeline is review only when timeline data exists', () => {
    const withZero = composeAdminTriage(
      baseInput({ orders: [order('o7', 'confirmed')], timelineCountByOrder: { o7: 0 } }),
    );
    expect(
      withZero.some((i) => i.entityId === 'o7' && i.reasonKey === 'triage.reasonOrderMissingTimeline'),
    ).toBe(true);
    const withoutData = composeAdminTriage(baseInput({ orders: [order('o7', 'confirmed')] }));
    expect(
      withoutData.some((i) => i.entityId === 'o7' && i.reasonKey === 'triage.reasonOrderMissingTimeline'),
    ).toBe(false);
  });

  it('delivered and cancelled are excluded from attention', () => {
    const items = composeAdminTriage(
      baseInput({
        orders: [order('o8', 'delivered', 'co-1'), order('o9', 'cancelled')],
        timelineCountByOrder: { o8: 0, o9: 0 },
      }),
    );
    expect(items.filter((i) => i.entityId === 'o8' || i.entityId === 'o9')).toEqual([]);
  });
});

describe('semantics', () => {
  it('is deterministic (same input, same output)', () => {
    const input = baseInput({
      operators: [op('pending', false)],
      orders: [order('o1', 'confirmed')],
    });
    expect(composeAdminTriage(input)).toEqual(composeAdminTriage(input));
  });

  it('uses fixed reason keys and existing destinations only', () => {
    const items = composeAdminTriage(
      baseInput({
        operators: [op('pending', false)],
        orders: [order('o1', 'confirmed')],
      }),
    );
    for (const i of items) {
      expect(i.reasonKey.startsWith('triage.')).toBe(true);
      expect(['pilot-admin', 'pilot-store-ops']).toContain(i.destination);
    }
  });

  it('never invents thresholds: severity derives from state only', () => {
    const items = composeAdminTriage(
      baseInput({
        operators: [op('active', true)],
        couriers: [co('active', true, 'co-1')],
        orders: [order('o1', 'out_for_delivery', 'co-1')],
        timelineCountByOrder: { o1: 1 },
        buyableCountByStore: { 'store-1': 2 },
      }),
    );
    expect(items.map((i) => i.severity)).toEqual(['watch']);
  });
});
