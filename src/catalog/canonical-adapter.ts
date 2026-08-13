import { getAllBrands } from './loader';
import {
  createVariant,
  slugify,
  brandIdFor,
  modelIdFor,
  variantIdFor,
  isValidRam,
  isValidStorage,
  type CanonicalBrand,
  type CanonicalCatalog,
  type CanonicalModel,
  type CanonicalVariant,
  type Provenance,
} from './canonical';

export const LEGACY_SOURCE = 'catalog-json-v2.0.0-rc1';
export const MIGRATION_VERIFIER = 'catalog-migration-s1';
export const MIGRATION_AT = '2026-08-07T00:00:00.000Z';

export const MODEL_ID_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  huawei: {
    'Mate 40 Pro+': 'huawei-mate-40-pro-plus',
    'Mate 60 Pro+': 'huawei-mate-60-pro-plus',
    'P40 Pro+': 'huawei-p40-pro-plus',
  },
  infinix: {
    'Note 40 Pro+': 'infinix-note-40-pro-plus',
  },
  motorola: {
    'Edge+': 'motorola-edge-plus',
    'One Fusion+': 'motorola-one-fusion-plus',
  },
  oppo: {
    'F19 Pro+': 'oppo-f19-pro-plus',
    'Reno 10 Pro+': 'oppo-reno-10-pro-plus',
  },
  realme: {
    'Realme 10 Pro+': 'realme-realme-10-pro-plus',
    'Realme 11 Pro+': 'realme-realme-11-pro-plus',
    'Realme 12+': 'realme-realme-12-plus',
    'Realme 12 Pro+': 'realme-realme-12-pro-plus',
    'Realme 13 Pro+': 'realme-realme-13-pro-plus',
    'Realme 9 Pro+': 'realme-realme-9-pro-plus',
  },
  samsung: {
    'Galaxy A6+ (2018)': 'samsung-galaxy-a6-2018-plus',
    'Galaxy A8+ (2018)': 'samsung-galaxy-a8-2018-plus',
    'Galaxy Grand Prime+': 'samsung-galaxy-grand-prime-plus',
    'Galaxy J4+': 'samsung-galaxy-j4-plus',
    'Galaxy J6+': 'samsung-galaxy-j6-plus',
    'Galaxy Note 10+': 'samsung-galaxy-note-10-plus',
    'Galaxy S10+': 'samsung-galaxy-s10-plus',
    'Galaxy S6 Edge+': 'samsung-galaxy-s6-edge-plus',
    'Galaxy S8+': 'samsung-galaxy-s8-plus',
    'Galaxy S9+': 'samsung-galaxy-s9-plus',
    'Galaxy Z Flip7': 'samsung-galaxy-z-flip-7',
    'Galaxy Z Fold7': 'samsung-galaxy-z-fold-7',
  },
  sony: {
    'Xperia Z3+': 'sony-xperia-z3-plus',
  },
  tecno: {
    'Spark 20 Pro+': 'tecno-spark-20-pro-plus',
  },
  vivo: {
    'V7+': 'vivo-v7-plus',
    'X Fold+': 'vivo-x-fold-plus',
    'X50 Pro+': 'vivo-x50-pro-plus',
    'X60 Pro+': 'vivo-x60-pro-plus',
    'X70 Pro+': 'vivo-x70-pro-plus',
    'X90 Pro+': 'vivo-x90-pro-plus',
  },
  xiaomi: {
    'Redmi Note 12 Pro+': 'xiaomi-redmi-note-12-pro-plus',
    'Redmi Note 12 Pro+ 5G': 'xiaomi-redmi-note-12-pro-5g-plus',
    'Redmi Note 13 Pro+': 'xiaomi-redmi-note-13-pro-plus',
    'Redmi Note 13 Pro+ 5G': 'xiaomi-redmi-note-13-pro-5g-plus',
    'Redmi Note 14 Pro+': 'xiaomi-redmi-note-14-pro-plus',
    'Redmi Note 15 Pro+': 'xiaomi-redmi-note-15-pro-plus',
    'Redmi Note 16 Pro+': 'xiaomi-redmi-note-16-pro-plus',
  },
};

