export type VerificationStatus = 'verified' | 'official' | 'unverified' | 'rejected';

export type ConflictState = 'none' | 'review' | 'resolved';

export interface Provenance {
  source: string;
  url?: string;
  verifiedAt: string;
  verifiedBy: string;
  status: VerificationStatus;
}

export interface CanonicalVariant {
  variantId: string;
  brandId: string;
  modelId: string;
  ram: string;
  storage: string;
  modelCode?: string;
  region: string[];
  provenance: Provenance[];
  status: VerificationStatus;
  conflict: ConflictState;
}

export interface CanonicalModel {
  modelId: string;
  brandId: string;
  name: string;
  series?: string;
  releaseYear?: number;
  modelNumbers: string[];
  variants: CanonicalVariant[];
}

export interface CanonicalBrand {
  brandId: string;
  name: string;
  aliases: string[];
  models: CanonicalModel[];
}

export interface CanonicalCatalog {
  version: string;
  brands: CanonicalBrand[];
}

export interface VariantConflict {
  brandId: string;
  modelId: string;
  region: string[];
  state: 'review';
  candidates: {
    variantId: string;
    ram: string;
    storage: string;
    modelCode?: string;
    region: string[];
    provenance: Provenance[];
  }[];
  openedAt: string;
}

export type VariantSelectionResult =
  | { outcome: 'matched'; variant: CanonicalVariant }
  | { outcome: 'variant-not-found' }
  | { outcome: 'conflict-review'; conflict: VariantConflict };

export interface CreateVariantInput {
  brandId: string;
  modelId: string;
  ram: string;
  storage: string;
  modelCode?: string;
  region?: string[];
  provenance: Provenance[];
}

export interface CatalogViolation {
  code:
    | 'cross-brand-variant'
    | 'orphan-variant'
    | 'model-without-variants'
    | 'model-without-valid-variants'
    | 'variant-without-provenance'
    | 'invalid-provenance'
    | 'duplicate-variant'
    | 'invalid-ram'
    | 'invalid-storage';
  message: string;
  brandId?: string;
  modelId?: string;
  variantId?: string;
}

export const ALLOWED_RAM = new Set([
  '0.25GB', '0.5GB', '1GB', '2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '18GB', '24GB', '32GB',
]);

export const ALLOWED_STORAGE = new Set([
  '4GB', '8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB',
]);

export const CATALOG_STORAGE_POLICY = {
  storableFacts: [
    'brandId', 'modelId', 'variantId', 'name', 'series', 'releaseYear', 'modelNumbers',
    'ram', 'storage', 'modelCode', 'region', 'provenance',
  ] as const,
  provenanceOnly: true,
  referenceOnlySources: true,
} as const;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function brandIdFor(name: string): string {
  return slugify(name);
}

export function modelIdFor(brandId: string, model: string): string {
  return `${brandId}-${slugify(model)}`;
}

function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function regionKeyOf(region: string[]): string {
  return [...region].sort().join(',');
}

export function variantIdFor(
  brandId: string,
  modelId: string,
  ram: string,
  storage: string,
  region: string[] = [],
): string {
  return stableHash(`${brandId}|${modelId}|${ram}|${storage}|${regionKeyOf(region)}`);
}

export function isValidRam(ram: string): boolean {
  return ALLOWED_RAM.has(ram);
}

export function isValidStorage(storage: string): boolean {
  return ALLOWED_STORAGE.has(storage);
}

function rankStatus(status: VerificationStatus): number {
  switch (status) {
    case 'verified': return 3;
    case 'official': return 2;
    case 'unverified': return 1;
    case 'rejected': return 0;
  }
}

function highestStatus(provenance: Provenance[]): VerificationStatus {
  if (provenance.some(p => p.status === 'rejected')) return 'rejected';
  let best: VerificationStatus = 'unverified';
  for (const p of provenance) {
    if (rankStatus(p.status) > rankStatus(best)) best = p.status;
  }
  return best;
}

