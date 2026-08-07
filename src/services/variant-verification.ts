import { getVariantsForModel, getRealVariantsForModel, formatVariant } from '../data/phone-variants';
import { getAllBrands } from '../catalog/loader';
import type { CatalogModel } from '../catalog/types';

export interface VariantReport {
  model: string;
  brand: string;
  expectedVariants: string[];
  actualVariants: string[];
  missing: string[];
  extra: string[];
  coverage: number;
}

export interface CoverageStats {
  totalModels: number;
  fullCoverage: number;
  partialCoverage: number;
  noCoverage: number;
  averageCoverage: number;
}

function toLabel(ram: string, storage: string): string {
  return formatVariant(ram, storage);
}

export function verifyModelVariants(
  modelName: string,
  actualVariants: { ram: string; storage: string }[],
  brand?: string,
): VariantReport {
  const expected = getVariantsForModel(modelName, brand);
  const expectedLabels = expected.map(v => v.label);
  const actualLabels = actualVariants.map(v => toLabel(v.ram, v.storage));

  const expectedSet = new Set(expectedLabels);
  const actualSet = new Set(actualLabels);

  const missing = expectedLabels.filter(l => !actualSet.has(l));
  const extra = actualLabels.filter(l => !expectedSet.has(l));

  const coverage = expectedLabels.length > 0
    ? (expectedLabels.length - missing.length) / expectedLabels.length
    : 0;

  return {
    model: modelName,
    brand: brand ?? '',
    expectedVariants: expectedLabels,
    actualVariants: actualLabels,
    missing,
    extra,
    coverage,
  };
}

export function getModelByIdentifier(brand: string, model: string): CatalogModel | undefined {
  const brands = getAllBrands();
  const found = brands.find(b => b.brand.toLowerCase() === brand.toLowerCase());
  if (!found) return undefined;
  return found.models.find(m => m.model === model);
}

export function verifyAllModels(): VariantReport[] {
  const brands = getAllBrands();
  const reports: VariantReport[] = [];

  for (const brand of brands) {
    for (const model of brand.models) {
      const actualVariants = getRealVariantsForModel(model.model, brand.brand).map(v => ({ ram: v.ram, storage: v.storage }));
      const report = verifyModelVariants(model.model, actualVariants, brand.brand);
      reports.push(report);
    }
  }

  return reports;
}

export function getCoverageStats(): CoverageStats {
  const reports = verifyAllModels();
  const total = reports.length;
  let full = 0;
  let partial = 0;
  let none = 0;
  let totalCoverage = 0;

  for (const r of reports) {
    if (r.coverage >= 1) full++;
    else if (r.coverage > 0) partial++;
    else none++;
    totalCoverage += r.coverage;
  }

  return {
    totalModels: total,
    fullCoverage: full,
    partialCoverage: partial,
    noCoverage: none,
    averageCoverage: total > 0 ? +(totalCoverage / total).toFixed(4) : 0,
  };
}
