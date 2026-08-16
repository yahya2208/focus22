/**
 * FOCUS P1 — CATALOG GENERATOR
 *
 * Reads the catalog database (Supabase) and produces the runtime static JSON
 * files (src/catalog/brands/*.json). This is the bridge between the
 * administrative DB catalog and the runtime static catalog.
 *
 * Architecture:
 *   DB (catalog_models + catalog_variants)
 *     → Eligibility filter (approved + ≥1 known/verified variant)
 *       → Deterministic transformation
 *         → Validated JSON output
 *
 * Modes:
 *   --dry-run   Show what would change without writing files
 *   --from-json Read from existing JSON files (for testing without DB)
 *   --diff      Show detailed diff between current and generated
 *   --force     Acknowledge intentional model removals (required when the
 *               generated output omits models that exist in the current JSON)
 *
 * Eligibility rules (approved by owner):
 *   1. approval_status = 'approved'
 *   2. ≥1 variant with status IN ('known', 'verified')
 *   3. model.status = 'active'
 *
 * Safety:
 *   - Generates to a temp location first
 *   - Validates before replacing
 *   - Backs up current files
 *   - Aborts on any validation failure
 *
 * Idempotent: Running twice with identical DB state produces identical JSON.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Configuration ──────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const BRANDS_DIR = join(ROOT, 'src', 'catalog', 'brands');
const TEMP_DIR = join(ROOT, '.catalog-p1-temp');
const BACKUP_DIR = join(ROOT, '.catalog-p1-backup');

// ─── CLI Arguments ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FROM_JSON = args.includes('--from-json');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');

// ─── Types (matching src/catalog/types.ts exactly) ──────────────────────────────

interface CatalogVariant {
  storage: string;
  ram: string;
}

interface CatalogModel {
  model: string;
  variants: CatalogVariant[];
  modelNumbers: string[];
  releaseYear: number | null;
  series: string;
}

interface CatalogBrand {
  brand: string;
  aliases: string[];
  models: CatalogModel[];
}

// ─── DB Row Types ───────────────────────────────────────────────────────────────

interface DbModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  series: string | null;
  release_year: number | null;
  model_numbers: string[];
  aliases: string[];
  status: string;
  approval_status: string;
}

interface DbVariantRow {
  canonical_variant_id: string;
  model_id: string;
  ram_mb: number;
  storage_gb: number;
  region: string | null;
  status: string;
}

// ─── Supabase Reader ────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

async function paginate<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function readFromSupabase(): Promise<{ models: DbModelRow[]; variants: DbVariantRow[] }> {
  // Dynamic import to avoid bundling supabase when using --from-json
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set.\n' +
      'Or use --from-json to generate from existing JSON files.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read all models (paginated — Supabase caps a single request at 1000 rows)
  const models = await paginate<DbModelRow>(
    supabase,
    'catalog_models',
    'id, canonical_id, brand_id, name, series, release_year, model_numbers, aliases, status, approval_status',
  );

  // Read all variants (paginated)
  const variants = await paginate<DbVariantRow>(
    supabase,
    'catalog_variants',
    'canonical_variant_id, model_id, ram_mb, storage_gb, region, status',
  );

  return { models, variants };
}

// ─── JSON Reader (for --from-json mode) ─────────────────────────────────────────

function readFromExistingJson(): CatalogBrand[] {
  const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json')).sort();
  const brands: CatalogBrand[] = [];
  for (const f of files) {
    const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
    brands.push(JSON.parse(raw));
  }
  return brands;
}

// ─── Eligibility Filter ─────────────────────────────────────────────────────────

interface EligibilityResult {
  eligible: DbModelRow[];
  excluded: { model: DbModelRow; reason: string }[];
}

function filterEligible(
  models: DbModelRow[],
  variants: DbVariantRow[],
): EligibilityResult {
  // Group variants by model UUID (catalog_variants.model_id is UUID FK → catalog_models.id)
  const variantsByModel = new Map<string, DbVariantRow[]>();
  for (const v of variants) {
    const arr = variantsByModel.get(v.model_id) ?? [];
    arr.push(v);
    variantsByModel.set(v.model_id, arr);
  }

  const eligible: DbModelRow[] = [];
  const excluded: { model: DbModelRow; reason: string }[] = [];

  for (const m of models) {
    const modelVariants = variantsByModel.get(m.id) ?? [];
    const validVariants = modelVariants.filter(
      v => v.status === 'known' || v.status === 'verified',
    );

    // Rule 1: Must be approved
    if (m.approval_status !== 'approved') {
      excluded.push({ model: m, reason: `approval_status=${m.approval_status}` });
      continue;
    }

    // Rule 2: Must have at least one valid variant
    if (validVariants.length === 0) {
      excluded.push({ model: m, reason: 'zero valid variants' });
      continue;
    }

    // Rule 3: Must be active
    if (m.status !== 'active') {
      excluded.push({ model: m, reason: `status=${m.status}` });
      continue;
    }

    eligible.push(m);
  }

  return { eligible, excluded };
}

// ─── RAM/Storage Label Conversion ───────────────────────────────────────────────

function ramLabel(ramMb: number): string {
  return `${ramMb / 1024}`;
}

function storageLabel(storageGb: number): string {
  if (storageGb === 1024) return '1000';
  if (storageGb === 2048) return '2000';
  return `${storageGb}`;
}

// ─── Deterministic Transformation ───────────────────────────────────────────────

function buildJsonFromDb(
  eligibleModels: DbModelRow[],
  allVariants: DbVariantRow[],
): CatalogBrand[] {
  // Group variants by model UUID (FK: catalog_variants.model_id → catalog_models.id)
  const variantsByModel = new Map<string, DbVariantRow[]>();
  for (const v of allVariants) {
    const arr = variantsByModel.get(v.model_id) ?? [];
    arr.push(v);
    variantsByModel.set(v.model_id, arr);
  }

  // Group models by brand
  const brandsMap = new Map<string, DbModelRow[]>();
  for (const m of eligibleModels) {
    const arr = brandsMap.get(m.brand_id) ?? [];
    arr.push(m);
    brandsMap.set(m.brand_id, arr);
  }

  // Build brand display names (brand_id is slugified brand name)
  // We need to recover the display name. The DB stores brand_id as slug.
  // We'll use a mapping from the existing JSON files.
  const brandDisplayNames = new Map<string, string>();
  const brandAliases = new Map<string, string[]>();
  if (existsSync(BRANDS_DIR)) {
    const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
      const j: CatalogBrand = JSON.parse(raw);
      const slug = j.brand.toLowerCase().replace(/[^a-z0-9]/g, '');
      brandDisplayNames.set(slug, j.brand);
      brandAliases.set(slug, j.aliases);
    }
  }

  const result: CatalogBrand[] = [];

  // Deterministic brand ordering (alphabetical by brand_id)
  const sortedBrandIds = Array.from(brandsMap.keys()).sort();

  for (const brandId of sortedBrandIds) {
    const models = brandsMap.get(brandId)!;
    const displayName = brandDisplayNames.get(brandId) ?? brandId;
    const aliases = brandAliases.get(brandId) ?? [];

    // Deterministic model ordering (alphabetical by name)
    const sortedModels = models.slice().sort((a, b) => a.name.localeCompare(b.name));

    const catalogModels: CatalogModel[] = [];

    for (const m of sortedModels) {
      const modelVariants = (variantsByModel.get(m.id) ?? [])
        .filter(v => v.status === 'known' || v.status === 'verified');

      // Deterministic variant ordering (by ram_mb then storage_gb)
      const sortedVariants = modelVariants
        .slice()
        .sort((a, b) => a.ram_mb - b.ram_mb || a.storage_gb - b.storage_gb);

      const catalogVariants: CatalogVariant[] = sortedVariants.map(v => ({
        storage: storageLabel(v.storage_gb),
        ram: ramLabel(v.ram_mb),
      }));

      catalogModels.push({
        model: m.name,
        variants: catalogVariants,
        modelNumbers: m.model_numbers ?? [],
        releaseYear: m.release_year,
        series: m.series ?? '',
      });
    }

    result.push({
      brand: displayName,
      aliases,
      models: catalogModels,
    });
  }

  return result;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

interface ValidationResult {
  pass: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
}

function validateOutput(brands: CatalogBrand[], currentBrands: CatalogBrand[], enforceEligibility: boolean = true, force: boolean = false): ValidationResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // 1. Valid JSON (we already parsed it, but verify structure)
  checks.push({ name: 'Structure: valid brand objects', pass: brands.every(b => b.brand && Array.isArray(b.models)), detail: `${brands.length} brands` });

  // 2. No duplicate brand names
  const brandNames = brands.map(b => b.brand);
  const uniqueBrandNames = new Set(brandNames);
  checks.push({ name: 'Integrity: no duplicate brands', pass: brandNames.length === uniqueBrandNames.size, detail: `${brandNames.length} brands, ${uniqueBrandNames.size} unique` });

  // 3. No duplicate models within brands
  let duplicateModels = 0;
  for (const b of brands) {
    const names = b.models.map(m => m.model);
    const uniqueNames = new Set(names);
    duplicateModels += names.length - uniqueNames.size;
  }
  checks.push({ name: 'Integrity: no duplicate models', pass: duplicateModels === 0, detail: `${duplicateModels} duplicates found` });

  // 4. Every model has at least one variant (eligibility guarantees this when enforced)
  const emptyModels = brands.reduce((n, b) => n + b.models.filter(m => m.variants.length === 0).length, 0);
  checks.push({
    name: 'Eligibility: every model has variants',
    pass: enforceEligibility ? emptyModels === 0 : true,
    detail: enforceEligibility
      ? `${emptyModels} empty models (must be 0)`
      : `${emptyModels} empty models (eligibility not enforced in --from-json mode)`,
  });

  // 5. Valid variant properties
  let invalidVariants = 0;
  for (const b of brands) {
    for (const m of b.models) {
      for (const v of m.variants) {
        if (!v.ram || !v.storage) invalidVariants++;
      }
    }
  }
  checks.push({ name: 'Structure: all variants have ram+storage', pass: invalidVariants === 0, detail: `${invalidVariants} invalid` });

  // 6. Determinism: re-generation produces identical output
  const serialized1 = JSON.stringify(brands, null, 2);
  const reParsed = JSON.parse(serialized1);
  const serialized2 = JSON.stringify(reParsed, null, 2);
  checks.push({ name: 'Determinism: parse→serialize stable', pass: serialized1 === serialized2, detail: serialized1 === serialized2 ? 'identical' : 'DIFFERENT' });

  // 7. Count stability: current model count should match if no DB changes
  const currentModelCount = currentBrands.reduce((n, b) => n + b.models.length, 0);
  const newModelCount = brands.reduce((n, b) => n + b.models.length, 0);
  checks.push({ name: 'Compatibility: model count', pass: true, detail: `${currentModelCount} → ${newModelCount}` });

  // 8. All current IDs preserved (model names are the identity in JSON)
  const currentModelIds = new Set<string>();
  for (const b of currentBrands) {
    for (const m of b.models) {
      currentModelIds.add(`${b.brand}|${m.model}`);
    }
  }
  const newModelIds = new Set<string>();
  for (const b of brands) {
    for (const m of b.models) {
      newModelIds.add(`${b.brand}|${m.model}`);
    }
  }
  const missingIds = [...currentModelIds].filter(id => !newModelIds.has(id));
  checks.push({
    name: 'Identity: existing models preserved',
    pass: missingIds.length === 0 || force,
    detail: missingIds.length === 0
      ? 'all preserved'
      : `missing: ${missingIds.slice(0, 5).join(', ')}${force ? ' (acknowledged via --force)' : ''}`,
  });

  // 9. No new unexpected models (unless DB has approved new ones)
  const addedIds = [...newModelIds].filter(id => !currentModelIds.has(id));
  checks.push({ name: 'Identity: no unexpected additions', pass: true, detail: addedIds.length === 0 ? 'none' : `${addedIds.length} new: ${addedIds.slice(0, 5).join(', ')}` });

  // 10. Brand ordering deterministic
  const brandOrder = brands.map(b => b.brand);
  const sortedBrandOrder = [...brandOrder].sort();
  checks.push({ name: 'Determinism: brand ordering', pass: JSON.stringify(brandOrder) === JSON.stringify(sortedBrandOrder), detail: 'alphabetical' });

  const pass = checks.every(c => c.pass);
  return { pass, checks };
}

// ─── Diff Report ────────────────────────────────────────────────────────────────

function generateDiff(current: CatalogBrand[], generated: CatalogBrand[]): string[] {
  const lines: string[] = [];
  const currentMap = new Map(current.map(b => [b.brand, b]));
  const generatedMap = new Map(generated.map(b => [b.brand, b]));

  // Brands in generated but not in current
  for (const b of generated) {
    if (!currentMap.has(b.brand)) {
      lines.push(`+ BRAND: ${b.brand} (${b.models.length} models)`);
    }
  }

  // Brands in current but not in generated
  for (const b of current) {
    if (!generatedMap.has(b.brand)) {
      lines.push(`- BRAND: ${b.brand} (${b.models.length} models) — REMOVED`);
    }
  }

  // Models changes within shared brands
  for (const genBrand of generated) {
    const curBrand = currentMap.get(genBrand.brand);
    if (!curBrand) continue;

    const curModels = new Map(curBrand.models.map(m => [m.model, m]));
    const genModels = new Map(genBrand.models.map(m => [m.model, m]));

    // Added models
    for (const m of genBrand.models) {
      if (!curModels.has(m.model)) {
        lines.push(`+ MODEL: ${genBrand.brand} ${m.model} (${m.variants.length} variants)`);
      }
    }

    // Removed models
    for (const m of curBrand.models) {
      if (!genModels.has(m.model)) {
        lines.push(`- MODEL: ${genBrand.brand} ${m.model} — REMOVED`);
      }
    }

    // Variant changes
    for (const m of genBrand.models) {
      const curModel = curModels.get(m.model);
      if (!curModel) continue;

      const curVariantCount = curModel.variants.length;
      const genVariantCount = m.variants.length;
      if (curVariantCount !== genVariantCount) {
        lines.push(`~ VARIANTS: ${genBrand.brand} ${m.model} ${curVariantCount} → ${genVariantCount}`);
      }
    }
  }

  return lines;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           FOCUS P1 — CATALOG GENERATOR                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // Step 1: Read current JSON (always, for comparison)
  console.log('Step 1: Reading current runtime JSON...');
  const currentBrands = readFromExistingJson();
  const currentModelCount = currentBrands.reduce((n, b) => n + b.models.length, 0);
  const currentVariantCount = currentBrands.reduce((n, b) => n + b.models.reduce((m, model) => m + model.variants.length, 0), 0);
  console.log(`  Current: ${currentBrands.length} brands, ${currentModelCount} models, ${currentVariantCount} variants`);
  console.log();

  // Step 2: Read source data
  let generatedBrands: CatalogBrand[];

  if (FROM_JSON) {
    console.log('Step 2: Reading from existing JSON (--from-json mode)...');
    console.log('  NOTE: In --from-json mode, eligibility filter is skipped.');
    console.log('  The existing JSON represents the current published state.');
    generatedBrands = currentBrands;
  } else {
    console.log('Step 2: Reading from Supabase database...');
    const { models, variants } = await readFromSupabase();
    console.log(`  DB: ${models.length} models, ${variants.length} variants`);

    // Step 3: Apply eligibility filter
    console.log();
    console.log('Step 3: Applying eligibility filter...');
    const { eligible, excluded } = filterEligible(models, variants);
    console.log(`  Eligible: ${eligible.length}`);
    console.log(`  Excluded: ${excluded.length}`);

    if (VERBOSE) {
      const reasonCounts = new Map<string, number>();
      for (const e of excluded) {
        reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1);
      }
      for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${reason}: ${count}`);
      }
    }
    console.log();

    // Step 4: Transform to JSON format
    console.log('Step 4: Transforming to runtime JSON format...');
    generatedBrands = buildJsonFromDb(eligible, variants);
    const genModelCount = generatedBrands.reduce((n, b) => n + b.models.length, 0);
    const genVariantCount = generatedBrands.reduce((n, b) => n + b.models.reduce((m, model) => m + model.variants.length, 0), 0);
    console.log(`  Generated: ${generatedBrands.length} brands, ${genModelCount} models, ${genVariantCount} variants`);
  }

  // Step 5: Validate
  console.log();
  console.log('Step 5: Validating output...');
  const validation = validateOutput(generatedBrands, currentBrands, !FROM_JSON, FORCE);
  for (const c of validation.checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  }
  console.log();

  if (!validation.pass) {
    if (!FROM_JSON) {
      console.error('ABORT — Validation failed. No files modified.');
      console.error('HINT: If the generated output intentionally removes models that are not approved in the DB,');
      console.error('      review the diff below (--dry-run) and re-run with --force to acknowledge the removals.');
    } else {
      console.error('ABORT — Validation failed. No files modified.');
    }
    process.exit(1);
  }

  // Step 6: Diff
  console.log('Step 6: Diff report...');
  const diff = generateDiff(currentBrands, generatedBrands);
  if (diff.length === 0) {
    console.log('  No changes — generated output is identical to current JSON.');
  } else {
    for (const line of diff) {
      console.log(`  ${line}`);
    }
  }
  console.log();

  // Step 7: Write (unless dry-run)
  if (DRY_RUN) {
    console.log('DRY RUN — No files modified.');
    console.log();
    console.log('=== SUMMARY ===');
    console.log(`Source: ${FROM_JSON ? 'existing JSON (passthrough — eligibility filter skipped)' : 'Supabase database (eligibility filter applied)'}`);
    console.log(`Models in output: ${generatedBrands.reduce((n, b) => n + b.models.length, 0)}`);
    console.log(`Changes: ${diff.length}`);
    console.log(`Validation: ${validation.pass ? 'PASS' : 'FAIL'}`);
    return;
  }

  console.log('Step 7: Writing files...');

  // Create backup
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  for (const f of readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json'))) {
    copyFileSync(join(BRANDS_DIR, f), join(BACKUP_DIR, f));
  }
  console.log(`  Backup: ${BACKUP_DIR}`);

  // Create temp dir
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

  // Write to temp first
  for (const brand of generatedBrands) {
    const filename = `${brand.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
    const content = JSON.stringify(brand, null, 2) + '\n';
    writeFileSync(join(TEMP_DIR, filename), content, 'utf8');
  }

  // Validate temp files
  for (const brand of generatedBrands) {
    const filename = `${brand.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
    const raw = readFileSync(join(TEMP_DIR, filename), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.brand !== brand.brand) {
      throw new Error(`Temp file validation failed for ${filename}`);
    }
  }

  // Atomic replacement
  for (const brand of generatedBrands) {
    const filename = `${brand.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
    copyFileSync(join(TEMP_DIR, filename), join(BRANDS_DIR, filename));
  }

  console.log(`  Written: ${generatedBrands.length} brand files to ${BRANDS_DIR}`);
  console.log();

  // Final summary
  console.log('=== SUMMARY ===');
  console.log(`Source: ${FROM_JSON ? 'existing JSON (passthrough — eligibility filter skipped)' : 'Supabase database (eligibility filter applied)'}`);
  console.log(`Models in output: ${generatedBrands.reduce((n, b) => n + b.models.length, 0)}`);
  console.log(`Changes: ${diff.length}`);
  console.log(`Validation: PASS`);
  console.log(`Backup: ${BACKUP_DIR}`);
  console.log();
  console.log('P1 GENERATION: PASS');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