export interface MigrationException {
  legacyIndex: number;
  brand: string;
  model: string;
  legacyRam: string;
  legacyStorage: string;
  legacyModelId: string;
  canonicalModelId: string;
  canonicalVariantId: string;
  kind: 'model-id-override' | 'dropped';
  reason: string;
}

export interface ModelOverride {
  brand: string;
  legacyModel: string;
  legacyModelId: string;
  canonicalModelId: string;
  affectedVariants: number;
  reason: string;
}

export interface MigrationReport {
  totalLegacy: number;
  migrated: number;
  dropped: number;
  beforeAfterMatches: number;
  remappedViaOverride: number;
  deterministic: boolean;
  exceptions: MigrationException[];
  overrides: ModelOverride[];
}

export interface AdapterResult {
  catalog: CanonicalCatalog;
  report: MigrationReport;
}

export function toCanonicalRam(raw: string): string {
  const t = raw.trim();
  if (/^[0-9.]+GB$/i.test(t)) return t.toUpperCase();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  if (n === 0.25) return '0.25GB';
  if (n === 0.5) return '0.5GB';
  return `${n}GB`;
}

export function toCanonicalStorage(raw: string): string {
  const t = raw.trim();
  if (/^[0-9.]+GB$/i.test(t)) return t.toUpperCase();
  if (/^[0-9.]+TB$/i.test(t)) return t.toUpperCase();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  if (n === 1000 || n === 2000) return `${n / 1000}TB`;
  return `${n}GB`;
}

export function resolveModelId(brandId: string, model: string): string {
  const override = MODEL_ID_OVERRIDES[brandId]?.[model];
  return override ?? modelIdFor(brandId, model);
}

function importedProvenance(): Provenance {
  return {
    source: LEGACY_SOURCE,
    url: undefined,
    verifiedAt: MIGRATION_AT,
    verifiedBy: MIGRATION_VERIFIER,
    status: 'unverified',
  };
}

