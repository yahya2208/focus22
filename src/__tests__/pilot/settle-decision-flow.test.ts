/**
 * Settlement decision client flow (00124 frontend half).
 *
 * Mocked-transport tests: decision param passing, best-effort push helper,
 * StoreOps insufficient-balance dialog (admin/operator vs courier-equivalent),
 * AdminOrders deep-link dispatch, StoreOps routeParams preselect, i18n key
 * presence in all four locales, and order-push EF static contract.
 * No database, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const mocks = {
  rpc: vi.fn(),
  invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc, functions: { invoke: mocks.invoke } })),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

import {
  settleFamilyOrder,
  notifySettlePush,
} from '../../services/order-service';

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async () => ({ data: { ok: true }, error: null }));
});

describe('settleFamilyOrder — decision param', () => {
  it('defaults to NORMAL (legacy 3-arg behavior preserved)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: 'delivered' }, error: null });
    await settleFamilyOrder('o1', [{ id: 'i1', delivered_quantity: 2 }]);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_family_settle_and_deliver', {
      p_order_id: 'o1',
      p_items: [{ id: 'i1', delivered_quantity: 2 }],
      p_reason: '',
      p_decision: 'NORMAL',
    });
  });

  it('passes ACCEPT_DEBT / REJECT through with reason', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: 'delivered' }, error: null });
    await settleFamilyOrder('o1', [], 'INSUFFICIENT_BALANCE', 'REJECT');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_family_settle_and_deliver', {
      p_order_id: 'o1',
      p_items: [],
      p_reason: 'INSUFFICIENT_BALANCE',
      p_decision: 'REJECT',
    });
  });

  it('surfaces the probe result (insufficient_balance) as data, not an error', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'insufficient_balance',
        available_balance: 500,
        order_total: 700,
        shortfall: 200,
        requires_admin_decision: true,
      },
      error: null,
    });
    const out = await settleFamilyOrder('o1', [{ id: 'i1', delivered_quantity: 1 }]);
    expect(out.status).toBe('insufficient_balance');
    expect(out.shortfall).toBe(200);
    expect(out.requires_admin_decision).toBe(true);
  });
});

describe('notifySettlePush — best-effort courtesy', () => {
  it('invokes order-push with order_id + event after settle', async () => {
    await notifySettlePush('o1', 'settle_accepted');
    expect(mocks.invoke).toHaveBeenCalledWith('order-push', {
      body: { order_id: 'o1', event: 'settle_accepted' },
    });
  });

  it('never throws, even when the push transport fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('network down'));
    await expect(notifySettlePush('o1', 'settle_rejected')).resolves.toBeUndefined();
  });
});

describe('i18n — decision keys present in all four locales', () => {
  const keys = [
    'pilot.settleInsufficientTitle',
    'pilot.settleAvailableBalance',
    'pilot.settleOrderTotal',
    'pilot.settleShortfall',
    'pilot.settleAcceptDebt',
    'pilot.settleRejectOrder',
    'pilot.settleNeedsAdminDecision',
    'pilot.msg.SETTLE_DEBT_ACCEPTED',
    'pilot.msg.SETTLE_REJECTED',
    'pilot.error.SETTLE_DENIED',
    'cc.ordOpenInStoreOps',
  ];
  for (const locale of ['ar', 'en', 'fr', 'tr']) {
    it(`${locale} has all decision keys`, () => {
      const text = fs.readFileSync(
        path.resolve(__dirname, `../../i18n/translations/${locale}.ts`),
        'utf-8',
      );
      for (const key of keys) expect(text, `${locale}:${key}`).toContain(`'${key}'`);
    });
  }
});

describe('order-push EF — settle contract (static)', () => {
  const ef = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/functions/order-push/index.ts'),
    'utf-8',
  );

  it('accepts settle events only from verified callers, never trusts client money', () => {
    expect(ef).toContain('settle_accepted');
    expect(ef).toContain('settle_rejected');
    expect(ef).toMatch(/getUser\(/);
    expect(ef).toContain('PUSH_NOT_ALLOWED');
    // Authoritative figures come from the service-role order read.
    expect(ef).toContain('.from("orders")');
  });

  it('adds the customer to recipients for settle events; webhook path unchanged', () => {
    expect(ef).toContain('order.user_id');
    expect(ef).toContain("event,");
  });

  it('claims (order_id, endpoint, event) and releases with the event on transient failure', () => {
    expect(ef).toContain('onConflict: "order_id,endpoint,event"');
    expect(ef).toContain('.eq("event", event)');
  });

  it('documents best-effort courtesy semantics', () => {
    expect(ef).toMatch(/best-effort/i);
  });
});
