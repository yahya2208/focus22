/**
 * Default used-phones inventory seed.
 *
 * Launch blocker (2026-08-05): used phones only appeared on origins where the
 * admin had manually added them (inventory is localStorage-scoped, one store
 * per browser origin). A freshly-opened published site was empty. This module
 * bundles a small realistic starting catalog and loads it ONCE, only when no
 * inventory exists yet — every origin (local AND published) starts with the
 * same used phones. The admin can edit, reprice, hide or delete every record
 * through the Inventory management page; the seed never overwrites data.
 */
import { InventoryService } from './inventory-service';

export interface SeedPhone {
  brand: string;
  model: string;
  /** Variant label in the same RAM/storage format the catalog uses, e.g. "8/256". */
  variant: string;
  condition: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
}

export const DEFAULT_INVENTORY_SEED: readonly SeedPhone[] = [
  { brand: 'Apple', model: 'iPhone 15 Pro', variant: '8/256', condition: 'Like New', quantity: 2, buyPrice: 175000, sellPrice: 199000 },
  { brand: 'Apple', model: 'iPhone 14', variant: '6/128', condition: 'Excellent', quantity: 2, buyPrice: 115000, sellPrice: 135000 },
  { brand: 'Apple', model: 'iPhone 13', variant: '4/128', condition: 'Good', quantity: 3, buyPrice: 85000, sellPrice: 105000 },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', variant: '12/512', condition: 'Like New', quantity: 2, buyPrice: 165000, sellPrice: 190000 },
  { brand: 'Samsung', model: 'Galaxy S22', variant: '8/128', condition: 'Excellent', quantity: 3, buyPrice: 75000, sellPrice: 90000 },
  { brand: 'Samsung', model: 'Galaxy A54', variant: '8/128', condition: 'Good', quantity: 4, buyPrice: 55000, sellPrice: 68000 },
  { brand: 'Xiaomi', model: 'Redmi Note 13', variant: '8/256', condition: 'Good', quantity: 4, buyPrice: 45000, sellPrice: 58000 },
  { brand: 'Xiaomi', model: 'Redmi 12', variant: '6/128', condition: 'Very Good', quantity: 3, buyPrice: 28000, sellPrice: 38000 },
];

/**
 * Populates the default used-phones catalog on first run only.
 * No-op when inventory already exists (never overwrites admin data).
 */
export function ensureInventorySeeded(): boolean {
  try {
    if (localStorage.getItem('catalog_inventory') !== null) return false;
    for (const phone of DEFAULT_INVENTORY_SEED) {
      InventoryService.addStock(
        phone.brand,
        phone.model,
        phone.variant,
        phone.quantity,
        phone.buyPrice,
        phone.sellPrice,
        'purchase',
        undefined,
        undefined,
        'seed',
        phone.condition,
      );
    }
    return true;
  } catch {
    return false;
  }
}
