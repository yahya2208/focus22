/**
 * Internal ads service — placement-driven banners.
 *
 * Each placement renders at most ONE image. The owner manages ads either by
 * editing `public/ads.json` (no code changes) or from the Ads Manager in the
 * Research Console, which writes a localStorage override that is merged on top
 * of the base config at runtime.
 */

export type AdPlacement = 'home' | 'phones' | 'repair' | 'results' | 'exchange' | 'phone-details';

export const AD_PLACEMENTS: readonly AdPlacement[] = [
  'home',
  'phones',
  'repair',
  'results',
  'exchange',
  'phone-details',
];

export interface AdConfig {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
}

export interface AdsFile {
  version: number;
  placements: Partial<Record<AdPlacement, AdConfig>>;
}

const OVERRIDE_KEY = 'focus_ads_override_v1';

let cached: AdsFile | null = null;
let cachePromise: Promise<AdsFile> | null = null;

function resolveUrl(src: string): string {
  if (!src) return '';
  if (/^(data:|https?:|blob:)/i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, '')}`;
}

async function loadBase(): Promise<AdsFile> {
  const res = await fetch(`${import.meta.env.BASE_URL}ads.json`);
  if (!res.ok) return { version: 1, placements: {} };
  return res.json() as Promise<AdsFile>;
}

export function getAdsFile(): Promise<AdsFile> {
  if (cached) return Promise.resolve(cached);
  if (!cachePromise) {
    cachePromise = loadBase()
      .then((file) => { cached = file; return file; })
      .catch(() => { cached = { version: 1, placements: {} }; return cached!; });
  }
  return cachePromise;
}

export function getAdOverride(): Partial<Record<AdPlacement, AdConfig>> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAdOverride(placement: AdPlacement, config: AdConfig): void {
  const all = getAdOverride();
  all[placement] = config;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
}

export function resetAdOverride(placement?: AdPlacement): void {
  if (placement) {
    const all = getAdOverride();
    delete all[placement];
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  } else {
    localStorage.removeItem(OVERRIDE_KEY);
  }
}

export function resolveAd(
  placement: AdPlacement,
  file: AdsFile | null,
  override: Partial<Record<AdPlacement, AdConfig>>,
): AdConfig | null {
  const base = file?.placements?.[placement];
  const chosen = override[placement] ?? base;
  if (!chosen || !chosen.enabled || !chosen.image) return null;
  return { ...chosen, image: resolveUrl(chosen.image) };
}