export function createVariant(input: CreateVariantInput): CanonicalVariant {
  if (input.provenance.length === 0) {
    throw new Error('createVariant: provenance is required (a variant must be traceable to a source)');
  }
  if (!isValidRam(input.ram) || !isValidStorage(input.storage)) {
    throw new Error('createVariant: invalid ram/storage combination');
  }
  const region = input.region ?? [];
  return {
    variantId: variantIdFor(input.brandId, input.modelId, input.ram, input.storage, region),
    brandId: input.brandId,
    modelId: input.modelId,
    ram: input.ram,
    storage: input.storage,
    modelCode: input.modelCode,
    region,
    provenance: input.provenance,
    status: highestStatus(input.provenance),
    conflict: 'none',
  };
}

export function getVariantsForModelByIdentity(
  catalog: CanonicalCatalog,
  brandId: string,
  modelId: string,
): CanonicalVariant[] {
  const brand = catalog.brands.find(b => b.brandId === brandId);
  if (!brand) return [];
  const model = brand.models.find(m => m.modelId === modelId);
  return model ? model.variants : [];
}

export function getVariantByIdentity(
  catalog: CanonicalCatalog,
  brandId: string,
  modelId: string,
  ram: string,
  storage: string,
  region: string[] = [],
): CanonicalVariant | undefined {
  return getVariantsForModelByIdentity(catalog, brandId, modelId).find(v =>
    v.ram === ram && v.storage === storage && regionKeyOf(v.region) === regionKeyOf(region),
  );
}

interface RegionSpecGroup {
  region: string[];
  specs: { variantId: string; ram: string; storage: string; modelCode?: string; sources: Set<string>; provenance: Provenance[] }[];
}

function groupByRegion(model: CanonicalModel): RegionSpecGroup[] {
  const groups: RegionSpecGroup[] = [];
  for (const variant of model.variants) {
    let group = groups.find(g => regionKeyOf(g.region) === regionKeyOf(variant.region));
    if (!group) {
      group = { region: variant.region, specs: [] };
      groups.push(group);
    }
    const sources = new Set(variant.provenance.map(p => p.source));
    let spec = group.specs.find(s => s.ram === variant.ram && s.storage === variant.storage);
    if (!spec) {
      spec = { variantId: variant.variantId, ram: variant.ram, storage: variant.storage, modelCode: variant.modelCode, sources, provenance: [...variant.provenance] };
      group.specs.push(spec);
    } else {
      for (const s of sources) spec.sources.add(s);
      spec.provenance = [...spec.provenance, ...variant.provenance];
    }
  }
  return groups;
}

function isCoherentGroup(group: RegionSpecGroup): boolean {
  if (group.specs.length <= 1) return true;
  for (const spec of group.specs) {
    for (const source of spec.sources) {
      if (group.specs.every(other => other.sources.has(source))) return true;
    }
  }
  return false;
}

export function classifyConflicts(catalog: CanonicalCatalog, _openedBy = 'conflict-detector'): VariantConflict[] {
  const conflicts: VariantConflict[] = [];
  for (const brand of catalog.brands) {
    for (const model of brand.models) {
      for (const group of groupByRegion(model)) {
        if (group.specs.length <= 1) continue;
        if (isCoherentGroup(group)) continue;
        conflicts.push({
          brandId: brand.brandId,
          modelId: model.modelId,
          region: group.region,
          state: 'review',
          candidates: group.specs.map(s => ({
            variantId: s.variantId,
            ram: s.ram,
            storage: s.storage,
            modelCode: s.modelCode,
            region: group.region,
            provenance: s.provenance,
          })),
          openedAt: new Date().toISOString(),
        });
      }
    }
  }
  return conflicts;
}

export function getConflictByModel(
  conflicts: VariantConflict[],
  brandId: string,
  modelId: string,
): VariantConflict | undefined {
  return conflicts.find(c => c.brandId === brandId && c.modelId === modelId);
}

