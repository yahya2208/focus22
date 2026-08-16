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
import { isSafeExternalUrl } from './ad-adapters/external';
import { isValidWhatsAppNumber, WHATSAPP_MESSAGE_MAX_LENGTH } from './ad-adapters/whatsapp';
import { INTERNAL_AD_ALLOWLIST } from './ad-adapters/internal';

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

export interface AdImage {
  id: string;
  path: string;
  url: string;
  position: number;
  isCover: boolean;
  /**
   * Per-slide device (00021): the InventoryRecord.id that THIS carousel slide
   * drives at render time (buildAdPhoneLink → #/phone-details?device=<id>).
   * '' = no device (slide is not interactive, mirrors ads.device_id).
   */
  deviceId: string;
  /**
   * Per-slide destination discriminator (00024): how THIS slide's target
   * resolves at render time, independent of the ad-level destination.
   * undefined/NULL = INHERIT the ad-level destination (Slide → Ad fallback).
   * Non-NULL ∈ {external, whatsapp, internal} = slide-level override, read from
   * `destination`. 'phone' is NEVER valid per slide (DB CHECK excludes it):
   * phone slides stay expressed EXCLUSIVELY via `deviceId` (00021).
   */
  destinationType?: AdDestinationType;
  /** Per-slide payload (00024, JSONB passthrough from ad_images.destination).
   *  undefined/NULL = INHERIT the ad-level destination. */
  destination?: Record<string, unknown>;
}

