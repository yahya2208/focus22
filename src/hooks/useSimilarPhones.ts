import { useMemo } from 'react';
import { InventoryService, type InventoryRecord } from '../services/inventory-service';

/**
 * Similar-phones horizontal carousel source (v5.1 §6): same `modelId` first,
 * then same brand+model family, exclude self, capped. When `device` is null
 * (not-found state) returns the top exchangeable devices (6).
 */
export function useSimilarPhones(device: InventoryRecord | null, limit = 8): InventoryRecord[] {
  return useMemo(() => {
    const all = InventoryService.getExchangeableDevices();
    if (!device) return all.slice(0, 6);

    const modelId = device.modelId.toLowerCase();
    const brand = device.brand.toLowerCase();

    const sameModel = all.filter(
      (r) => r.id !== device.id && r.modelId.toLowerCase() === modelId,
    );
    const sameBrand = all.filter(
      (r) =>
        r.id !== device.id &&
        r.modelId.toLowerCase() !== modelId &&
        r.brand.toLowerCase() === brand,
    );
    const rest = all.filter(
      (r) =>
        r.id !== device.id &&
        r.modelId.toLowerCase() !== modelId &&
        r.brand.toLowerCase() !== brand,
    );

    return [...sameModel, ...sameBrand, ...rest].slice(0, limit);
  }, [device, limit]);
}
