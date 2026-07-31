import { PHONE_CATALOG } from '../src/data/phone-catalog';
import { PHONE_VARIANTS } from '../src/data/phone-variants';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAliasIndex, getAllAliases, getAliasCount } from '../src/services/alias-engine';

buildAliasIndex();

interface AuditBrand {
  brand: string;
  series: { name: string; models: string[] }[];
  models: string[];
  totalModels: number;
  aliasCount: number;
  variantCount: number;
}

interface AuditReport {
  generatedAt: string;
  totalBrands: number;
  totalModels: number;
  totalVariants: number;
  totalAliases: number;
  brands: AuditBrand[];
}

function detectSeries(brand: string, model: string): string | null {
  const ml = model.toLowerCase();
  if (brand === 'Samsung') {
    if (ml.startsWith('galaxy s ultra')) return 'Galaxy S Ultra';
    if (ml.startsWith('galaxy s')) return 'Galaxy S';
    if (ml.startsWith('galaxy z')) return 'Galaxy Z';
    if (ml.startsWith('galaxy note')) return 'Galaxy Note';
    if (ml.startsWith('galaxy tab')) return 'Galaxy Tab';
    if (ml.startsWith('galaxy a')) return 'Galaxy A';
    if (ml.startsWith('galaxy m')) return 'Galaxy M';
    if (ml.startsWith('galaxy f')) return 'Galaxy F';
    if (ml.startsWith('galaxy j')) return 'Galaxy J';
    if (ml.startsWith('galaxy xcover')) return 'Galaxy XCover';
    if (ml.startsWith('galaxy')) return 'Galaxy Other';
    return null;
  }
  if (brand === 'Xiaomi') {
    if (ml.startsWith('redmi note')) return 'Redmi Note';
    if (ml.startsWith('redmi')) return 'Redmi';
    if (ml.startsWith('poco')) return 'POCO';
    if (ml.startsWith('black shark')) return 'Black Shark';
    if (ml.startsWith('mi ')) return 'Xiaomi Mi';
    return 'Xiaomi Other';
  }
  if (brand === 'Apple') {
    if (ml.includes('pro max')) return 'iPhone Pro Max';
    if (ml.includes('pro')) return 'iPhone Pro';
    if (ml.includes('se')) return 'iPhone SE';
    if (ml.includes('mini')) return 'iPhone mini';
    if (ml.includes('plus')) return 'iPhone Plus';
    if (ml.includes('iphone')) return 'iPhone';
    if (ml.includes('ipad pro')) return 'iPad Pro';
    if (ml.includes('ipad air')) return 'iPad Air';
    if (ml.includes('ipad mini')) return 'iPad mini';
    if (ml.includes('ipad')) return 'iPad';
    return null;
  }
  if (brand === 'Huawei') {
    if (ml.startsWith('mate')) return 'Mate';
    if (ml.startsWith('pura')) return 'Pura';
    if (ml.startsWith('p ')) return 'P series';
    if (ml.startsWith('p')) return 'P series';
    if (ml.startsWith('nova')) return 'Nova';
    if (ml.startsWith('enjoy')) return 'Enjoy';
    if (ml.startsWith('y ')) return 'Y series';
    if (ml.startsWith('y')) return 'Y series';
    if (ml.startsWith('ascend')) return 'Ascend';
    return null;
  }
  if (brand === 'Honor') {
    if (ml.startsWith('magic')) return 'Magic';
    if (ml.startsWith('honor x')) return 'Honor X';
    if (ml.startsWith('honor play')) return 'Honor Play';
    if (/^honor\s*\d/.test(ml)) return 'Honor Numbered';
    if (ml.startsWith('x')) return 'Honor X';
    if (ml.startsWith('play')) return 'Honor Play';
    return null;
  }
  if (brand === 'Realme') {
    if (ml.includes('gt')) return 'GT';
    if (ml.includes('narzo')) return 'Narzo';
    if (ml.startsWith('c')) return 'C Series';
    if (/^\d/.test(ml.replace(/^realme\s*/i, ''))) return 'Numbered';
    if (ml.startsWith('x')) return 'X Series';
    return null;
  }
  if (brand === 'OnePlus') {
    if (ml.includes('nord')) return 'Nord';
    if (ml.includes('ace')) return 'Ace';
    if (ml.startsWith('oneplus ') && /^\d/.test(ml.replace('oneplus ', ''))) return 'Flagship';
    if (ml.endsWith('open')) return 'Open';
    return null;
  }
  if (brand === 'Oppo') {
    if (ml.startsWith('find')) return 'Find';
    if (ml.startsWith('reno')) return 'Reno';
    if (ml.startsWith('a ')) return 'A Series';
    if (ml.startsWith('f ')) return 'F Series';
    if (ml.startsWith('k ')) return 'K Series';
    return null;
  }
  if (brand === 'Vivo') {
    if (ml.startsWith('v ')) return 'V Series';
    if (ml.startsWith('y ')) return 'Y Series';
    if (ml.startsWith('iqoo')) return 'iQOO';
    if (ml.startsWith('x ')) return 'X Series';
    if (ml.startsWith('t ')) return 'T Series';
    if (ml.startsWith('s ')) return 'S Series';
    return null;
  }
  if (brand === 'Google') {
    if (ml.startsWith('pixel')) return 'Pixel';
    if (ml.startsWith('nexus')) return 'Nexus';
    return null;
  }
  if (brand === 'Motorola') {
    if (ml.includes('edge')) return 'Edge';
    if (ml.includes('razr')) return 'Razr';
    if (ml.startsWith('moto g')) return 'Moto G';
    if (ml.startsWith('moto e')) return 'Moto E';
    if (ml.startsWith('moto x')) return 'Moto X';
    if (ml.startsWith('moto z')) return 'Moto Z';
    return null;
  }
  if (brand === 'Nokia') {
    if (/^\d/.test(ml)) return 'Android';
    if (ml.startsWith('c')) return 'C Series';
    if (ml.startsWith('g')) return 'G Series';
    if (ml.startsWith('x')) return 'X Series';
    if (ml.startsWith('lumia')) return 'Lumia';
    return null;
  }
  return null;
}

