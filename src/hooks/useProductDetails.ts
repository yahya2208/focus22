import { useEffect, useState } from 'react';
import { InventoryService, type InventoryRecord } from '../services/inventory-service';

export interface ProductDetailsResult {
  device: InventoryRecord | null;
  notFound: boolean;
}

/**
 * Re-reads the record from InventoryService by id (v5.1 §2.2). The device id is
 * carried via routeParams, never a heavy payload. `notFound` is true when the id
 * is absent OR the record is gone / unpublished / archived / out of stock
 * (deleted / stale deep link) → the screen renders PhoneNotFound (no blank page).
 */
export function useProductDetails(deviceId: string | undefined | null): ProductDetailsResult {
  const [result, setResult] = useState<ProductDetailsResult>({ device: null, notFound: false });

  useEffect(() => {
    if (!deviceId) {
      setResult({ device: null, notFound: true });
      return;
    }
    const record = InventoryService.getExchangeableDevices().find((r) => r.id === deviceId) ?? null;
    setResult({ device: record, notFound: !record });
  }, [deviceId]);

  return result;
}
