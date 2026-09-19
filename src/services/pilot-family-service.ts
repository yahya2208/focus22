/**
 * Family experience services (Gate C4) — server-authoritative family saved
 * basket ("مشتريات عائلتنا") and family purchase history.
 *
 * Both surfaces wrap SECURITY DEFINER RPCs added on Staging:
 *   - pilot_family_saved_add/list/update/remove/clear
 *   - pilot_family_orders()
 *
 * The family is always derived server-side from auth.uid(); no client-supplied
 * family_id anywhere. Price/stock/unit for saved items are the live
 * v_public_listings values returned by the RPC — never summed or stored here.
 */
import { getSupabaseClient } from '../core/supabase/client';

export interface FamilySavedItem {
  readonly id: string;
  readonly catalog_ref: string;
  readonly quantity: number;
  readonly name: string;
  readonly unit: string | null;
  readonly unit_price: number | null;
  readonly stock: number | null;
  readonly available: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FamilyOrderItem {
  readonly name: string;
  readonly quantity: number;
  readonly unit: string | null;
  readonly unit_price: number | null;
  readonly line_total: number | null;
}

export interface FamilyOrder {
  readonly order_id: string;
  readonly order_number: string;
  readonly status: string;
  readonly subtotal: number;
  readonly delivery_fee: number;
  readonly total: number;
  readonly store_name: string | null;
  readonly store_name_ar: string | null;
  readonly neighborhood_name: string | null;
  readonly neighborhood_name_ar: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly items: readonly FamilyOrderItem[];
}

type JsonRow = Record<string, unknown>;

function toSavedItem(row: JsonRow): FamilySavedItem {
  return row as unknown as FamilySavedItem;
}

function toOrder(row: JsonRow): FamilyOrder {
  return row as unknown as FamilyOrder;
}

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as R;
}

/** The caller's family saved basket, newest-listed first. Empty when unlinked. */
export async function fetchFamilySavedItems(): Promise<FamilySavedItem[]> {
  const data = await callRpc<unknown[]>('pilot_family_saved_list');
  return (data ?? []).map((row) => toSavedItem(row as JsonRow));
}

/** Add (or update quantity of) one item in the family saved basket. */
export async function saveFamilyItem(catalogRef: string, quantity: number): Promise<FamilySavedItem> {
  const data = await callRpc<JsonRow>('pilot_family_saved_add', {
    p_catalog_ref: catalogRef,
    p_quantity: quantity,
  });
  return toSavedItem(data);
}

/** Update the quantity of a saved item. */
export async function updateFamilySavedItem(catalogRef: string, quantity: number): Promise<void> {
  await callRpc('pilot_family_saved_update', { p_catalog_ref: catalogRef, p_quantity: quantity });
}

/** Remove one saved item from the family basket. */
export async function removeFamilySavedItem(catalogRef: string): Promise<void> {
  await callRpc('pilot_family_saved_remove', { p_catalog_ref: catalogRef });
}

/** Clear the whole family basket (repeat-purchase refresh). */
export async function clearFamilySavedItems(): Promise<void> {
  await callRpc('pilot_family_saved_clear');
}

/** The caller's family purchase history (server-scoped, newest first). */
export async function fetchFamilyOrders(): Promise<FamilyOrder[]> {
  const data = await callRpc<unknown[]>('pilot_family_orders');
  return (data ?? []).map((row) => toOrder(row as JsonRow));
}