/**
 * Categories service — DB-driven navigation for the multi-service platform
 * (00050). Single source of truth: the `categories` table. The service loads
 * the flat rows, assembles the parent/child tree, caches it, and subscribes
 * to Realtime so admin edits (create/update/status/reorder) propagate to every
 * visitor without a rebuild. No hardcoded category list anywhere.
 *
 * Public reads hit RLS (`is_active = TRUE`). Admin writes go through the
 * SECURITY DEFINER RPCs (categories_admin_*). The exact same service powers
 * the Home sidebar and the Admin Categories screen.
 */

import { getSupabaseClient } from '../core/supabase/client';
import {
  rowToCategory,
  localizedText,
  type Category,
  type CategoryNode,
  type CategoryRow,
  type CategoryAdminInput,
} from '../core/categories/types';

export type { Category, CategoryNode } from '../core/categories/types';

const CATEGORIES_TABLE = 'categories';

type Listener = () => void;

let cache: CategoryNode[] | null = null;
let flatCache: Category[] = [];
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
let realtimeStarted = false;

function sortByOrder<T extends Category>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Assembles the parent/child tree (roots + nested children, ordered). */
function buildTree(rows: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const row of sortByOrder(rows)) {
    byId.set(row.id, { ...row, children: [] });
  }
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of byId.values()) {
    node.children = sortByOrder(node.children);
  }
  return sortByOrder(roots);
}

function flatten(nodes: CategoryNode[]): Category[] {
  const out: Category[] = [];
  for (const node of nodes) {
    out.push(node);
    out.push(...flatten(node.children));
  }
  return out;
}

function publicImageUrl(path: string): string {
  if (!path || !path.trim()) return '';
  if (/^https?:\/\//i.test(path.trim())) return path.trim();
  try {
    const { data } = getSupabaseClient().storage.from('category-covers').getPublicUrl(path.trim());
    return data.publicUrl;
  } catch {
    return '';
  }
}

export function normalizeCategoryRow(row: CategoryRow | Category): Category {
  // Tolerate already-camelCase rows (defensive — RPCs may return either shape).
  const r = row as unknown as Record<string, unknown>;
  return rowToCategory({
    id: String(r.id ?? ''),
    slug: String(r.slug ?? ''),
    name: String(r.name ?? ''),
    name_ar: String(r.name_ar ?? r.nameAr ?? ''),
    description: String(r.description ?? ''),
    description_ar: String(r.description_ar ?? ''),
    icon: String(r.icon ?? ''),
    cover_image: String(r.cover_image ?? r.coverImage ?? ''),
    parent_id: (r.parent_id ?? r.parentId ?? null) as string | null,
    sort_order: Number(r.sort_order ?? r.sortOrder ?? 0),
    is_active: Boolean(r.is_active ?? r.isActive ?? true),
    display_mode: String(r.display_mode ?? r.displayMode ?? 'storefront'),
    theme: String(r.theme ?? 'technology'),
    delivery_available: Boolean(r.delivery_available ?? r.deliveryAvailable ?? false),
    is_featured: Boolean(r.is_featured ?? r.isFeatured ?? false),
    created_at: r.created_at != null ? String(r.created_at) : undefined,
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  });
}

async function fetchCategories(): Promise<CategoryNode[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from(CATEGORIES_TABLE)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data) return [];
    const rows = (data as Array<CategoryRow | Category>).map(normalizeCategoryRow);
    const withCovers = rows.map((cat) => ({ ...cat, coverImage: publicImageUrl(cat.coverImage) }));
    return buildTree(withCovers);
  } catch {
    return []; // table not created yet — render nothing
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export async function refreshCategories(): Promise<void> {
  try {
    cache = await fetchCategories();
    flatCache = flatten(cache);
  } catch {
    cache = cache ?? [];
    flatCache = cache ? flatten(cache) : [];
  }
  notify();
}

function startRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  try {
    getSupabaseClient()
      .channel('categories-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: CATEGORIES_TABLE }, () => {
        loadPromise = null;
        refreshCategories().catch(() => {});
      })
      .subscribe();
  } catch {
    // realtime unavailable — static refresh still works
  }
}

/** Ensures the tree is loaded at least once (idempotent, mirrors ads). */
export function ensureCategoriesLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = refreshCategories().then(() => {
      startRealtime();
    });
  }
  return loadPromise;
}

/** Clears the module cache (used by tests and hot-reload). */
export function resetCategoriesService(): void {
  cache = null;
  flatCache = [];
  loadPromise = null;
  listeners.clear();
  realtimeStarted = false;
}

export function getCategoryTree(): CategoryNode[] | null {
  return cache;
}

export function getCategories(): CategoryNode[] {
  return cache ?? [];
}

export function getAllCategories(): Category[] {
  return flatCache;
}