function generateReport(): AuditReport {
  const brands: AuditBrand[] = [];

  for (const entry of PHONE_CATALOG) {
    const seriesMap = new Map<string, string[]>();
    const unsorted: string[] = [];

    for (const model of entry.models) {
      const series = detectSeries(entry.brand, model);
      if (series) {
        if (!seriesMap.has(series)) seriesMap.set(series, []);
        seriesMap.get(series)!.push(model);
      } else {
        unsorted.push(model);
      }
    }

    const seriesList = [...seriesMap.entries()]
      .map(([name, models]) => ({ name, models: models.sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const allModels = [...entry.models].sort();
    const totalAliases = allModels.reduce((sum, m) => sum + getAliasCount(entry.brand, m), 0);
    const modelVariants = PHONE_VARIANTS.length;

    brands.push({
      brand: entry.brand,
      series: seriesList,
      models: allModels,
      totalModels: allModels.length,
      aliasCount: totalAliases,
      variantCount: modelVariants,
    });
  }

  const totalModels = brands.reduce((s, b) => s + b.totalModels, 0);
  const totalAliases = brands.reduce((s, b) => s + b.aliasCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalBrands: brands.length,
    totalModels,
    totalVariants: PHONE_VARIANTS.length,
    totalAliases,
    brands,
  };
}

// CLI: generate both JSON and CSV
const report = generateReport();
const outDir = join(process.cwd(), 'catalog-audit');
mkdirSync(outDir, { recursive: true });

// JSON full report
writeFileSync(join(outDir, 'catalog-audit-full.json'), JSON.stringify(report, null, 2), 'utf8');

// CSV: models per brand
const csvRows = ['brand,series,model,alias_count'];
for (const brand of report.brands) {
  if (brand.series.length > 0) {
    for (const s of brand.series) {
      for (const m of s.models) {
        csvRows.push(`${brand.brand},${s.name},${m},${getAliasCount(brand.brand, m)}`);
      }
    }
    // also list models without series
    const inSeries = new Set(brand.series.flatMap(s => s.models));
    const unassigned = brand.models.filter(m => !inSeries.has(m));
    for (const m of unassigned) {
      csvRows.push(`${brand.brand},,${m},${getAliasCount(brand.brand, m)}`);
    }
  } else {
    for (const m of brand.models) {
      csvRows.push(`${brand.brand},,${m},${getAliasCount(brand.brand, m)}`);
    }
  }
}
writeFileSync(join(outDir, 'catalog-full.csv'), csvRows.join('\n'), 'utf8');

// Summary CSV: one row per brand
const summaryRows = ['brand,total_models,series_count,alias_count'];
for (const brand of report.brands) {
  summaryRows.push(`${brand.brand},${brand.totalModels},${brand.series.length},${brand.aliasCount}`);
}
writeFileSync(join(outDir, 'catalog-summary.csv'), summaryRows.join('\n'), 'utf8');

// Print summary
console.log('\n=== Catalog Audit Report ===');
console.log(`Generated: ${report.generatedAt}`);
console.log(`Brands: ${report.totalBrands}`);
console.log(`Models: ${report.totalModels}`);
console.log(`Variants: ${report.totalVariants}`);
console.log(`Aliases: ${report.totalAliases}`);
console.log('\n--- Models per Brand ---');
for (const b of report.brands) {
  const seriesStr = b.series.length > 0 ? ` [${b.series.map(s => `${s.name}(${s.models.length})`).join(', ')}]` : '';
  console.log(`  ${b.brand.padEnd(25)} ${String(b.totalModels).padStart(5)}${seriesStr}`);
}
console.log(`\nFiles written to ${outDir}/`);
console.log('  catalog-audit-full.json  — full report with per-brand model lists');
console.log('  catalog-full.csv         — every model with series + alias count');
console.log('  catalog-summary.csv      — one row per brand');