export function buildCanonicalCatalog(): AdapterResult {
  const brands = getAllBrands();
  const exceptions: MigrationException[] = [];
  const seenVariantIds = new Set<string>();
  const modelIdOwner = new Map<string, string>();
  const overrideCount = new Map<string, ModelOverride>();

  const plainIdentityOwners = new Map<string, Set<string>>();
  for (const b of brands) {
    const bi = brandIdFor(b.brand);
    for (const m of b.models) {
      const pmi = modelIdFor(bi, m.model);
      for (const v of m.variants) {
        const pid = variantIdFor(bi, pmi, toCanonicalRam(v.ram), toCanonicalStorage(v.storage), []);
        const owners = plainIdentityOwners.get(pid) ?? new Set<string>();
        owners.add(m.model);
        plainIdentityOwners.set(pid, owners);
      }
    }
  }
  let legacyIndex = 0;
  let directMatch = 0;
  let remappedViaOverride = 0;

  const canonicalBrands: CanonicalBrand[] = [];

  for (const brand of brands) {
    const brandId = brandIdFor(brand.brand);
    const models: CanonicalModel[] = [];

    for (const model of brand.models) {
      const modelId = resolveModelId(brandId, model.model);
      const plainModelId = modelIdFor(brandId, model.model);
      const isOverridden = MODEL_ID_OVERRIDES[brandId]?.[model.model] !== undefined;

      const prior = modelIdOwner.get(modelId);
      if (prior && prior !== model.model) {
        for (const variant of model.variants) {
          exceptions.push({
            legacyIndex,
            brand: brand.brand,
            model: model.model,
            legacyRam: variant.ram,
            legacyStorage: variant.storage,
            legacyModelId: plainModelId,
            canonicalModelId: modelId,
            canonicalVariantId: '',
            kind: 'dropped',
            reason: `model identity collision: "${prior}" and "${model.model}" both map to modelId ${modelId}; add an explicit entry to MODEL_ID_OVERRIDES before migrating`,
          });
          legacyIndex++;
        }
        continue;
      }
      modelIdOwner.set(modelId, model.model);

      const variants: CanonicalVariant[] = [];

      for (const variant of model.variants) {
        const ram = toCanonicalRam(variant.ram);
        const storage = toCanonicalStorage(variant.storage);
        const region: string[] = [];

        if (!isValidRam(ram) || !isValidStorage(storage)) {
          exceptions.push({
            legacyIndex,
            brand: brand.brand,
            model: model.model,
            legacyRam: variant.ram,
            legacyStorage: variant.storage,
            legacyModelId: plainModelId,
            canonicalModelId: modelId,
            canonicalVariantId: '',
            kind: 'dropped',
            reason: `non-deterministic conversion: ram=${variant.ram} storage=${variant.storage}`,
          });
          legacyIndex++;
          continue;
        }

        const variantId = variantIdFor(brandId, modelId, ram, storage, region);
        const plainVariantId = variantIdFor(brandId, plainModelId, ram, storage, region);

        if (seenVariantIds.has(variantId)) {
          exceptions.push({
            legacyIndex,
            brand: brand.brand,
            model: model.model,
            legacyRam: variant.ram,
            legacyStorage: variant.storage,
            legacyModelId: plainModelId,
            canonicalModelId: modelId,
            canonicalVariantId: variantId,
            kind: 'dropped',
            reason: 'duplicate variant identity after normalization',
          });
          legacyIndex++;
          continue;
        }
        seenVariantIds.add(variantId);

        if (isOverridden) {
          remappedViaOverride++;
          const prev = overrideCount.get(model.model) ?? {
            brand: brand.brand,
            legacyModel: model.model,
            legacyModelId: plainModelId,
            canonicalModelId: modelId,
            affectedVariants: 0,
            reason: `slug collision: "${model.model}" and its sibling both derive to modelId ${plainModelId}; scoped override maps to ${modelId}`,
          };
          prev.affectedVariants++;
          overrideCount.set(model.model, prev);

          const owners = plainIdentityOwners.get(plainVariantId);
          const isSiblingCollision = owners !== undefined && [...owners].some(o => o !== model.model);
          if (isSiblingCollision) {
            exceptions.push({
              legacyIndex,
              brand: brand.brand,
              model: model.model,
              legacyRam: variant.ram,
              legacyStorage: variant.storage,
              legacyModelId: plainModelId,
              canonicalModelId: modelId,
              canonicalVariantId: variantId,
              kind: 'model-id-override',
              reason: `slug collision: "${model.model}" and its sibling both derive to modelId ${plainModelId}; scoped override maps to ${modelId}`,
            });
          }
        } else {
          directMatch++;
        }

        variants.push(
          createVariant({
            brandId,
            modelId,
            ram,
            storage,
            region,
            provenance: [importedProvenance()],
          }),
        );
        legacyIndex++;
      }

      if (variants.length > 0) {
        models.push({
          modelId,
          brandId,
          name: model.model,
          series: model.series,
          releaseYear: model.releaseYear ?? undefined,
          modelNumbers: [...model.modelNumbers],
          variants,
        });
      }
    }

    canonicalBrands.push({
      brandId,
      name: brand.brand,
      aliases: [...(brand.aliases ?? [])],
      models,
    });
  }

  const dropped = exceptions.filter(e => e.kind === 'dropped').length;
  const overrides = [...overrideCount.values()].sort((a, b) => a.legacyModel.localeCompare(b.legacyModel));

  return {
    catalog: { version: 'canonical-adapter-s1', brands: canonicalBrands },
    report: {
      totalLegacy: legacyIndex,
      migrated: legacyIndex - dropped,
      dropped,
      beforeAfterMatches: directMatch,
      remappedViaOverride,
      deterministic: true,
      exceptions,
      overrides,
    },
  };
}

let _cached: AdapterResult | null = null;

export function getCanonicalCatalogResult(): AdapterResult {
  if (!_cached) _cached = buildCanonicalCatalog();
  return _cached;
}

export function getCanonicalCatalog(): CanonicalCatalog {
  return getCanonicalCatalogResult().catalog;
}

export function getMigrationReport(): MigrationReport {
  return getCanonicalCatalogResult().report;
}

export function slugifyLegacy(name: string): string {
  return slugify(name);
}
