import { InventoryService } from './inventory-service';
import type { InventoryRecord } from './inventory-service';

/**
 * M1 — resolves an ad `link` to a phone listing (Marketplace Mediator model).
 * A phone ad links to an internal deep link (`#/phone-details?device=<id>`);
 * clicking such an ad forwards to WhatsApp with the phone's contact message.
 * Any other link (external URL, other internal route, empty) is left untouched.
 */

export function extractAdDeviceId(link: string): string | null {
  if (!link) return null;
  const match = link.match(/[?#]device=([^&#\s]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

export function resolveAdDevice(link: string): InventoryRecord | null {
  const id = extractAdDeviceId(link);
  if (!id) return null;
  // Same availability contract as the phone-details page (useProductDetails).
  const device = InventoryService.getExchangeableDevices().find((r) => r.id === id);
  return device ?? null;
}
