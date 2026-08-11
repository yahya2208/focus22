import { useEffect, useState } from 'react';
import type { InventoryRecord } from '../services/inventory-service';
import {
  getCachedPublic,
  getInventoryReady,
  isUuid,
  subscribeCentralInventory,
} from '../services/inventory-central-service';

export interface ProductDetailsResult {
  device: InventoryRecord | null;
  notFound: boolean;
  loading: boolean;
}

/**
 * Re-reads the record from the central public cache by id (v5.1 §2.2). The
 * device id is carried via routeParams, never a heavy payload. `notFound` is
 * true when the id is absent / malformed / the record is gone / unpublished /
 * archived / out of stock (deleted or stale deep link) → the screen renders
 * PhoneNotFound (no blank page). `loading` stays true until the central
 * bootstrap has hydrated the public cache.
 */
export function useProductDetails(deviceId: string | undefined | null): ProductDetailsResult {
  const [ready, setReady] = useState<boolean>(() => getInventoryReady());
  const [result, setResult] = useState<ProductDetailsResult>({ device: null, notFound: false, loading: true });

  useEffect(() => {
    return subscribeCentralInventory(() => setReady(getInventoryReady()));
  }, []);

  useEffect(() => {
    if (!ready) {
      setResult({ device: null, notFound: false, loading: true });
      return;
    }
    if (!deviceId || !isUuid(deviceId)) {
      setResult({ device: null, notFound: true, loading: false });
      return;
    }
    const record = getCachedPublic().find((r) => r.id === deviceId) ?? null;
    setResult({ device: record, notFound: !record, loading: false });
  }, [deviceId, ready]);

  return result;
}
