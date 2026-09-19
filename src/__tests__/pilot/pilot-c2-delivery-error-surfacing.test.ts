/**
 * GATE C2 runtime regression — the RPC error code must reach the exact-match
 * classifier verbatim. The Arabic display wrapper used to mangle the server
 * code (e.g. `فشل إنشاء الطلب: FAMILY_ACCOUNT_REQUIRED`), which made every
 * pilot rejection classify as SERVER_ERROR in the app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
  auth: { getSession: vi.fn() },
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc, auth: mocks.auth })),
}));

import { createDeliveryOrder } from '../../services/delivery-service';
import { classifySubmissionError } from '../../services/order-service';

describe('delivery-service — coded RPC errors surface verbatim (GATE C2)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  const customer = { name: 'A', phone: '5', zoneId: 'z', address: 'a' };
  const items = [{ catalogRef: 'pilot:item-1', quantity: 1, name: 'Item', unitPrice: 549 }];

  it.each([
    ['FAMILY_ACCOUNT_REQUIRED', 'FAMILY_ACCOUNT_REQUIRED'],
    ['ZONE_NOT_ACTIVE', 'ZONE_NOT_ACTIVE'],
    ['DUPLICATE_ORDER', 'DUPLICATE_ORDER'],
    ['ITEM_NOT_FOUND', 'ITEMS_NOT_FOUND'],
    ['UNAUTHENTICATED', 'NEEDS_AUTHENTICATION'],
  ] as const)(
    'propagates %s verbatim so classifySubmissionError maps it to %s',
    async (raw, client) => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: raw } });
      const err = await createDeliveryOrder(customer, items, false).catch((e: unknown) => e);
      expect(err instanceof Error && err.message === raw).toBe(true);
      expect(classifySubmissionError(err)).toBe(client);
    },
  );

  it('keeps the friendly server summary for real transport errors (no false family match)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    const err = await createDeliveryOrder(customer, items, true).catch((e: unknown) => e);
    expect(classifySubmissionError(err)).toBe('SERVER_ERROR');
  });
});