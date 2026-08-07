import { PHONE_CATALOG } from '../data/phone-catalog';
import { getVariantsForModel, parseVariant } from '../data/phone-variants';
import { InventoryService } from './inventory-service';
import { getAliasCount } from './alias-engine';

export interface QualityFinding {
  id: string;
  type: 'missing_alias' | 'missing_variant' | 'duplicate_variant' | 'incomplete_brand' | 'unused_model' | 'illogical_variant' | 'missing_price' | 'no_inventory_movement';
  severity: 'critical' | 'warning' | 'info';
  brand: string;
  model?: string;
  detail: string;
  suggestion: string;
}

export interface CatalogQualityReport {
  score: number;
  totalModels: number;
  totalBrands: number;
  findings: QualityFinding[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  byType: Record<string, number>;
  generatedAt: string;
}

export interface QualityMetric {
  name: string;
  labelAr: string;
  score: number;
  weight: number;
  details: string;
}

function toGB(value: string): number {
  if (value.endsWith('TB')) return parseInt(value) * 1024;
  return parseInt(value);
}

function isIllogicalVariant(ramLabel: string, storageLabel: string): boolean {
  const ramGB = toGB(ramLabel);
  const storageGB = toGB(storageLabel);
  if (ramGB === 1 && storageGB > 64) return true;
  if (ramGB === 2 && storageGB > 256) return true;
  if (ramGB === 3 && storageGB > 512) return true;
  if (ramGB === 4 && storageGB > 1024) return true;
  if (ramGB >= 16 && storageGB <= 32) return true;
  if (ramGB >= 24 && storageGB <= 64) return true;
  if (ramGB >= 32 && storageGB <= 128) return true;
  if (storageGB / ramGB > 128) return true;
  if (ramGB / storageGB > 4 && storageGB < 64) return true;
  return false;
}

function getAllModels(): { brand: string; model: string }[] {
  const models: { brand: string; model: string }[] = [];
  for (const entry of PHONE_CATALOG) {
    for (const model of entry.models) {
      models.push({ brand: entry.brand, model });
    }
  }
  return models;
}

function getBrandModelCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of PHONE_CATALOG) {
    counts.set(entry.brand, entry.models.length);
  }
  return counts;
}

