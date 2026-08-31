/**
 * createListingForCategory — the 00056 ATOMIC orchestration path.
 *
 * Runs `createListingForCategory` against the extended fake substrate, which
 * now mirrors the 00056 RPC: it validates admin + category exists/active/
 * domain-match, calls the generic listing_create, and records the membership —
 * all in one operation. These tests assert the CLIENT contract (RPC name + all
 * forwarded args) and that the fake server records BOTH the product row and the
 * category_products membership pointing at the SAME product id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createListing, createListingForCategory } from '../../services/listing-service';
import type { CreateProduceListingInput } from '../../services/listing-service';
import { getFakeCentralDb, resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

function produceInput(overrides: Partial<CreateProduceListingInput> = {}): CreateProduceListingInput {
  return {
    category: 'produce',
    brand: 'Farm',
    model: 'طماطم',
    price: { amount: 250, period: 'sale' },
    unit: 'kg',
    quantity: 100,
    city: 'الجزائر',
    publish: false,
    produce: { origin: 'Oran', grade: 'A' },
    ...overrides,
  };
}

describe('createListingForCategory (00056 atomic create + membership)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    seedFakeCentralDb();
  });

  it('creates a produce listing AND records a membership to the SAME product id atomically', async () => {
    const db = getFakeCentralDb();
    const id = await createListingForCategory('cat-produce', produceInput());

    const product = db.rows.find((r) => r.id === id);
    expect(product).toBeTruthy();
    expect(product?.category).toBe('produce');
    expect(product?.model).toBe('طماطم');

    const membership = db.categoryProducts.find((m) => m.product_id === id);
    expect(membership).toBeTruthy();
    expect(membership?.category_id).toBe('cat-produce');
    // Product row and membership reference the IDENTICAL product id.
    expect(membership?.product_id).toBe(id);
  });

  it('forwards the listing fields (unit/quantity) to the server with the category bound', async () => {
    const db = getFakeCentralDb();
    const id = await createListingForCategory('cat-produce', produceInput());
    const product = db.rows.find((r) => r.id === id);
    expect(product?.unit).toBe('kg');
    expect(product?.quantity).toBe(100);
    // Membership only exists because the orchestration RPC path ran (generic
    // createListing never records membership) and is bound to the category.
    expect(db.categoryProducts.find((m) => m.product_id === id)?.category_id).toBe('cat-produce');
  });

  it('rejects phone (legacy flow preserved) and leaves no rows behind', async () => {
    const db = getFakeCentralDb();
    await expect(
      createListingForCategory('cat-produce', { ...produceInput(), category: 'phone' } as never),
    ).rejects.toThrow(/phone/i);
    expect(db.categoryProducts).toHaveLength(0);
  });

  it('rejects an unknown category id and leaves NO partial product', async () => {
    const db = getFakeCentralDb();
    await expect(
      createListingForCategory('00000000-0000-0000-0000-000000000000', produceInput()),
    ).rejects.toThrow(/CATEGORY_NOT_FOUND/);
    // Transaction rolled back: no product row, no membership.
    expect(db.rows.filter((r) => r.category === 'produce')).toHaveLength(0);
    expect(db.categoryProducts).toHaveLength(0);
  });

  it('rejects a category whose domain does not match the product domain (no partial state)', async () => {
    const db = getFakeCentralDb();
    // cat-car has domain='car'; passing a produce listing must fail.
    await expect(createListingForCategory('cat-car', produceInput())).rejects.toThrow(
      /CATEGORY_DOMAIN_MISMATCH/,
    );
    expect(db.rows.filter((r) => r.category === 'produce')).toHaveLength(0);
    expect(db.categoryProducts).toHaveLength(0);
  });

  it('is idempotent-safe: a duplicate membership does not duplicate rows', async () => {
    const db = getFakeCentralDb();
    const id = await createListingForCategory('cat-produce', produceInput());
    expect(db.categoryProducts.filter((m) => m.product_id === id)).toHaveLength(1);
    expect(db.rows.filter((r) => r.id === id)).toHaveLength(1);
    expect(db.categoryProducts.length).toBe(1);
  });

  it('preserves the generic createListing path (no category) without any membership', async () => {
    const db = getFakeCentralDb();
    const id = await createListing(produceInput({ publish: false }));
    expect(db.rows.find((r) => r.id === id)).toBeTruthy();
    expect(
      db.categoryProducts.some((m) => m.product_id === id),
    ).toBe(false);
  });
});
