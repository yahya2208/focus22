import { seedCatalog, verifyCatalog } from './seeder';

const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');
const quiet = args.includes('--quiet') || args.includes('-q');

console.log('=== Catalog Seeder ===');
console.log(`Mode: ${force ? 'force re-seed' : 'incremental'}\n`);

const result = seedCatalog({ force });

if (!quiet) {
  console.log('Results:');
  console.log(`  Brands:  ${result.brands}`);
  console.log(`  Models:  ${result.models}`);
  console.log(`  Variants: ${result.variants}`);
  console.log(`  Aliases: ${result.aliases}`);
}

const stats = verifyCatalog();
console.log('\n=== Verification ===');
console.log(`Coverage: ${stats.coveragePercent.toFixed(1)}%`);
console.log(`Duplicates: ${stats.duplicateCount}`);
console.log(`Missing aliases (<3): ${stats.missingAliasCount}`);

if (stats.duplicateCount > 0) {
  console.log('\n⚠ WARNING: Duplicate models found!');
}
if (stats.missingAliasCount > 0) {
  console.log(`\n⚠ ${stats.missingAliasCount} models have fewer than 3 aliases`);
}

console.log('\nDone.');
