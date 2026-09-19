import type { ScreenName } from '../store/navigation';

/**
 * Admin triage composer (Gate 1 — READ-ONLY operational overview).
 *
 * Pure, deterministic, unit-testable: plain data in, triage items out. No
 * I/O, no RPC calls, no clock reads, no thresholds of any kind — staleness
 * is never inferred from time. Every item is traceable to an existing
 * backend state; severity follows workflow semantics only:
 *   action-required — a deterministic state with an existing safe Admin
 *     action available (approve / set-ready / advance-order).
 *   watch           — informational operational attention (no action taken).
 *   review          — anomaly/inconsistency needing inspection; the paired
 *     action is view-detail (open the existing screen), never a corrective
 *     write invented here.
 *
 * Missing-data rule: a condition that cannot be evaluated because its input
 * is absent (e.g. no timeline row fetched for an order) yields NO item — the
 * composer never implies fault from missing data.
 *
 * Dedup rule: each underlying condition emits at most one item per entity
 * (conditions are disjoint per entity type, except missing-timeline which is
 * a genuinely separate condition on the same order).
 *
 * Security: output drives UI visibility ONLY (navigation + reason text).
 * Backend authorization (RPC guards, RLS) is untouched and final.
 */

export type TriageSeverity = 'action-required' | 'watch' | 'review';

export type TriageEntityType = 'operator' | 'courier' | 'store' | 'order';

export type TriageActionKind =
  | 'approve-member'
  | 'set-ready'
  | 'advance-order'
  | 'view-detail';

export interface TriageAction {
  readonly kind: TriageActionKind;
  /** Existing i18n label key for the action button. */
  readonly labelKey: string;
}

export interface TriageItem {
  readonly entityType: TriageEntityType;
  readonly entityId: string;
  readonly severity: TriageSeverity;
  /** Existing i18n label key for the human reason (no invented wording). */
  readonly reasonKey: string;
  /** Plain operational detail (names/numbers already visible to Admin). */
  readonly detail: string;
  readonly relatedStoreId: string | null;
  readonly relatedOperatorId: string | null;
  readonly relatedCourierId: string | null;
  readonly relatedOrderId: string | null;
  readonly action: TriageAction;
  /** Existing route only — never a new screen. */
  readonly destination: ScreenName;
}

export interface TriageMember {
  readonly userId: string;
  readonly storeId: string;
  readonly name: string;
  readonly status: string;
  readonly operationalReady: boolean;
}

export interface TriageStore {
  readonly id: string;
  readonly name: string;
}

export interface TriageOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly storeId: string | null;
  readonly status: string;
  readonly courierUserId: string | null;
}

export interface TriageInput {
  readonly operators: readonly TriageMember[];
  readonly couriers: readonly TriageMember[];
  readonly stores: readonly TriageStore[];
  readonly orders: readonly TriageOrder[];
  /** Buyable-product counts keyed by store id; stores absent from the map are skipped. */
  readonly buyableCountByStore: Readonly<Record<string, number>>;
  /** Timeline event counts keyed by order id; orders absent from the map are skipped. */
  readonly timelineCountByOrder: Readonly<Record<string, number>>;
}

const TERMINAL_ORDER_STATUSES: ReadonlySet<string> = new Set([
  'delivered',
  'cancelled',
]);

function memberItems(
  kind: 'operator' | 'courier',
  members: readonly TriageMember[],
): TriageItem[] {
  return members.flatMap<TriageItem>((m) => {
    const base = {
      entityType: kind,
      entityId: m.userId,
      detail: m.name,
      relatedStoreId: m.storeId,
      relatedOperatorId: kind === 'operator' ? m.userId : null,
      relatedCourierId: kind === 'courier' ? m.userId : null,
      relatedOrderId: null,
      destination: 'pilot-admin' as ScreenName,
    };
    if (m.status === 'pending') {
      return [
        {
          ...base,
          severity: 'action-required' as const,
          reasonKey: 'triage.reasonPendingMember',
          action: { kind: 'approve-member' as const, labelKey: 'triage.approveMember' },
        },
      ];
    }
    if (m.status === 'active' && !m.operationalReady) {
      return [
        {
          ...base,
          severity: 'action-required' as const,
          reasonKey: 'triage.reasonNotReady',
          action: { kind: 'set-ready' as const, labelKey: 'triage.markReady' },
        },
      ];
    }
    if (m.status === 'active') return [];
    return [
      {
        ...base,
        severity: 'watch' as const,
        reasonKey: 'triage.reasonSuspendedMember',
        action: { kind: 'view-detail' as const, labelKey: 'triage.viewDetails' },
      },
    ];
  });
}

