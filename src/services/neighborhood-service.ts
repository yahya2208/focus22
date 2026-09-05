/**
 * Neighborhood Pilot — storefront + admin domain service (Phases 1-4, 9).
 *
 * Wraps the canonical read/write RPCs created in 00065. Public reads are
 * anonymous-safe and cached; admin writes call the admin RPCs whose server
 * half re-authorizes with `fn_admin_uid()`. Store operators use the order
 * RPCs from `order-service` (Phase 7). No direct table access.
 */
import { getSupabaseClient } from '../core/supabase/client';

export type PilotStatus = 'active' | 'inactive' | 'archived';

export interface Neighborhood {
  readonly id: string;
  readonly name: string;
  readonly name_ar: string;
  readonly slug: string;
  readonly status: PilotStatus;
  readonly description: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Store {
  readonly id: string;
  readonly neighborhood_id: string;
  readonly name: string;
  readonly name_ar: string;
  readonly slug: string;
  readonly status: PilotStatus;
  readonly operator_user_id: string | null;
  readonly description: string;
  readonly contact_phone: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FamilyGroup {
  readonly id: string;
  readonly name: string;
  readonly name_ar: string;
  readonly slug: string;
  readonly status: 'active' | 'inactive';
  readonly description: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PilotProduct {
  readonly id: string;
  readonly model_id: string;
  readonly brand: string;
  readonly model: string;
  readonly variant: string;
  readonly condition: string;
  readonly quantity: number;
  readonly status: string;
  readonly sell_price: number | null;
  readonly is_published: boolean;
  readonly city: string | null;
  readonly description: string | null;
  readonly source_key: string | null;
}

type PilotRow = Record<string, unknown>;

function toNeighborhood(row: PilotRow): Neighborhood {
  return row as unknown as Neighborhood;
}
function toStore(row: PilotRow): Store {
  return row as unknown as Store;
}
function toFamily(row: PilotRow): FamilyGroup {
  return row as unknown as FamilyGroup;
}
function toProduct(row: PilotRow): PilotProduct {
  return row as unknown as PilotProduct;
}

export function isPilotMarked(row: { slug?: string; source_key?: string | null } | null | undefined): boolean {
  if (!row) return false;
  return (row.slug ?? '').startsWith('pilot-') || (row.source_key ?? '').startsWith('pilot:');
}

const UNEXPECTED = 'UNEXPECTED_RESPONSE';

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) {
    const code =
      (error.message ?? '').includes('PERMISSION_DENIED')
        ? 'PERMISSION_DENIED'
        : (error.code as string) || 'RPC_ERROR';
    throw new Error(code);
  }
  if (data === null || data === undefined) throw new Error(UNEXPECTED);
  return data as R;
}

/* ————————————————————— public storefront ————————————————————— */

export async function fetchActiveNeighborhoods(): Promise<Neighborhood[]> {
  const data = await callRpc<unknown[]>('pilot_active_neighborhoods');
  return data.map((row) => toNeighborhood(row as PilotRow));
}

export async function fetchActiveStores(neighborhoodId: string): Promise<Store[]> {
  return (await callRpc<unknown[]>('pilot_active_stores', { p_neighborhood_id: neighborhoodId })).map(
    (row) => toStore(row as PilotRow),
  );
}

export async function fetchStoreProducts(storeId: string): Promise<PilotProduct[]> {
  return (await callRpc<unknown[]>('pilot_store_products', { p_store_id: storeId })).map(
    (row) => toProduct(row as PilotRow),
  );
}

/** Stores the caller operates (admin sees all active) — 00068 store-ops entry. */
export async function fetchMyStores(): Promise<Store[]> {
  return (await callRpc<unknown[]>('pilot_my_stores')).map((row) => toStore(row as PilotRow));
}

export async function fetchNeighborhoodFamilies(neighborhoodId: string): Promise<FamilyGroup[]> {
  return (await callRpc<unknown[]>('pilot_neighborhood_families', { p_neighborhood_id: neighborhoodId })).map(
    (row) => toFamily(row as PilotRow),
  );
}

/* ————————————————————— admin (Phase 9) ————————————————————— */

export async function adminListNeighborhoods(): Promise<Neighborhood[]> {
  const data = await callRpc<unknown[]>('pilot_admin_list_neighborhoods');
  return data.map((row) => toNeighborhood(row as PilotRow));
}

export async function adminListStores(neighborhoodId: string): Promise<Store[]> {
  return (await callRpc<unknown[]>('pilot_admin_list_stores', { p_neighborhood_id: neighborhoodId })).map(
    (row) => toStore(row as PilotRow),
  );
}

export async function adminListFamilies(): Promise<FamilyGroup[]> {
  return (await callRpc<unknown[]>('pilot_admin_list_families')).map((row) => toFamily(row as PilotRow));
}

export interface UpsertResult {
  readonly id: string;
  readonly slug: string;
}

export async function adminUpsertNeighborhood(input: {
  name: string;
  name_ar?: string;
  slug: string;
  status?: string;
}): Promise<UpsertResult> {
  return callRpc<UpsertResult>('pilot_admin_upsert_neighborhood', {
    p_name: input.name,
    p_name_ar: input.name_ar ?? '',
    p_slug: input.slug,
    p_status: input.status ?? 'active',
  });
}

export async function adminUpsertStore(input: {
  neighborhood_id: string;
  name: string;
  name_ar?: string;
  slug: string;
  status?: string;
  operator_user_id?: string | null;
}): Promise<UpsertResult> {
  return callRpc<UpsertResult>('pilot_admin_upsert_store', {
    p_neighborhood_id: input.neighborhood_id,
    p_name: input.name,
    p_name_ar: input.name_ar ?? '',
    p_slug: input.slug,
    p_status: input.status ?? 'active',
    p_operator_user_id: input.operator_user_id ?? null,
  });
}

export async function adminSetStoreInventory(storeId: string, inventoryIds: string[]): Promise<void> {
  await callRpc('pilot_admin_set_store_inventory', { p_store_id: storeId, p_inventory_ids: inventoryIds });
}

export async function adminUpsertFamily(input: {
  name: string;
  name_ar?: string;
  slug: string;
  description?: string;
}): Promise<UpsertResult> {
  return callRpc<UpsertResult>('pilot_admin_upsert_family', {
    p_name: input.name,
    p_name_ar: input.name_ar ?? '',
    p_slug: input.slug,
    p_description: input.description ?? '',
  });
}

export async function adminLinkFamily(neighborhoodId: string, familyId: string, linked: boolean): Promise<void> {
  await callRpc('pilot_admin_link_family', {
    p_neighborhood_id: neighborhoodId,
    p_family_id: familyId,
    p_linked: linked,
  });
}

/* ————————————————————— operator approval (00070) ————————————————————— */

export type OperatorStatus = 'pending' | 'active' | 'suspended';

export interface OperatorMembership {
  readonly id: string;
  readonly store_id: string;
  readonly user_id: string;
  readonly status: OperatorStatus;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly user_email?: string | null;
  readonly user_name?: string | null;
}

function toOperator(row: Record<string, unknown>): OperatorMembership {
  return row as unknown as OperatorMembership;
}

/** Admin approve / pending / suspend a store operator (00070). */
export async function adminSetOperatorStatus(
  storeId: string,
  userId: string,
  status: OperatorStatus,
): Promise<void> {
  await callRpc('pilot_admin_set_operator_status', {
    p_store_id: storeId,
    p_user_id: userId,
    p_status: status,
  });
}

/** Admin list store operators for a store (or all when omitted) — 00070. */
export async function adminListOperators(storeId?: string): Promise<OperatorMembership[]> {
  const data = await callRpc<unknown[]>(
    'pilot_admin_list_operators',
    storeId ? { p_store_id: storeId } : {},
  );
  return (data ?? []).map((row) => toOperator(row as Record<string, unknown>));
}