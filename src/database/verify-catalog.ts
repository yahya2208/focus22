import { verifyCatalog } from './seeder';

const stats = verifyCatalog();

console.log('=== Catalog Verification Report ===\n');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`\n--- Summary ---`);
console.log(`Brands:           ${stats.totalBrands}`);
console.log(`Models:           ${stats.totalModels}`);
console.log(`Variants:         ${stats.totalVariants}`);
console.log(`Aliases:          ${stats.totalAliases}`);
console.log(`Coverage:         ${stats.coveragePercent.toFixed(2)}%`);
console.log(`Duplicates:       ${stats.duplicateCount}`);
console.log(`Missing Aliases:  ${stats.missingAliasCount}`);

console.log(`\n--- Models per Brand ---`);
for (const b of stats.brandsWithModels) {
  const seriesStr = b.series.length > 0 ? ` [${b.series.join(', ')}]` : '';
  console.log(`  ${b.brand.padEnd(20)} ${String(b.count).padStart(5)}${seriesStr}`);
}

console.log(`\n--- Scorecard ---`);
const completeness = stats.coveragePercent;
const aliasCoverage = stats.totalModels > 0 ? ((stats.totalModels - stats.missingAliasCount) / stats.totalModels) * 100 : 0;
const uniqueness = stats.totalModels > 0 ? ((stats.totalModels - stats.duplicateCount) / stats.totalModels) * 100 : 0;
const aliasPerModel = stats.totalModels > 0 ? (stats.totalAliases / stats.totalModels) : 0;
console.log(`  Catalog coverage:   ${completeness.toFixed(1)}%`);
console.log(`  Alias coverage:     ${aliasCoverage.toFixed(1)}%`);
console.log(`  Uniqueness:         ${uniqueness.toFixed(1)}%`);
console.log(`  Aliases per model:  ${aliasPerModel.toFixed(2)}`);
