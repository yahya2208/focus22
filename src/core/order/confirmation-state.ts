/**
 * Transient in-memory holder for the last placed order, consumed by the
 * OrderConfirmationScreen. Kept OUT of routeParams (strings only) so numeric
 * order data is not serialized into the URL. Cleared on read.
 */
import type { DeliveryOrderResult } from '../../services/delivery-service';

let pending: DeliveryOrderResult | null = null;

export function setPendingOrder(result: DeliveryOrderResult): void {
  pending = result;
}

export function takePendingOrder(): DeliveryOrderResult | null {
  const value = pending;
  pending = null;
  return value;
}

export function resetPendingOrder(): void {
  pending = null;
}