interface AdImageRow {
  id: string;
  ad_placement: AdPlacement;
  path: string;
  position: number;
  is_cover: boolean;
  device_id: string;
  destination_type: AdDestinationType | null;
  destination: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Generic destination discriminator (00022): how the ad's target resolves at
 * render time. `phone` preserves the legacy behavior exactly.
 */
export type AdDestinationType = 'phone' | 'external' | 'internal' | 'whatsapp';

export interface AdConfig {
  enabled: boolean;
  /** Cover image of the gallery (mirrors ads.image_path/image_url). */
  image: string;
  link: string;
  alt: string;
  /**
   * Structured source of truth for phone-linked ads: the InventoryRecord.id
   * the banner navigates to. Empty string when the ad is a plain external link.
   * `link` is derived from `deviceId` on save (#/phone-details?device=<id>).
   */
  deviceId: string;
  /**
   * Generic destination discriminator (00022). Backfilled to 'phone' when the
   * row predates 00022 or the column is missing. Informational at this stage —
   * the render path still resolves phone ads via `link`/`deviceId`.
   */
  destinationType?: AdDestinationType;
  /** Per-type payload (JSONB passthrough from `ads.destination`). {} for phone. */
  destination?: Record<string, unknown>;
  /** Generic headline/title (optional, `ads.title`). */
  title?: string;
  /** Ordered gallery. Empty for legacy ads with no ad_images rows. */
  images: AdImage[];
}

interface AdRow {
  placement: AdPlacement;
  enabled: boolean;
  image_path: string;
  image_url: string;
  link: string;
  alt: string;
  device_id: string;
  destination_type: AdDestinationType;
  destination: Record<string, unknown>;
  title: string;
}

export interface AdRowInput {
  placement: AdPlacement;
  enabled: boolean;
  link?: string;
  alt?: string;
  deviceId?: string;
  /**
   * Generic destination discriminator (00022). Missing → 'phone' (legacy).
   * Non-phone types (external/whatsapp/internal) carry their payload in
   * `destination` and NEVER write legacy `link`/`device_id` (strict separation).
   */
  destinationType?: AdDestinationType;
  /** Per-type payload (JSONB passthrough). For phone it is written as {}. */
  destination?: Record<string, unknown>;
  /** Generic headline/title (optional, `ads.title`). */
  title?: string;
}

export const PHONE_DETAILS_PREFIX = '#/phone-details?device=';

export function buildAdPhoneLink(deviceId: string): string {
  return `${PHONE_DETAILS_PREFIX}${encodeURIComponent(deviceId)}`;
}

export function isAdPhoneLink(link: string | undefined): boolean {
  return typeof link === 'string' && link.startsWith(PHONE_DETAILS_PREFIX);
}

/**
 * Client-side validation mirror of the DB CHECKs (supabase/ads-device-links/).
 * The DB enforces format/consistency; this helper enforces the same rules at
 * save time so the admin sees the error immediately. Existence in the current
 * inventory is NOT validated here — that is the Ads Manager's job (the DB
 * cannot know a client-side inventory source).
 *
 * PHASE 3 STEP 1 — destination-aware:
 *   - `phone` (default, including rows predating 00022) keeps the exact legacy
 *     link/device_id consistency rules.
 *   - external/whatsapp/internal are validated against the SAME predicates the
 *     destination adapters use (adapter = source of truth), enforce strict
 *     separation (no legacy link/device_id). They may be saved ENABLED: the
 *     destination-aware `ads_enabled_requires_link` constraint (00023, applied)
 *     accepts enabled rows whose destination_type is external/internal/whatsapp
 *     even with an empty legacy link (Phase 3 Step 2).
 *
 * PHASE 3 STEP 4 — after 00023: the service mirrors the destination-aware CHECK
 * (enabled ⇒ phone needs non-empty link; external/internal/whatsapp carry their
 * target in `destination`), so a validated non-phone payload is never rejected
 * by the DB on the enabled rule.
 */
export function validateAdInput(input: AdRowInput): void {
  const destinationType = input.destinationType ?? 'phone';
  if (destinationType === 'phone') {
    validatePhoneAdInput(input);
    return;
  }
  validateStructuredAdInput(input, destinationType);
}

function validatePhoneAdInput(input: AdRowInput): void {
  const enabled = Boolean(input.enabled);
  const link = input.link?.trim() ?? '';
  const deviceId = input.deviceId?.trim() ?? '';

  if (isAdPhoneLink(input.link)) {
    if (!deviceId) {
      throw new Error('رابط هاتف يتطلب اختيار هاتف مرتبط (device_id)');
    }
    if (link !== buildAdPhoneLink(deviceId)) {
      throw new Error('الرابط لا يطابق الهاتف المختار');
    }
  } else if (deviceId) {
    throw new Error('اختيار هاتف مرتبط يتطلب رابط هاتف داخلي');
  }
  if (enabled && !link) {
    throw new Error('الإعلان المفعّل يجب أن يحتوي على رابط وجهة (هاتف أو رابط خارجي)');
  }
}

/**
 * Plain object whose values are all strings — mirrors the internal adapter's
 * `isPlainStringParams` so the saved payload is always what the adapter would
 * accept at render time (adapter = source of truth).
 */
function isPlainStringParams(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

function validateStructuredAdInput(input: AdRowInput, destinationType: AdDestinationType): void {
  const link = input.link?.trim() ?? '';
  const deviceId = input.deviceId?.trim() ?? '';

  // Strict separation (approved contract): non-phone destinations carry their
  // target ONLY in `destination` — never in the legacy `link`/`device_id`.
  if (link || deviceId) {
    throw new Error('الوجهة غير-الهاتفية لا تستخدم link أو device_id — الهدف يُحفظ في destination فقط (فصل صارم)');
  }

  const destination = input.destination ?? {};

  if (destinationType === 'external') {
    const external = destination.external as { url?: unknown } | undefined;
    const url = typeof external?.url === 'string' ? external.url : '';
    if (!isSafeExternalUrl(url)) {
      throw new Error('الوجهة الخارجية تتطلب رابطاً مطلقاً http(s) صالحاً في destination.external.url');
    }
  } else if (destinationType === 'whatsapp') {
    const wa = destination.whatsapp as { number?: unknown; message?: unknown } | undefined;
    const number = typeof wa?.number === 'string' ? wa.number : '';
    const message = typeof wa?.message === 'string' ? wa.message : '';
    if (!isValidWhatsAppNumber(number)) {
      throw new Error('الوجهة تتطلب رقم واتساب صالحاً (8–15 رقماً) في destination.whatsapp.number');
    }
    if (message.length > WHATSAPP_MESSAGE_MAX_LENGTH) {
      throw new Error(`رسالة واتساب تتجاوز الحد الأقصى (${WHATSAPP_MESSAGE_MAX_LENGTH} حرفاً)`);
    }
  } else {
    // internal
    const internal = destination.internal as { screen?: unknown; params?: unknown } | undefined;
    const screen = typeof internal?.screen === 'string' ? internal.screen : '';
    if (!(INTERNAL_AD_ALLOWLIST as readonly string[]).includes(screen)) {
      throw new Error('الوجهة الداخلية تتطلب شاشة ضمن القائمة المسموحة (destination.internal.screen)');
    }
    const params = internal?.params;
    if (params !== undefined && !isPlainStringParams(params)) {
      throw new Error('معاملات الوجهة الداخلية يجب أن تكون نصية فقط (destination.internal.params)');
    }
    if (screen === 'phone-details') {
      const device = params !== undefined ? (params as Record<string, string>).device ?? '' : '';
      if (!device.trim()) {
        throw new Error('وجهة phone-details تتطلب معامل device (destination.internal.params.device)');
      }
    }
  }

  // DB gate: the destination-aware `ads_enabled_requires_link` (00023, applied)
  // accepts enabled rows for external/internal/whatsapp without a legacy link.
  // An ENABLED non-phone ad passes here — only the phone path still requires a
  // non-empty link (enforced in validatePhoneAdInput above).
}

const ADS_BUCKET = 'ads-images';

type Listener = () => void;

let cache: Record<AdPlacement, AdConfig> | null = null;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
let realtimeStarted = false;

function emptyMap(): Record<AdPlacement, AdConfig> {
  const result = {} as Record<AdPlacement, AdConfig>;
  for (const p of AD_PLACEMENTS)
    result[p] = { enabled: false, image: '', link: '', alt: '', deviceId: '', destinationType: 'phone', destination: {}, title: '', images: [] };
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

function rowToConfig(row: AdRow, images: AdImage[] = []): AdConfig {
  const imageUrl = isValidImageUrl(row.image_url) ? row.image_url : '';
  return {
    enabled: row.enabled,
    image: imageUrl || publicImageUrl(row.image_path),
    link: row.link,
    alt: row.alt,
    deviceId: row.device_id ?? '',
    destinationType: row.destination_type ?? 'phone',
    destination: row.destination ?? {},
    title: row.title ?? '',
    images,
  };
}

async function fetchAds(): Promise<Record<AdPlacement, AdConfig>> {
  const result = emptyMap();
  try {
    const { data, error } = await getSupabaseClient().from('ads').select('*');
    if (error || !data) return result; // table not created yet — render nothing
    const galleryByPlacement = await loadGalleries();
    for (const row of data as AdRow[]) {
      if (row.placement in result) {
        result[row.placement] = rowToConfig(row, galleryByPlacement.get(row.placement) ?? []);
      }
    }
  } catch {
    // ignore — same as missing table
  }
  return result;
}

/**
 * Phase C — ordered gallery from `ad_images` (supabase/migrations/00020_*).
 * Tolerates the pre-Phase-C schema (no table yet): returns an empty map so
 * ads fall back to the single `ads.image_path` mirror.
 *
 * PHASE 4B (00024): also reads the per-slide destination columns
 * (`destination_type` / `destination`). NULL/NULL rows surface as absent
 * fields on the AdImage → the slide inherits the ad-level destination.
 */
async function loadGalleries(): Promise<Map<AdPlacement, AdImage[]>> {
  const map = new Map<AdPlacement, AdImage[]>();
  try {
    const { data } = await getSupabaseClient()
      .from('ad_images')
      .select('id, ad_placement, path, position, is_cover, device_id, destination_type, destination')
      .order('position', { ascending: true });
    for (const row of (data ?? []) as AdImageRow[]) {
      const list = map.get(row.ad_placement) ?? [];
      list.push({
        id: row.id,
        path: row.path,
        url: publicImageUrl(row.path),
        position: row.position,
        isCover: row.is_cover,
        deviceId: row.device_id ?? '',
        destinationType: row.destination_type ?? undefined,
        destination: row.destination ?? undefined,
      });
      map.set(row.ad_placement, list);
    }
  } catch {
    // ad_images missing (pre-Phase-C) or read restricted — legacy mirror only
  }
  return map;
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
  const path = `ads-images/${placement}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
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
  const destinationType = input.destinationType ?? 'phone';

  let link = input.link ?? '';
  const deviceId = input.deviceId?.trim() ?? '';
  // Legacy phone path: derive the deep link from the selected device exactly
  // as before. Non-phone paths never touch link/device_id (strict separation).
  if (destinationType === 'phone' && deviceId) {
    link = buildAdPhoneLink(deviceId);
  }
  const normalized: AdRowInput = { ...input, link, deviceId, destinationType };

  validateAdInput(normalized);

  const { error } = await getSupabaseClient().from('ads').upsert({
    placement: input.placement,
    enabled: input.enabled,
    link,
    device_id: deviceId,
    alt: input.alt ?? '',
    destination_type: destinationType,
    destination: destinationType === 'phone' ? {} : input.destination ?? {},
    title: input.title ?? '',
  });
  if (error) throw new Error(`فشل حفظ الإعلان: ${error.message}`);
  loadPromise = null;
  await refreshAds();
}

export async function resetAd(placement: AdPlacement): Promise<void> {
  const client = getSupabaseClient();
  const paths = new Set<string>();
  try {
    const { data: gallery } = await client.from('ad_images').select('path').eq('ad_placement', placement);
    for (const r of (gallery ?? []) as Array<{ path: string }>) {
      if (r.path) paths.add(r.path);
    }
  } catch {
    // ad_images missing — legacy mirror only
  }
  try {
    const { data } = await client.from('ads').select('image_path').eq('placement', placement).maybeSingle();
    const legacyPath = (data as { image_path?: string } | null)?.image_path;
    if (legacyPath) paths.add(legacyPath);
  } catch {
    // ignore read failure — proceed with delete
  }
  const { error } = await client.from('ads').delete().eq('placement', placement);
  if (error) throw new Error(`فشل إعادة تعيين الإعلان: ${error.message}`);
  const all = [...paths];
  if (all.length > 0) {
    await client.storage.from(ADS_BUCKET).remove(all).catch(() => {});
  }
  loadPromise = null;
  await refreshAds();
}

/**
 * Phase C + 00021 + 00024 — gallery writes. The RPCs (supabase/migrations/
 * 00020_*, 00021_ad_images_device_id.sql and 00024_ads_image_destinations.sql)
 * are SECURITY DEFINER so the admin can mutate `ad_images` despite the public
 * read-only RLS policy. Storage cleanup runs client-side because the RPCs
 * return the removed paths.
 *
 * Per-slide devices (00021): device_ids are sent to ad_replace_images_devices
 * ONLY when at least one slide carries a device; otherwise the device-free
 * 00020 ad_replace_images is used (old callers keep working unchanged).
 *
 * PHASE 4B (00024) — per-slide destinations: when at least one slide carries a
 * non-empty destination_type, the NEW superset RPC ad_replace_images_destinations
 * is used, passing device_ids + destination_types + destinations in ONE call.
 * A slide is an override only when its destination_type is non-empty;
 * ''/undefined (and its destination) = INHERIT the ad destination (NULL/NULL
 * contract). 'phone' is never valid per slide (the DB CHECK and this client
 * mirror both reject it — phone slides stay on device_id).
 */
export async function replaceAdImages(
  placement: AdPlacement,
  paths: string[],
  covers: boolean[],
  deviceIds?: string[],
  destinationTypes?: Array<AdDestinationType | '' | undefined>,
  destinations?: Array<Record<string, unknown> | null | undefined>,
): Promise<void> {
  if (paths.length === 0) return;
  const trimmed = deviceIds?.map((d) => d?.trim() ?? '') ?? [];
  const hasDevices = trimmed.some((d) => d !== '');
  if (hasDevices && trimmed.length !== paths.length) {
    throw new Error('عدد الأجهزة لا يطابق عدد الصور');
  }

  const slideTypes = normalizeSlideDestinationTypes(destinationTypes, paths.length);
  const hasSlideDestinations = slideTypes.some((t) => t !== '');
  if (hasSlideDestinations && deviceIds !== undefined && trimmed.length !== paths.length) {
    throw new Error('عدد الأجهزة لا يطابق عدد الصور');
  }
  const slideDests = normalizeSlideDestinations(destinations, paths.length, slideTypes);

  const client = getSupabaseClient();
  const previous = await collectAdImagePaths(placement);

  const rpcName = hasSlideDestinations
    ? 'ad_replace_images_destinations'
    : hasDevices
      ? 'ad_replace_images_devices'
      : 'ad_replace_images';
  const args = hasSlideDestinations
    ? {
        p_ad_placement: placement,
        p_paths: paths,
        p_covers: covers,
        ...(deviceIds !== undefined ? { p_device_ids: trimmed } : {}),
        p_destination_types: slideTypes,
        p_destinations: slideDests,
      }
    : hasDevices
      ? { p_ad_placement: placement, p_paths: paths, p_covers: covers, p_device_ids: trimmed }
      : { p_ad_placement: placement, p_paths: paths, p_covers: covers };
  const { error } = await client.rpc(rpcName, args);
  if (error) throw new Error(`فشل حفظ الصور: ${error.message}`);
  const removed = previous.filter((p) => !paths.includes(p));
  if (removed.length > 0) {
    await client.storage.from(ADS_BUCKET).remove(removed).catch(() => {});
  }
  loadPromise = null;
  await refreshAds();
}

/**
 * Per-slide destination types allowed by 00024 (ad_images_destination_type_valid).
 * 'phone' is deliberately NOT here — phone slides stay on device_id (00021).
 */
const SLIDE_DESTINATION_TYPES: ReadonlySet<AdDestinationType> = new Set(['external', 'whatsapp', 'internal']);

/**
 * Client-side mirror of the 00024 per-slide destination_type contract:
 *   - undefined (no array) → every slide is INHERIT ('');
 *   - '' / undefined / null → INHERIT the ad destination;
 *   - 'phone' → REJECTED (never valid per slide — the DB CHECK excludes it);
 *   - anything outside {external, whatsapp, internal} → REJECTED.
 */
function normalizeSlideDestinationTypes(
  types: Array<AdDestinationType | '' | undefined> | undefined,
  count: number,
): Array<AdDestinationType | ''> {
  if (types === undefined) return Array.from({ length: count }, () => '' as const);
  if (types.length !== count) {
    throw new Error('عدد أنواع الوجهات لا يطابق عدد الصور');
  }
  return types.map((t) => {
    const value = t?.trim() ?? '';
    if (value === '') return '' as const;
    if (value === 'phone') {
      throw new Error('وجهة الهاتف غير مسموحة لكل شريحة — استخدم device_id (00021)');
    }
    if (!(SLIDE_DESTINATION_TYPES as ReadonlySet<string>).has(value)) {
      throw new Error('نوع وجهة الشريحة غير صالح — external/whatsapp/internal فقط');
    }
    return value as AdDestinationType;
  });
}

/**
 * Aligns the per-slide payload array with the normalized types:
 *   - a slide that INHERITS ('' type) never carries a payload (NULL/NULL
 *     contract — the render path ignores a payload without a type);
 *   - an OVERRIDE slide keeps its payload (undefined/null → NULL = empty
 *     payload → the adapter is non-interactive, never a dead target).
 */
function normalizeSlideDestinations(
  dests: Array<Record<string, unknown> | null | undefined> | undefined,
  count: number,
  types: Array<AdDestinationType | ''>,
): Array<Record<string, unknown> | null> {
  if (dests === undefined) return Array.from({ length: count }, () => null);
  if (dests.length !== count) {
    throw new Error('عدد بيانات الوجهات لا يطابق عدد الصور');
  }
  return dests.map((d, i) => (types[i] !== '' ? (d ?? null) : null));
}

export async function addAdImage(
  placement: AdPlacement,
  path: string,
  position: number,
  isCover: boolean,
  deviceId = '',
): Promise<void> {
  const device = deviceId?.trim() ?? '';
  const hasDevice = device !== '';
  const client = getSupabaseClient();
  const rpcName = hasDevice ? 'ad_add_image_devices' : 'ad_add_image';
  const args = hasDevice
    ? { p_ad_placement: placement, p_path: path, p_position: position, p_is_cover: isCover, p_device_id: device }
    : { p_ad_placement: placement, p_path: path, p_position: position, p_is_cover: isCover };
  const { error } = await client.rpc(rpcName, args);
  if (error) throw new Error(`فشل إضافة الصورة: ${error.message}`);
  loadPromise = null;
  await refreshAds();
}

export async function removeAdImage(imageId: string): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('ad_remove_image', { p_image_id: imageId });
  if (error) throw new Error(`فشل إزالة الصورة: ${error.message}`);
  const removedPath = (data ?? '') as string;
  if (removedPath) {
    await client.storage.from(ADS_BUCKET).remove([removedPath]).catch(() => {});
  }
  loadPromise = null;
  await refreshAds();
}

async function collectAdImagePaths(placement: AdPlacement): Promise<string[]> {
  try {
    const { data } = await getSupabaseClient().from('ad_images').select('path').eq('ad_placement', placement);
    return ((data ?? []) as Array<{ path: string }>).map((r) => r.path).filter(Boolean);
  } catch {
    return [];
  }
}
