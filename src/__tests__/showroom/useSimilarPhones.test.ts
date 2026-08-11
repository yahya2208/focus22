import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSimilarPhones } from '../../hooks/useSimilarPhones';
import { InventoryService } from '../../services/inventory-service';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

describe('useSimilarPhones (central seed drives the carousel)', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    await bootstrapCentralInventory();
  });

  it('returns up to 8 similar phones (matching model or brand) excluding the current record', async () => {
    const target = InventoryService.getExchangeableDevices().find((r) => r.brand === 'Samsung')!;

    const { result } = renderHook(() => useSimilarPhones(target));
    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
      expect(result.current.length).toBeLessThanOrEqual(8);
    });

    expect(result.current.every((r) => r.id !== target.id)).toBe(true);

    const pool = InventoryService.getExchangeableDevices();
    expect(result.current.every((r) => pool.some((p) => p.id === r.id))).toBe(true);

    // same-model/same-brand candidates are ranked first (carousel priority)
    const samsungs = pool.filter((r) => r.brand === 'Samsung' && r.id !== target.id);
    if (samsungs.length > 0) {
      const first = result.current[0]!;
      expect(first.brand === 'Samsung' || first.model === target.model).toBe(true);
    }
  });

  it('null/unknown device → not-found carousel fallback (up to 6 devices, no crash)', async () => {
    const { result } = renderHook(() => useSimilarPhones(null));
    await waitFor(() => expect(result.current.length).toBe(6));

    expect(result.current.length).toBe(6);
  });
});
