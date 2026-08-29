/**
 * Category domain model (00050).
 *
 * The Home navigation sidebar and every category landing page render
 * EXCLUSIVELY from `public.categories` (DB-driven — nothing is hard-coded in
 * the client). Rows come back flat (one SELECT, RLS-filtered); the service
 * assembles the parent/child tree in `CategoryNode`.
 */

export type CategoryDisplayMode = 'storefront' | 'phones' | 'games';

export type CategoryTheme = 'fresh' | 'technology' | 'premium' | 'playful' | 'elegant' | 'warm' | 'minimal';

export const CATEGORY_THEMES: readonly CategoryTheme[] = [
  'fresh',
  'technology',
  'premium',
  'playful',
  'elegant',
  'warm',
  'minimal',
] as const;

export const CATEGORY_DISPLAY_MODES: readonly CategoryDisplayMode[] = [
  'storefront',
  'phones',
  'games',
] as const;

export function isCategoryTheme(value: string): value is CategoryTheme {
  return (CATEGORY_THEMES as readonly string[]).includes(value);
}

export function isCategoryDisplayMode(value: string): value is CategoryDisplayMode {
  return (CATEGORY_DISPLAY_MODES as readonly string[]).includes(value);
}

/** snake_case row as returned by Supabase (public.categories). */
export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  icon: string;
  cover_image: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  display_mode: string;
  theme: string;
  delivery_available: boolean;
  is_featured: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Client model (camelCase mirror of CategoryRow). */
export interface Category {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  coverImage: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  displayMode: CategoryDisplayMode;
  theme: CategoryTheme;
  deliveryAvailable: boolean;
  isFeatured: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Tree node assembled by the service (roots with nested children). */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

/** Input payload for admin create/update (keys map to the RPC/JSONB contract). */
export interface CategoryAdminInput {
  slug?: string;
  name?: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  icon?: string;
  coverImage?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  displayMode?: CategoryDisplayMode;
  theme?: CategoryTheme;
  deliveryAvailable?: boolean;
  isFeatured?: boolean;
}

export function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.name_ar ?? '',
    description: row.description ?? '',
    descriptionAr: row.description_ar ?? '',
    icon: row.icon ?? '',
    coverImage: row.cover_image ?? '',
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active ?? true,
    displayMode: isCategoryDisplayMode(row.display_mode) ? row.display_mode : 'storefront',
    theme: isCategoryTheme(row.theme) ? row.theme : 'technology',
    deliveryAvailable: row.delivery_available ?? false,
    isFeatured: row.is_featured ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Localized label/description helper (category rows carry bilingual text). */
export function localizedText(ar: string, en: string, locale: string): string {
  if (locale === 'ar' && ar && ar.trim() !== '') return ar;
  return en;
}