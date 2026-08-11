/**
 * Default used-phones inventory seed.
 *
 * ── CUTOVER NOTE 2026-08-11 ─────────────────────────────────────────────
 *  localStorage seeding is retired: inventory now lives in the central
 *  Supabase tables (see `src/services/inventory-central-service.ts` and
 *  `supabase/inventory-central/`). `ensureInventorySeeded()` is a NO-OP
 *  returning `false` — the central bootstrap (SQL apply + admin seeding) is
 *  the only seed path, and the admin Inventory page remains the editing
 *  surface. `DEFAULT_INVENTORY_SEED` is kept for reference/regression docs.
 * ─────────────────────────────────────────────────────────────────────────
 */

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
 * Retired seed hook (central cutover). Always a no-op: the central bootstrap
 * is the only seed path, and it never runs from the client runtime.
 */
export function ensureInventorySeeded(): boolean {
  return false;
}