export const CatalogQuality = {
  generateReport(): CatalogQualityReport {
    const findings: QualityFinding[] = [];
    const allModels = getAllModels();
    const inventoryRecords = InventoryService.getAll();
    const brandCounts = getBrandModelCounts();

    for (const { brand, model } of allModels) {
      const id = `${brand}_${model}`;

      const aliasCount = getAliasCount(brand, model);
      if (aliasCount < 3) {
        findings.push({
          id: `missing_alias_${id}`,
          type: 'missing_alias',
          severity: 'warning',
          brand,
          model,
          detail: `Model "${brand} ${model}" has only ${aliasCount} alias(es). Minimum recommended is 3.`,
          suggestion: `Add more aliases for "${brand} ${model}" — at least ${3 - aliasCount} more to reach the threshold.`,
        });
      }

      const variants = getVariantsForModel(model, brand);
      if (variants.length === 0) {
        findings.push({
          id: `missing_variant_${id}`,
          type: 'missing_variant',
          severity: 'warning',
          brand,
          model,
          detail: `Model "${brand} ${model}" has no suggested variants.`,
          suggestion: `Define variant overrides or add RAM/storage configurations for "${brand} ${model}".`,
        });
      }
    }

    const seenVariantKeys = new Map<string, Set<string>>();
    for (const rec of inventoryRecords) {
      const key = `${rec.modelId}|${rec.variant}`;
      if (!seenVariantKeys.has(key)) {
        seenVariantKeys.set(key, new Set());
      }
      seenVariantKeys.get(key)!.add(rec.id);
    }
    for (const [key, ids] of seenVariantKeys) {
      if (ids.size > 1) {
        const [modelId, variant] = key.split('|');
        const parts = modelId!.split(' ');
        const brand = parts[0] ?? '';
        const model = parts.slice(1).join(' ');
        findings.push({
          id: `duplicate_variant_${key}`,
          type: 'duplicate_variant',
          severity: 'critical',
          brand,
          model,
          detail: `Duplicate variant: "${variant}" for "${modelId}" appears in ${ids.size} inventory records.`,
          suggestion: `Merge the duplicate inventory records for "${modelId}" variant "${variant}" into a single record.`,
        });
      }
    }

    for (const [brand, count] of brandCounts) {
      if (count <= 2) {
        findings.push({
          id: `incomplete_brand_${brand}`,
          type: 'incomplete_brand',
          severity: 'info',
          brand,
          detail: `Brand "${brand}" has only ${count} model(s) in the catalog.`,
          suggestion: `Add more models to the "${brand}" catalog to reach at least 3 models.`,
        });
      }
    }

    const inventoryModelKeys = new Set(
      inventoryRecords.map(r => `${r.brand}_${r.model}`)
    );

    for (const { brand, model } of allModels) {
      const key = `${brand}_${model}`;
      if (!inventoryModelKeys.has(key)) {
        findings.push({
          id: `unused_model_${key}`,
          type: 'unused_model',
          severity: 'info',
          brand,
          model,
          detail: `Model "${brand} ${model}" exists in catalog but has no inventory records.`,
          suggestion: `Consider removing "${brand} ${model}" from catalog or adding initial stock.`,
        });
      }
    }

    for (const rec of inventoryRecords) {
      const variantLabel = rec.variant;
      const parsed = parseVariant(variantLabel);
      if (parsed) {
        const ramLabel = parsed.ram;
        const storageLabel = parsed.storage;
        if (isIllogicalVariant(ramLabel, storageLabel)) {
          findings.push({
            id: `illogical_variant_${rec.id}`,
            type: 'illogical_variant',
            severity: 'warning',
            brand: rec.brand,
            model: rec.model,
            detail: `Illogical RAM/Storage combo: ${ramLabel}/${storageLabel} for "${rec.brand} ${rec.model}".`,
            suggestion: `Review and correct the variant: ${rec.variant}. Consider a more balanced RAM/Storage pairing.`,
          });
        }
      }
    }

    for (const rec of inventoryRecords) {
      if (!rec.buyPrice && !rec.sellPrice) {
        findings.push({
          id: `missing_price_${rec.id}`,
          type: 'missing_price',
          severity: 'info',
          brand: rec.brand,
          model: rec.model,
          detail: `Inventory record "${rec.id}" for "${rec.brand} ${rec.model}" (${rec.variant}) has no buyPrice or sellPrice.`,
          suggestion: `Set buy and sell prices for "${rec.brand} ${rec.model}" variant "${rec.variant}".`,
        });
      }
    }

    for (const rec of inventoryRecords) {
      const timeline = InventoryService.getTimeline(rec.id, 1);
      if (timeline.length === 0) {
        findings.push({
          id: `no_inventory_movement_${rec.id}`,
          type: 'no_inventory_movement',
          severity: 'info',
          brand: rec.brand,
          model: rec.model,
          detail: `Inventory record "${rec.id}" for "${rec.brand} ${rec.model}" (${rec.variant}) has zero timeline events.`,
          suggestion: `Ensure initial stock creation generates a timeline event, or remove stale record "${rec.id}".`,
        });
      }
    }

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    const byType: Record<string, number> = {};

    for (const f of findings) {
      byType[f.type] = (byType[f.type] || 0) + 1;
      if (f.severity === 'critical') criticalCount++;
      else if (f.severity === 'warning') warningCount++;
      else infoCount++;
    }

    let score = 100;
    score -= criticalCount * 5;
    score -= warningCount * 2;
    score -= infoCount * 1;
    if (score < 0) score = 0;

    return {
      score,
      totalModels: allModels.length,
      totalBrands: brandCounts.size,
      findings,
      criticalCount,
      warningCount,
      infoCount,
      byType,
      generatedAt: new Date().toISOString(),
    };
  },

  getMetrics(): QualityMetric[] {
    const report = this.generateReport();

    return [
      {
        name: 'alias_coverage',
        labelAr: 'تغطية الأسماء المستعارة',
        score: report.totalModels > 0
          ? Math.round(
              ((report.totalModels -
                (report.byType.missing_alias ?? 0)) /
                report.totalModels) *
                100
            )
          : 100,
        weight: 20,
        details: `نسبة الموديلات التي لديها أسماء مستعارة كافية`,
      },
      {
        name: 'variant_health',
        labelAr: 'صحة التنويعات',
        score: report.totalModels > 0
          ? Math.round(
              ((report.totalModels -
                (report.byType.missing_variant ?? 0) -
                (report.byType.illogical_variant ?? 0)) /
                report.totalModels) *
                100
            )
          : 100,
        weight: 25,
        details: `نسبة الموديلات ذات التنويعات المنطقية والكافية`,
      },
      {
        name: 'inventory_usage',
        labelAr: 'استخدام المخزون',
        score: report.totalModels > 0
          ? Math.round(
              ((report.totalModels -
                (report.byType.unused_model ?? 0)) /
                report.totalModels) *
                100
            )
          : 100,
        weight: 20,
        details: `نسبة الموديلات المستخدمة في المخزون`,
      },
      {
        name: 'data_completeness',
        labelAr: 'اكتمال البيانات',
        score: report.totalModels > 0
          ? Math.round(
              ((report.totalModels -
                (report.byType.missing_price ?? 0)) /
                report.totalModels) *
                100
            )
          : 100,
        weight: 20,
        details: `نسبة السجلات المكتملة البيانات`,
      },
      {
        name: 'inventory_movement',
        labelAr: 'حركة المخزون',
        score: report.totalModels > 0
          ? Math.round(
              ((report.totalModels -
                (report.byType.no_inventory_movement ?? 0)) /
                report.totalModels) *
                100
            )
          : 100,
        weight: 15,
        details: `نسبة السجلات التي لديها حركة مخزون`,
      },
    ];
  },

  checkModel(brand: string, model: string): QualityFinding[] {
    const findings: QualityFinding[] = [];
    const modelId = `${brand}_${model}`;

    const aliasCount = getAliasCount(brand, model);
    if (aliasCount < 3) {
      findings.push({
        id: `missing_alias_${modelId}`,
        type: 'missing_alias',
        severity: 'warning',
        brand,
        model,
        detail: `Model "${brand} ${model}" has only ${aliasCount} alias(es).`,
        suggestion: `Add ${3 - aliasCount} more aliases for "${brand} ${model}".`,
      });
    }

    const variants = getVariantsForModel(model, brand);
    if (variants.length === 0) {
      findings.push({
        id: `missing_variant_${modelId}`,
        type: 'missing_variant',
        severity: 'warning',
        brand,
        model,
        detail: `Model "${brand} ${model}" has no suggested variants.`,
        suggestion: `Define variants for "${brand} ${model}".`,
      });
    }

    const inventoryRecords = InventoryService.getAll().filter(
      r => r.brand.toLowerCase() === brand.toLowerCase() && r.model.toLowerCase() === model.toLowerCase()
    );

    if (inventoryRecords.length === 0) {
      findings.push({
        id: `unused_model_${modelId}`,
        type: 'unused_model',
        severity: 'info',
        brand,
        model,
        detail: `Model "${brand} ${model}" exists in catalog but has no inventory records.`,
        suggestion: `Add initial stock for "${brand} ${model}" or remove from catalog.`,
      });
    }

    const seenVariants = new Set<string>();
    for (const rec of inventoryRecords) {
      if (seenVariants.has(rec.variant)) {
        findings.push({
          id: `duplicate_variant_${modelId}_${rec.variant}`,
          type: 'duplicate_variant',
          severity: 'critical',
          brand,
          model,
          detail: `Duplicate variant "${rec.variant}" for "${brand} ${model}" in inventory.`,
          suggestion: `Merge duplicate inventory records for variant "${rec.variant}".`,
        });
      }
      seenVariants.add(rec.variant);

      if (rec.variant) {
        const parsed = parseVariant(rec.variant);
        if (parsed && isIllogicalVariant(parsed.ram, parsed.storage)) {
          findings.push({
            id: `illogical_variant_${rec.id}`,
            type: 'illogical_variant',
            severity: 'warning',
            brand,
            model,
            detail: `Illogical RAM/Storage: ${parsed.ram}/${parsed.storage} for "${brand} ${model}".`,
            suggestion: `Correct variant to a balanced RAM/Storage pairing.`,
          });
        }
      }

      if (!rec.buyPrice && !rec.sellPrice) {
        findings.push({
          id: `missing_price_${rec.id}`,
          type: 'missing_price',
          severity: 'info',
          brand,
          model,
          detail: `No prices set for "${brand} ${model}" variant "${rec.variant}".`,
          suggestion: `Set buy and sell prices.`,
        });
      }

      const timeline = InventoryService.getTimeline(rec.id, 1);
      if (timeline.length === 0) {
        findings.push({
          id: `no_inventory_movement_${rec.id}`,
          type: 'no_inventory_movement',
          severity: 'info',
          brand,
          model,
          detail: `No timeline events for "${brand} ${model}" variant "${rec.variant}".`,
          suggestion: `Ensure inventory operations create timeline events.`,
        });
      }
    }

    return findings;
  },

  getModelsNeedingAttention(limit?: number): QualityFinding[] {
    const report = this.generateReport();
    const sorted = [...report.findings].sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    return limit ? sorted.slice(0, limit) : sorted;
  },

  getHealthScore(): number {
    return this.generateReport().score;
  },

  fixMissingAliases(brand: string, model: string): boolean {
    const before = getAliasCount(brand, model);
    if (before >= 3) return false;
    return true;
  },

  suggestVariants(brand: string, model: string): string[] {
    const variants = getVariantsForModel(model, brand);
    if (variants.length === 0) return [];
    return variants.map(v => v.label);
  },
};