export function resolveVariantSelection(
  catalog: CanonicalCatalog,
  brandId: string,
  modelId: string,
  ram: string,
  storage: string,
  region: string[] = [],
): VariantSelectionResult {
  const model = catalog.brands.find(b => b.brandId === brandId)?.models.find(m => m.modelId === modelId);
  if (!model) return { outcome: 'variant-not-found' };

  const conflict = getConflictByModel(classifyConflicts(catalog, 'selection'), brandId, modelId);
  if (conflict && regionKeyOf(conflict.region) === regionKeyOf(region)) {
    const requested = `${ram}/${storage}`;
    const involved = conflict.candidates.some(c => `${c.ram}/${c.storage}` === requested);
    if (involved) return { outcome: 'conflict-review', conflict };
  }

  const variant = getVariantByIdentity(catalog, brandId, modelId, ram, storage, region);
  if (!variant) return { outcome: 'variant-not-found' };
  if (variant.status === 'rejected') return { outcome: 'variant-not-found' };
  return { outcome: 'matched', variant };
}

export function isModelSelectable(catalog: CanonicalCatalog, brandId: string, modelId: string): boolean {
  const variants = getVariantsForModelByIdentity(catalog, brandId, modelId);
  if (variants.length === 0) return false;
  const conflict = getConflictByModel(classifyConflicts(catalog, 'selectable'), brandId, modelId);
  if (conflict) return false;
  return variants.some(v => v.status === 'verified' || v.status === 'official');
}

export function validateCanonicalCatalog(catalog: CanonicalCatalog): CatalogViolation[] {
  const violations: CatalogViolation[] = [];
  for (const brand of catalog.brands) {
    for (const model of brand.models) {
      if (model.brandId !== brand.brandId) {
        violations.push({ code: 'cross-brand-variant', message: `model ${model.modelId} belongs to ${model.brandId} but is nested under ${brand.brandId}`, brandId: brand.brandId, modelId: model.modelId });
      }
      if (model.variants.length === 0) {
        violations.push({ code: 'model-without-variants', message: `model ${model.modelId} has no variants`, brandId: brand.brandId, modelId: model.modelId });
      }
      if (model.variants.length > 0 && !model.variants.some(v => v.status === 'verified' || v.status === 'official')) {
        violations.push({ code: 'model-without-valid-variants', message: `model ${model.modelId} has no verified/official variant`, brandId: brand.brandId, modelId: model.modelId });
      }
      const seen = new Set<string>();
      for (const variant of model.variants) {
        const identity = `${variant.brandId}|${variant.modelId}|${variant.ram}|${variant.storage}|${regionKeyOf(variant.region)}`;
        if (seen.has(identity)) {
          violations.push({ code: 'duplicate-variant', message: `duplicate variant identity ${identity}`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
        }
        seen.add(identity);
        if (variant.brandId !== brand.brandId || variant.modelId !== model.modelId) {
          violations.push({ code: 'orphan-variant', message: `variant ${variant.variantId} is not attached to ${brand.brandId}/${model.modelId}`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
        }
        if (variant.provenance.length === 0) {
          violations.push({ code: 'variant-without-provenance', message: `variant ${variant.variantId} has no provenance`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
        }
        for (const p of variant.provenance) {
          if (!p.source || !p.verifiedAt || !p.verifiedBy) {
            violations.push({ code: 'invalid-provenance', message: `variant ${variant.variantId} has incomplete provenance`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
          }
        }
        if (!isValidRam(variant.ram)) {
          violations.push({ code: 'invalid-ram', message: `variant ${variant.variantId} has invalid ram ${variant.ram}`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
        }
        if (!isValidStorage(variant.storage)) {
          violations.push({ code: 'invalid-storage', message: `variant ${variant.variantId} has invalid storage ${variant.storage}`, brandId: brand.brandId, modelId: model.modelId, variantId: variant.variantId });
        }
      }
    }
  }
  return violations;
}
