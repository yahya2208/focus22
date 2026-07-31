import { getAllModels } from '../catalog';

export type PhoneCatalogEntry = {
  brand: string;
  models: readonly string[];
};

export type PhoneModelEntry = {
  brand: string;
  model: string;
  normalized: string;
};

const all = getAllModels();
const byBrand = new Map<string, string[]>();
for (const m of all) {
  if (!byBrand.has(m.brand)) byBrand.set(m.brand, []);
  byBrand.get(m.brand)!.push(m.model);
}

export const PHONE_CATALOG: readonly PhoneCatalogEntry[] = Array.from(byBrand.entries())
  .map(([brand, models]) => ({ brand, models: Object.freeze(models) }));

export const PHONE_MODELS: readonly PhoneModelEntry[] = all.map(m => ({
  brand: m.brand,
  model: m.model,
  normalized: m.model.toLowerCase().replace(/[^a-z0-9]/g, ''),
}));
