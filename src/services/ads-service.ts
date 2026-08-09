/**
 * Internal ads service — placement-driven banners backed by Supabase.
 *
 * Single source of truth: the `ads` table
 * (see supabase/migrations/00015_ads_tables.sql). Images live in the
 * `ads-images` storage bucket (public read). AdSpot renders the current config
 * and subscribes to Realtime so admin edits propagate to every visitor without
 * a rebuild. No localStorage, no public/ads.json.
 */

import { getSupabaseClient } from '../core/supabase/client';

export type AdPlacement = 'home' | 'phones' | 'repair' | 'results' | 'exchange' | 'phone-details' | 'showroom';

/**
 * Every ad surface has a unique placement key (F-102): the Showroom listing
 * surface uses `showroom` and the phone-details surface uses `phone-details`.
 * Note: a new placement key produces no visible ad until a corresponding
 * active `ads` row exists for it.
 */
export const AD_PLACEMENTS: readonly AdPlacement[] = [
  'home',
  'phones',
  'repair',
  'results',
  'exchange',
  'phone-details',
  'showroom',
];

export interface AdConfig {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
}

interface AdRow {
  placement: AdPlacement;
  enabled: boolean;
  image_path: string;
  image_url: string;
  link: string;
  alt: string;
}

export interface AdRowInput {
  placement: AdPlacement;
  enabled: boolean;
  image_path?: string;
  image_url?: string;
  link?: string;
  alt?: string;
}

const ADS_BUCKET = 'ads-images';

type Listener = () => void;

let cache: Record<AdPlacement, AdConfig> | null = null;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
let realtimeStarted = false;

function emptyMap(): Record<AdPlacement, AdConfig> {
  const result = {} as Record<AdPlacement, AdConfig>;
  for (const p of AD_PLACEMENTS) result[p] = { enabled: false, image: '', link: '', alt: '' };
  return result;
}

function publicImageUrl(path: string): string {
  if (!path || !path.trim()) return '';
  try {
    const { data } = getSupabaseClient().storage.from(ADS_BUCKET).getPublicUrl(path.trim());
    return data.publicUrl;
  } catch {
    return '';
  }
}

/**
 * F-204 — a banner config must never intentionally resolve to a broken
 * non-empty image. Only absolute http(s) URLs are treated as usable;
 * anything else (empty, whitespace, malformed, non-http) is rejected so the
 * config falls through to the storage-path resolution or stays empty.
 * No network request is made to validate existence.
 */
function isValidImageUrl(value: string): boolean {
  if (!value || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function rowToConfig(row: AdRow): AdConfig {
  const imageUrl = isValidImageUrl(row.image_url) ? row.image_url : '';
  return {
    enabled: row.enabled,
    image: imageUrl || publicImageUrl(row.image_path),
    link: row.link,
    alt: row.alt,
  };
}

async function fetchAds(): Promise<Record<AdPlacement, AdConfig>> {
  const result = emptyMap();
  try {
    const { data, error } = await getSupabaseClient().from('ads').select('*');
    if (error || !data) return result; // table not created yet — render nothing
    for (const row of data as AdRow[]) {
      if (row.placement in result) result[row.placement] = rowToConfig(row);
    }
  } catch {
    // ignore — same as missing table
  }
  return result;
}

function notify() {
  for (const listener of listeners) listener();
}

export async function refreshAds(): Promise<void> {
  try {
    cache = await fetchAds();
  } catch {
    cache = cache ?? emptyMap();
  }
  notify();
}

function startRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  try {
    getSupabaseClient()
      .channel('ads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ads' }, () => {
        loadPromise = null;
        refreshAds().catch(() => {});
      })
      .subscribe();
  } catch {
    // realtime unavailable — static refresh still works
  }
}

export function ensureAdsLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = refreshAds().then(() => {
      startRealtime();
    });
  }
  return loadPromise;
}

/**
 * Clears the module cache (used by tests and hot-reload).
 */
export function resetAdsService(): void {
  cache = null;
  loadPromise = null;
  listeners.clear();
  realtimeStarted = false;
}

export function getAds(): Record<AdPlacement, AdConfig> | null {
  return cache;
}

export function getAd(placement: AdPlacement): AdConfig | null {
  return cache?.[placement] ?? null;
}

export function subscribeAds(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Admin writes (RLS restricts to admin/super_admin)
// ---------------------------------------------------------------------------

/**
 * Compress + upload an ad image to the ads-images bucket.
 * Returns the storage path and the public URL.
 */
export async function uploadAdImage(placement: AdPlacement, file: Blob): Promise<{ path: string; url: string }> {
  const path = `ads/${placement}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const client = getSupabaseClient();
  const { error } = await client.storage.from(ADS_BUCKET).upload(path, file, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`فشل رفع الصورة: ${error.message}`);
  const url = publicImageUrl(path);
  return { path, url };
}

export async function saveAd(input: AdRowInput): Promise<void> {
  const { error } = await getSupabaseClient().from('ads').upsert({
    placement: input.placement,
    enabled: input.enabled,
    image_path: input.image_path ?? '',
    image_url: input.image_url ?? '',
    link: input.link ?? '',
    alt: input.alt ?? '',
  });
  if (error) throw new Error(`فشل حفظ الإعلان: ${error.message}`);
  loadPromise = null;
  await refreshAds();
}

export async function resetAd(placement: AdPlacement): Promise<void> {
  const client = getSupabaseClient();
  let path: string | undefined;
  try {
    const { data } = await client.from('ads').select('image_path').eq('placement', placement).maybeSingle();
    path = data?.image_path;
  } catch {
    // ignore read failure — proceed with delete
  }
  const { error } = await client.from('ads').delete().eq('placement', placement);
  if (error) throw new Error(`فشل إعادة تعيين الإعلان: ${error.message}`);
  if (path) {
    await client.storage.from(ADS_BUCKET).remove([path]).catch(() => {});
  }
  loadPromise = null;
  await refreshAds();
}
