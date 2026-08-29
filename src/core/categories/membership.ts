/**
 * Category-product membership model (00051).
 *
 * Binds a PRODUCT/LISTING (phone | car | property — all share
 * `inventory_items.id` as the canonical identity) to a navigation category.
 * One row = one product in one category; a product may belong to many
 * categories and a category may hold many products.
 */

export type CategoryProductDomain = 'phone' | 'car' | 'property' | 'produce';

/** Public, visible member row returned by category_products_for_category. */
export interface CategoryMember {
  categoryId: string;
  productId: string;
  sortOrder: number;
  isFeatured: boolean;
  domain: CategoryProductDomain;
  brand: string;
  model: string;
  price?: number | null;
  pricePeriod?: string;
  images?: string[];
}

/** Admin member row (includes membership-active + inventory state). */
export interface CategoryMemberAdmin extends CategoryMember {
  membershipId: string;
  membershipActive: boolean;
  quantity?: number;
  status?: string;
  isPublished?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Ordering payload for admin reorder. */
export interface CategoryMemberReorderItem {
  productId: string;
  sortOrder: number;
}

/** snake_case row from the RPC (defensive normalization). */
export interface CategoryMemberRow {
  category_id: string;
  product_id: string;
  sort_order: number;
  is_featured: boolean;
  domain: string;
  brand: string;
  model: string;
  price?: number | null;
  price_period?: string;
  images?: string[];
}

export interface CategoryMemberAdminRow extends CategoryMemberRow {
  membership_id: string;
  membership_active: boolean;
  quantity?: number;
  status?: string;
  is_published?: boolean;
  created_at: string;
  updated_at: string;
}

export function isCategoryProductDomain(value: string | undefined | null): value is CategoryProductDomain {
  return value === 'phone' || value === 'car' || value === 'property' || value === 'produce';
}

export function normalizeCategoryMember(row: CategoryMemberRow): CategoryMember {
  return {
    categoryId: String(row.category_id ?? ''),
    productId: String(row.product_id ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    isFeatured: Boolean(row.is_featured ?? false),
    domain: isCategoryProductDomain(row.domain) ? row.domain : 'phone',
    brand: String(row.brand ?? ''),
    model: String(row.model ?? ''),
    price: row.price != null ? Number(row.price) : null,
    pricePeriod: row.price_period ?? undefined,
    images: Array.isArray(row.images) ? row.images : undefined,
  };
}

export function normalizeCategoryMemberAdmin(row: CategoryMemberAdminRow): CategoryMemberAdmin {
  return {
    ...normalizeCategoryMember(row),
    membershipId: String(row.membership_id ?? ''),
    membershipActive: Boolean(row.membership_active ?? false),
    quantity: row.quantity != null ? Number(row.quantity) : undefined,
    status: row.status ?? undefined,
    isPublished: row.is_published,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}