/** Top-level categories for the Home sidebar (ordered, active only). */
export function getTopLevelCategories(): CategoryNode[] {
  return getCategories();
}

export function getCategoryBySlug(slug: string): Category | undefined {
  const target = slug.toLowerCase();
  return flatCache.find((cat) => cat.slug === target);
}

export function getCategoryById(id: string): Category | undefined {
  return flatCache.find((cat) => cat.id === id);
}

export function getChildren(parentId: string): CategoryNode[] {
  return getCategories().flatMap((root) => collectChildren(root, parentId));
}

function collectChildren(node: CategoryNode, targetId: string): CategoryNode[] {
  if (node.id === targetId) return node.children;
  for (const child of node.children) {
    const found = collectChildren(child, targetId);
    if (found.length > 0) return found;
  }
  return [];
}

export function getCategoryParent(cat: Category): Category | undefined {
  return cat.parentId ? flatCache.find((c) => c.id === cat.parentId) : undefined;
}

export function getCategoryLabel(cat: Category, locale: string): string {
  return localizedText(cat.nameAr, cat.name, locale);
}

export function getCategoryDescription(cat: Category, locale: string): string {
  return localizedText(cat.descriptionAr, cat.description, locale);
}

export function subscribeCategories(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Admin writes (RLS + SECURITY DEFINER RPCs, admin/super_admin only)
// ---------------------------------------------------------------------------

function toRpcJson(input: CategoryAdminInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.name !== undefined) out.name = input.name;
  if (input.nameAr !== undefined) out.name_ar = input.nameAr;
  if (input.description !== undefined) out.description = input.description;
  if (input.descriptionAr !== undefined) out.description_ar = input.descriptionAr;
  if (input.icon !== undefined) out.icon = input.icon;
  if (input.coverImage !== undefined) out.cover_image = input.coverImage;
  if (input.parentId !== undefined) out.parent_id = input.parentId;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  if (input.displayMode !== undefined) out.display_mode = input.displayMode;
  if (input.theme !== undefined) out.theme = input.theme;
  if (input.deliveryAvailable !== undefined) out.delivery_available = input.deliveryAvailable;
  if (input.isFeatured !== undefined) out.is_featured = input.isFeatured;
  return out;
}

function rpcRow(data: unknown): Category | null {
  try {
    return normalizeCategoryRow(toRpcRow(data));
  } catch {
    return null;
  }
}

function invalidateReload(): Promise<void> {
  loadPromise = null;
  return refreshCategories();
}

/** Creates a category via categories_admin_create (snake_case JSONB payload). */
export async function adminCreateCategory(input: CategoryAdminInput): Promise<Category | null> {
  const { data, error } = await getSupabaseClient().rpc('categories_admin_create', {
    p_category: toRpcJson(input),
  });
  if (error) throw new Error(`فشل إنشاء التصنيف: ${error.message}`);
  await invalidateReload();
  return rpcRow(toRpcRow(data));
}

/** Partial update via categories_admin_update. Only provided keys change. */
export async function adminUpdateCategory(id: string, changes: CategoryAdminInput): Promise<Category | null> {
  const { data, error } = await getSupabaseClient().rpc('categories_admin_update', {
    p_id: id,
    p_changes: toRpcJson(changes),
  });
  if (error) throw new Error(`فشل تحديث التصنيف: ${error.message}`);
  await invalidateReload();
  return rpcRow(toRpcRow(data));
}

export async function adminDeleteCategory(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('categories_admin_delete', { p_id: id });
  if (error) throw new Error(`فشل حذف التصنيف: ${error.message}`);
  await invalidateReload();
  return Boolean(data);
}

export async function adminSetCategoryStatus(id: string, isActive: boolean): Promise<Category | null> {
  const { data, error } = await getSupabaseClient().rpc('categories_admin_set_status', {
    p_id: id,
    p_active: isActive,
  });
  if (error) throw new Error(`فشل تحديث حالة التصنيف: ${error.message}`);
  await invalidateReload();
  return rpcRow(toRpcRow(data));
}

/** Applies an ordering array [{id, sortOrder}] via categories_admin_reorder. */
export async function adminReorderCategories(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
  const p_items = items.map((item) => ({ id: item.id, sort_order: item.sortOrder }));
  const { error } = await getSupabaseClient().rpc('categories_admin_reorder', { p_items });
  if (error) throw new Error(`فشل ترتيب التصنيفات: ${error.message}`);
  await invalidateReload();
}

/**
 * RPCs return the row as a JSON string when the projection is a jsonb scalar;
 * this unwraps the common shapes defensively.
 */
function toRpcRow(data: unknown): CategoryRow {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as CategoryRow;
    } catch {
      /* fall through */
    }
  }
  return (data ?? {}) as CategoryRow;
}