export function composeAdminTriage(input: TriageInput): TriageItem[] {
  const items: TriageItem[] = [];
  items.push(...memberItems('operator', input.operators));
  items.push(...memberItems('courier', input.couriers));

  const operationalByStore = new Set<string>();
  for (const m of [...input.operators, ...input.couriers]) {
    if (m.status === 'active' && m.operationalReady) {
      operationalByStore.add(m.storeId);
    }
  }
  const membersByStore = new Map<string, number>();
  for (const m of [...input.operators, ...input.couriers]) {
    membersByStore.set(m.storeId, (membersByStore.get(m.storeId) ?? 0) + 1);
  }
  for (const s of input.stores) {
    if (!operationalByStore.has(s.id)) {
      items.push({
        entityType: 'store',
        entityId: s.id,
        severity:
          (membersByStore.get(s.id) ?? 0) > 0 ? 'action-required' : 'review',
        reasonKey: 'triage.reasonStoreNoOperator',
        detail: s.name,
        relatedStoreId: s.id,
        relatedOperatorId: null,
        relatedCourierId: null,
        relatedOrderId: null,
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
        destination: 'pilot-store-ops',
      });
    }
    if (s.id in input.buyableCountByStore && input.buyableCountByStore[s.id] === 0) {
      items.push({
        entityType: 'store',
        entityId: s.id,
        severity: 'review',
        reasonKey: 'triage.reasonStoreNoProducts',
        detail: s.name,
        relatedStoreId: s.id,
        relatedOperatorId: null,
        relatedCourierId: null,
        relatedOrderId: null,
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
        destination: 'pilot-store-ops',
      });
    }
  }

  const activeCourierIds = new Set<string>();
  for (const c of input.couriers) {
    if (c.status === 'active') activeCourierIds.add(`${c.storeId}::${c.userId}`);
  }
  for (const o of input.orders) {
    if (TERMINAL_ORDER_STATUSES.has(o.status)) continue;
    const base = {
      entityType: 'order' as const,
      entityId: o.id,
      detail: o.orderNumber,
      relatedStoreId: o.storeId,
      relatedOperatorId: null,
      relatedCourierId: o.courierUserId,
      relatedOrderId: o.id,
      destination: 'pilot-store-ops' as ScreenName,
    };
    if (o.status === 'pending') {
      items.push({
        ...base,
        severity: 'action-required',
        reasonKey: 'triage.reasonOrderPending',
        action: { kind: 'advance-order', labelKey: 'triage.confirmOrder' },
      });
      continue;
    }
    if (o.status === 'confirmed') {
      items.push({
        ...base,
        severity: 'action-required',
        reasonKey: 'triage.reasonOrderConfirmed',
        action: { kind: 'advance-order', labelKey: 'triage.startPreparing' },
      });
      continue;
    }
    if (o.status === 'preparing' && !o.courierUserId) {
      items.push({
        ...base,
        severity: 'action-required',
        reasonKey: 'triage.reasonOrderPreparingUnassigned',
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
      });
      continue;
    }
    if (o.status === 'preparing') continue;
    if (o.status === 'out_for_delivery' && o.courierUserId) {
      items.push({
        ...base,
        severity: 'watch',
        reasonKey: 'triage.reasonOrderActiveDelivery',
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
      });
      continue;
    }
    if (o.status === 'out_for_delivery') {
      items.push({
        ...base,
        severity: 'review',
        reasonKey: 'triage.reasonOrderDrifted',
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
      });
      continue;
    }
    items.push({
      ...base,
      severity: 'review',
      reasonKey: 'triage.reasonOrderUnknownState',
      action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
    });
  }

  for (const o of input.orders) {
    if (TERMINAL_ORDER_STATUSES.has(o.status)) continue;
    if (!(o.id in input.timelineCountByOrder)) continue;
    if (input.timelineCountByOrder[o.id] === 0) {
      items.push({
        entityType: 'order',
        entityId: o.id,
        severity: 'review',
        reasonKey: 'triage.reasonOrderMissingTimeline',
        detail: o.orderNumber,
        relatedStoreId: o.storeId,
        relatedOperatorId: null,
        relatedCourierId: o.courierUserId,
        relatedOrderId: o.id,
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
        destination: 'pilot-store-ops',
      });
    }
    if (
      o.courierUserId &&
      o.storeId &&
      !activeCourierIds.has(`${o.storeId}::${o.courierUserId}`)
    ) {
      items.push({
        entityType: 'order',
        entityId: o.id,
        severity: 'review',
        reasonKey: 'triage.reasonOrderAssignmentReview',
        detail: o.orderNumber,
        relatedStoreId: o.storeId,
        relatedOperatorId: null,
        relatedCourierId: o.courierUserId,
        relatedOrderId: o.id,
        action: { kind: 'view-detail', labelKey: 'triage.viewDetails' },
        destination: 'pilot-store-ops',
      });
    }
  }

  return items;
}
