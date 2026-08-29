/**
 * Category-product membership service (00051).
 *
 * Binds products/listings to navigation categories. Public reads flow through
 * the SECURITY DEFINER RPC `category_products_for_category` (which joins to the
 * published-listings view so only buyer-visible products appear). Admin writes
 * go through the `category_products_admin_*` RPCs, each gated server-side by
 * the same `categories_is_admin()` used by 00050 — never a weaker check.
 */

import { getSupabaseClient } from '../core/supabase/client';
import {
  normalizeCategoryMember,
  normalizeCategoryMemberAdmin,
  type CategoryMember,
  type CategoryMemberAdmin,
  type CategoryMemberReorderItem,
} from '../core/categories/membership';

type Listener = () => void;

const listeners = new Set<Listener>();
let realtimeStarted = false;
let invalidation = 0;

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Subscribes to postgres_changes on `category_products` so admin membership
 * edits (assign / remove / reorder / active / featured) reflect on the public
 * category pages without a full refresh. Mirrors `categories-realtime`.
 */
export function startCategoryProductsRealtime(): void {
  if (realtimeStarted) return;
  realtimeStarted = true;
  try {
    getSupabaseClient()
      .channel('category-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'category_products' }, () => {
        invalidation += 1;
        notify();
      })
      .subscribe();
  } catch {
    // realtime unavailable — static refresh still works
  }
}

/** Monotonic revision bumped on every category_products change (used to re-fetch). */
export function getCategoryProductsInvalidation(): number {
  return invalidation;
}

export function subscribeCategoryProducts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears realtime listeners/state (used by tests and hot-reload). */
export function resetCategoryProductsRealtime(): void {
  listeners.clear();
  realtimeStarted = false;
  invalidation = 0;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(fn, args);
  if (error) {
    const message = error.message ?? String(error);
    if (/ADMIN_REQUIRED/i.test(message)) throw new Error('ADMIN_REQUIRED');
    if (/CATEGORY_NOT_FOUND/i.test(message)) throw new Error('CATEGORY_NOT_FOUND');
    if (/PRODUCT_NOT_FOUND/i.test(message)) throw new Error('PRODUCT_NOT_FOUND');
    if (/MEMBERSHIP_NOT_FOUND/i.test(message)) throw new Error('MEMBERSHIP_NOT_FOUND');
    throw new Error(message);
  }
  return data as T;
}

function coerceArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  return [];
}

/** Public: visible members of a category (active membership + published product). */
export async function getCategoryMembers(categoryId: string): Promise<CategoryMember[]> {
  const data = await rpc<unknown>('category_products_for_category', { p_category_id: categoryId });
  return coerceArray(data).map((row) => normalizeCategoryMember(row as never));
}

/** Admin: all memberships of a category (active or not), with domain. */
export async function adminListCategoryProducts(categoryId: string): Promise<CategoryMemberAdmin[]> {
  const data = await rpc<unknown>('category_products_admin_list', { p_category_id: categoryId });
  return coerceArray(data).map((row) => normalizeCategoryMemberAdmin(row as never));
}

/** Admin: assign products to a category (idempotent; unknown products rejected). */
export async function adminAssignProducts(
  categoryId: string,
  productIds: string[],
): Promise<number> {
  const data = await rpc<{ added?: number }>('category_products_admin_assign', {
    p_category_id: categoryId,
    p_product_ids: productIds,
  });
  return Number(data?.added ?? 0);
}

/** Admin: remove a product from a category. */
export async function adminRemoveProduct(categoryId: string, productId: string): Promise<boolean> {
  const ok = await rpc<boolean>('category_products_admin_remove', {
    p_category_id: categoryId,
    p_product_id: productId,
  });
  return Boolean(ok);
}

/** Admin: active/inactive membership (hides the product from the page without deleting). */
export async function adminSetMembershipActive(
  categoryId: string,
  productId: string,
  active: boolean,
): Promise<void> {
  await rpc('category_products_admin_set_active', {
    p_category_id: categoryId,
    p_product_id: productId,
    p_active: active,
  });
}

/** Admin: featured/unfeatured membership. */
export async function adminSetMembershipFeatured(
  categoryId: string,
  productId: string,
  featured: boolean,
): Promise<void> {
  await rpc('category_products_admin_set_featured', {
    p_category_id: categoryId,
    p_product_id: productId,
    p_featured: featured,
  });
}

/** Admin: apply an ordering array within a category. */
export async function adminReorderCategoryProducts(
  categoryId: string,
  items: CategoryMemberReorderItem[],
): Promise<void> {
  const p_items = items.map((it) => ({ product_id: it.productId, sort_order: it.sortOrder }));
  await rpc('category_products_admin_reorder', {
    p_category_id: categoryId,
    p_items,
  });
}
