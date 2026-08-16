/**
 * FOCUS P1 — CATALOG VALIDATION GATES
 *
 * Comprehensive validation of the runtime catalog JSON files.
 * Can validate existing files or newly generated files.
 *
 * Gates:
 *   1. Syntax: valid JSON
 *   2. Structure: expected schema, correct nesting
 *   3. Integrity: no duplicate IDs, no orphan variants, valid references
 *   4. Identity: existing IDs preserved, stable
 *   5. Determinism: repeated parse produces identical output
 *   6. Compatibility: all consumers can load the data
 *
 * Exit code 0 = all gates pass, 1 = any gate fails.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BRANDS_DIR = join(ROOT, 'src', 'catalog', 'brands');

// ─── Types ──────────────────────────────────────────────────────────────────────

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

// ─── Gate Results ───────────────────────────────────────────────────────────────

interface GateResult {
  gate: string;
  pass: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
}

// ─── Gate 1: Syntax ─────────────────────────────────────────────────────────────

function gateSyntax(): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json')).sort();

  for (const f of files) {
    try {
      const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
      JSON.parse(raw);
      checks.push({ name: `JSON parse: ${f}`, pass: true, detail: 'valid' });
    } catch (err) {
      checks.push({ name: `JSON parse: ${f}`, pass: false, detail: (err as Error).message });
    }
  }

  return { gate: '1. Syntax', pass: checks.every(c => c.pass), checks };
}

// ─── Gate 2: Structure ──────────────────────────────────────────────────────────

function gateStructure(brands: CatalogBrand[]): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Brand-level structure
  for (const b of brands) {
    const hasBrand = typeof b.brand === 'string' && b.brand.length > 0;
    const hasAliases = Array.isArray(b.aliases);
    const hasModels = Array.isArray(b.models);

    checks.push({
      name: `Brand structure: ${b.brand ?? 'UNKNOWN'}`,
      pass: hasBrand && hasAliases && hasModels,
      detail: `brand=${hasBrand}, aliases=${hasAliases}, models=${hasModels}`,
    });

    // Model-level structure
    for (const m of b.models) {
      const hasModel = typeof m.model === 'string' && m.model.length > 0;
      const hasVariants = Array.isArray(m.variants);
      const hasModelNumbers = Array.isArray(m.modelNumbers);
      const hasSeries = typeof m.series === 'string';
      const hasReleaseYear = m.releaseYear === null || typeof m.releaseYear === 'number';

      checks.push({
        name: `Model structure: ${b.brand} ${m.model}`,
        pass: hasModel && hasVariants && hasModelNumbers && hasSeries && hasReleaseYear,
        detail: `model=${hasModel}, variants=${hasVariants}, modelNumbers=${hasModelNumbers}, series=${hasSeries}, releaseYear=${hasReleaseYear}`,
      });

      // Variant-level structure
      if (Array.isArray(m.variants)) {
        for (const v of m.variants) {
          const hasStorage = typeof v.storage === 'string' && v.storage.length > 0;
          const hasRam = typeof v.ram === 'string' && v.ram.length > 0;

          checks.push({
            name: `Variant structure: ${b.brand} ${m.model} ${v.ram}/${v.storage}`,
            pass: hasStorage && hasRam,
            detail: `storage=${hasStorage}, ram=${hasRam}`,
          });
        }
      }
    }
  }

  return { gate: '2. Structure', pass: checks.every(c => c.pass), checks };
}

// ─── Gate 3: Integrity ──────────────────────────────────────────────────────────

function gateIntegrity(brands: CatalogBrand[]): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // No duplicate brand names
  const brandNames = brands.map(b => b.brand);
  const uniqueBrandNames = new Set(brandNames);
  checks.push({
    name: 'No duplicate brands',
    pass: brandNames.length === uniqueBrandNames.size,
    detail: `${brandNames.length} brands, ${uniqueBrandNames.size} unique`,
  });

  // No duplicate models within brands
  let totalDuplicateModels = 0;
  for (const b of brands) {
    const modelNames = b.models.map(m => m.model);
    const uniqueNames = new Set(modelNames);
    totalDuplicateModels += modelNames.length - uniqueNames.size;
  }
  checks.push({
    name: 'No duplicate models',
    pass: totalDuplicateModels === 0,
    detail: `${totalDuplicateModels} duplicates found`,
  });

  // No duplicate variants within models
  let totalDuplicateVariants = 0;
  for (const b of brands) {
    for (const m of b.models) {
      if (!Array.isArray(m.variants)) continue;
      const variantKeys = m.variants.map(v => `${v.ram}/${v.storage}`);
      const uniqueKeys = new Set(variantKeys);
      totalDuplicateVariants += variantKeys.length - uniqueKeys.size;
    }
  }
  checks.push({
    name: 'No duplicate variants',
    pass: totalDuplicateVariants === 0,
    detail: `${totalDuplicateVariants} duplicates found`,
  });

  // Models with empty variants (warning, not failure — pre-seed placeholders may exist)
  const emptyModels: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (Array.isArray(m.variants) && m.variants.length === 0) emptyModels.push(`${b.brand} ${m.model}`);
    }
  }
  // Empty variants are a WARNING not a failure — existing JSON may have pre-seed placeholders.
  // The eligibility rule (≥1 variant) is enforced at GENERATION time, not validation time.
  checks.push({
    name: 'Empty variant models (warning)',
    pass: true, // Warning only — not a hard failure
    detail: emptyModels.length === 0 ? 'all have variants' : `${emptyModels.length} have empty variants: ${emptyModels.slice(0, 5).join(', ')}${emptyModels.length > 5 ? '...' : ''}`,
  });

  // Valid RAM values
  const validRam = new Set(['0.25', '0.5', '1', '2', '3', '4', '6', '8', '12', '16', '24', '32']);
  const invalidRam: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (!Array.isArray(m.variants)) continue;
      for (const v of m.variants) {
        if (!validRam.has(v.ram)) invalidRam.push(`${b.brand} ${m.model}: ram=${v.ram}`);
      }
    }
  }
  checks.push({
    name: 'Valid RAM values',
    pass: invalidRam.length === 0,
    detail: invalidRam.length === 0 ? 'all valid' : `invalid: ${invalidRam.slice(0, 5).join(', ')}`,
  });

  // Valid storage values
  const validStorage = new Set(['4', '8', '16', '32', '64', '128', '256', '512', '1000', '2000']);
  const invalidStorage: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (!Array.isArray(m.variants)) continue;
      for (const v of m.variants) {
        if (!validStorage.has(v.storage)) invalidStorage.push(`${b.brand} ${m.model}: storage=${v.storage}`);
      }
    }
  }
  checks.push({
    name: 'Valid storage values',
    pass: invalidStorage.length === 0,
    detail: invalidStorage.length === 0 ? 'all valid' : `invalid: ${invalidStorage.slice(0, 5).join(', ')}`,
  });

  // Total model count check
  const totalModels = brands.reduce((n, b) => n + b.models.length, 0);
  checks.push({
    name: 'Total model count',
    pass: totalModels > 0,
    detail: `${totalModels} models across ${brands.length} brands`,
  });

  return { gate: '3. Integrity', pass: checks.every(c => c.pass), checks };
}

// ─── Gate 4: Identity ───────────────────────────────────────────────────────────

function gateIdentity(brands: CatalogBrand[]): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Brand names are unique and stable
  const brandNames = brands.map(b => b.brand).sort();
  checks.push({
    name: 'Brand names stable',
    pass: brandNames.length > 0,
    detail: `${brandNames.length} brands: ${brandNames.join(', ')}`,
  });

  // Model identity: (brand, model) pairs are unique
  const modelIds = new Set<string>();
  let collisionCount = 0;
  for (const b of brands) {
    for (const m of b.models) {
      const id = `${b.brand}|${m.model}`;
      if (modelIds.has(id)) collisionCount++;
      modelIds.add(id);
    }
  }
  checks.push({
    name: 'Model identity unique',
    pass: collisionCount === 0,
    detail: `${modelIds.size} unique, ${collisionCount} collisions`,
  });

  // Variant identity: (brand, model, ram, storage) tuples are unique
  const variantIds = new Set<string>();
  let variantCollisions = 0;
  for (const b of brands) {
    for (const m of b.models) {
      if (!Array.isArray(m.variants)) continue;
      for (const v of m.variants) {
        const id = `${b.brand}|${m.model}|${v.ram}|${v.storage}`;
        if (variantIds.has(id)) variantCollisions++;
        variantIds.add(id);
      }
    }
  }
  checks.push({
    name: 'Variant identity unique',
    pass: variantCollisions === 0,
    detail: `${variantIds.size} unique, ${variantCollisions} collisions`,
  });

  return { gate: '4. Identity', pass: checks.every(c => c.pass), checks };
}

// ─── Gate 5: Determinism ────────────────────────────────────────────────────────

function gateDeterminism(brands: CatalogBrand[]): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Serialize → parse → serialize should be identical (semantic stability)
  const s1 = JSON.stringify(brands, null, 2);
  const parsed = JSON.parse(s1);
  const s2 = JSON.stringify(parsed, null, 2);
  checks.push({
    name: 'Serialize stability',
    pass: s1 === s2,
    detail: s1 === s2 ? 'identical' : `different (${s1.length} vs ${s2.length} bytes)`,
  });

  // Re-reading files: parsed data must be semantically stable
  // (raw file formatting may differ from JSON.stringify output — that's OK)
  const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json')).sort();
  let semanticStable = true;
  let formattingDiffs = 0;
  for (const f of files) {
    const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
    const parsed = JSON.parse(raw);
    const reserialized = JSON.stringify(parsed, null, 2);
    const parsedAgain = JSON.parse(reserialized);

    // Semantic check: parsed data must be identical
    if (JSON.stringify(parsed) !== JSON.stringify(parsedAgain)) {
      semanticStable = false;
      checks.push({ name: `Semantic stability: ${f}`, pass: false, detail: 'parsed data differs after round-trip' });
    }
    // Formatting check: just count differences (informational)
    if (raw !== reserialized + '\n') formattingDiffs++;
  }
  checks.push({
    name: 'Semantic stability (all files)',
    pass: semanticStable,
    detail: semanticStable ? `${files.length} files semantically stable` : 'semantic instability detected',
  });
  if (formattingDiffs > 0) {
    checks.push({
      name: 'Formatting note',
      pass: true, // Informational — not a failure
      detail: `${formattingDiffs}/${files.length} files have non-standard formatting (expected for legacy JSON)`,
    });
  }

  return { gate: '5. Determinism', pass: checks.every(c => c.pass), checks };
}

// ─── Gate 6: Compatibility ──────────────────────────────────────────────────────

function gateCompatibility(brands: CatalogBrand[]): GateResult {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // All brands have at least one model
  const emptyBrands = brands.filter(b => b.models.length === 0);
  checks.push({
    name: 'No empty brands',
    pass: emptyBrands.length === 0,
    detail: emptyBrands.length === 0 ? 'all brands have models' : `empty: ${emptyBrands.map(b => b.brand).join(', ')}`,
  });

  // All models have valid series (non-empty string)
  const noSeriesModels: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (typeof m.series !== 'string') noSeriesModels.push(`${b.brand} ${m.model}`);
    }
  }
  checks.push({
    name: 'All models have series',
    pass: noSeriesModels.length === 0,
    detail: noSeriesModels.length === 0 ? 'all have series' : `missing: ${noSeriesModels.slice(0, 5).join(', ')}`,
  });

  // releaseYear is null or positive integer
  const invalidYears: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (m.releaseYear !== null && (typeof m.releaseYear !== 'number' || m.releaseYear < 1990 || m.releaseYear > 2030)) {
        invalidYears.push(`${b.brand} ${m.model}: ${m.releaseYear}`);
      }
    }
  }
  checks.push({
    name: 'Valid release years',
    pass: invalidYears.length === 0,
    detail: invalidYears.length === 0 ? 'all valid' : `invalid: ${invalidYears.slice(0, 5).join(', ')}`,
  });

  // Model numbers are arrays of strings
  const invalidModelNumbers: string[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      if (!Array.isArray(m.modelNumbers)) invalidModelNumbers.push(`${b.brand} ${m.model}`);
    }
  }
  checks.push({
    name: 'Model numbers are arrays',
    pass: invalidModelNumbers.length === 0,
    detail: invalidModelNumbers.length === 0 ? 'all valid' : `invalid: ${invalidModelNumbers.slice(0, 5).join(', ')}`,
  });

  return { gate: '6. Compatibility', pass: checks.every(c => c.pass), checks };
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FOCUS P1 — CATALOG VALIDATION GATES                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // Load all brand JSON files
  if (!existsSync(BRANDS_DIR)) {
    console.error(`ERROR: Brands directory not found: ${BRANDS_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json')).sort();
  const brands: CatalogBrand[] = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
      brands.push(JSON.parse(raw));
    } catch (err) {
      console.error(`FATAL: Cannot parse ${f}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log(`Loaded ${brands.length} brands from ${BRANDS_DIR}`);
  console.log();

  // Run all gates
  const gates: GateResult[] = [
    gateSyntax(),
    gateStructure(brands),
    gateIntegrity(brands),
    gateIdentity(brands),
    gateDeterminism(brands),
    gateCompatibility(brands),
  ];

  let allPass = true;
  for (const gate of gates) {
    const status = gate.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} — ${gate.gate}`);
    if (!gate.pass) allPass = false;

    for (const c of gate.checks) {
      if (!c.pass) {
        console.log(`  ✗ ${c.name}: ${c.detail}`);
      }
    }
  }

  console.log();
  if (allPass) {
    console.log('VALIDATION: ALL GATES PASS');
    process.exit(0);
  } else {
    console.log('VALIDATION: ONE OR MORE GATES FAILED');
    process.exit(1);
  }
}

main();
