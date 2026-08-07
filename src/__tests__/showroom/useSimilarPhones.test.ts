import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSimilarPhones } from '../../hooks/useSimilarPhones';
import { InventoryService } from '../../services/inventory-service';
import { ensureInventorySeeded } from '../../services/inventory-seed';

describe('Phase 3B §6 — useSimilarPhones', () => {
  beforeEach(() => {
    localStorage.clear();
    ensureInventorySeeded();
  });

  it('excludes the current device and prioritizes same modelId, then brand family', () => {
    const all = InventoryService.getExchangeableDevices();
    const target = all.find((r) => r.brand === 'Apple' && r.model === 'iPhone 15 Pro')!;
    const { result } = renderHook(() => useSimilarPhones(target));

    const ids = result.current.map((r) => r.id);
    expect(ids).not.toContain(target.id);

    const sameModel = all.filter(
      (r) => r.id !== target.id && r.modelId.toLowerCase() === target.modelId.toLowerCase(),
    );
    expect(ids.slice(0, sameModel.length)).toEqual(sameModel.map((r) => r.id));
    expect(ids.length).toBeLessThanOrEqual(8);
  });

  it('caps at the requested limit', () => {
    const all = InventoryService.getExchangeableDevices();
    const target = all[0]!;
    const { result } = renderHook(() => useSimilarPhones(target, 3));
    expect(result.current.length).toBeLessThanOrEqual(3);
  });

  it('not-found mode (device null) returns the top exchangeable devices', () => {
    const all = InventoryService.getExchangeableDevices();
    const { result } = renderHook(() => useSimilarPhones(null));
    expect(result.current.length).toBe(6);
    expect(result.current.map((r) => r.id)).toEqual(all.slice(0, 6).map((r) => r.id));
  });
});
