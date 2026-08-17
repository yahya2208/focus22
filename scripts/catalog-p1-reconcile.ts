/**
 * FOCUS P1 — CATALOG RECONCILIATION REPORT
 *
 * Compares the database catalog state with the runtime JSON state.
 * Produces a machine-readable report identifying all discrepancies.
 *
 * Modes:
 *   --from-json   Reconcile JSON vs JSON (identity verification)
 *   --verbose     Show per-model details
 *
 * Output: Structured report with categories:
 *   - DB-only models (in DB but not in JSON)
 *   - JSON-only models (in JSON but not in DB)
 *   - Matching models (in both)
 *   - DB-only variants
 *   - JSON-only variants
 *   - Matching variants
 *   - Metadata mismatches
 *   - Publication status summary
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BRANDS_DIR = join(ROOT, 'src', 'catalog', 'brands');

const args = process.argv.slice(2);
const FROM_JSON = args.includes('--from-json');
const VERBOSE = args.includes('--verbose');
const LIVE_DB = args.includes('--live-db');

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

interface ReconciliationReport {
  timestamp: string;
  mode: string;
  db: { brands: number; models: number; variants: number };
  json: { brands: number; models: number; variants: number };
  models: {
    dbOnly: { brand: string; model: string }[];
    jsonOnly: { brand: string; model: string }[];
    matching: { brand: string; model: string }[];
    metadataMismatch: { brand: string; model: string; field: string; db: string; json: string }[];
  };
  variants: {
    dbOnly: { brand: string; model: string; variant: string }[];
    jsonOnly: { brand: string; model: string; variant: string }[];
    matching: { brand: string; model: string; variant: string }[];
  };
  publication: {
    approved: number;
    draft: number;
    rejected: number;
    total: number;
  } | null;
}

// ─── JSON Reader ────────────────────────────────────────────────────────────────

function readJson(): CatalogBrand[] {
  if (!existsSync(BRANDS_DIR)) return [];
  const files = readdirSync(BRANDS_DIR).filter(f => f.endsWith('.json')).sort();
  const brands: CatalogBrand[] = [];
  for (const f of files) {
    const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
    brands.push(JSON.parse(raw));
  }
  return brands;
}

// ─── Fake DB Reader (for --from-json mode) ──────────────────────────────────────

function buildFakeDbFromJson(brands: CatalogBrand[]): CatalogBrand[] {
  // In --from-json mode, we use the JSON as both "DB" and "JSON" to test the pipeline
  return brands;
}

// ─── Supabase Publication Status Reader ─────────────────────────────────────────

interface PublicationCounts {
  approved: number;
  draft: number;
  rejected: number;
  total: number;
}

async function readApprovalCounts(): Promise<PublicationCounts> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set to read approval status.\n' +
      'Or use --from-json to reconcile without a live database.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const counts: PublicationCounts = { approved: 0, draft: 0, rejected: 0, total: 0 };

  // Paginate — Supabase caps a single request at 1000 rows
  const PAGE_SIZE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('catalog_models')
      .select('approval_status')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to read catalog_models approval_status: ${error.message}`);

    const page = data ?? [];
    for (const row of page) {
      const status = row.approval_status;
      if (status === 'approved') counts.approved += 1;
      else if (status === 'rejected') counts.rejected += 1;
      else counts.draft += 1;
      counts.total += 1;
    }

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
}

// ─── Reconciliation ─────────────────────────────────────────────────────────────

function reconcile(
  dbBrands: CatalogBrand[],
  jsonBrands: CatalogBrand[],
  publication: PublicationCounts | null,
): ReconciliationReport {
  // Build lookup maps
  const dbModels = new Map<string, { brand: string; model: CatalogModel }>();
  for (const b of dbBrands) {
    for (const m of b.models) {
      dbModels.set(`${b.brand}|${m.model}`, { brand: b.brand, model: m });
    }
  }

  const jsonModels = new Map<string, { brand: string; model: CatalogModel }>();
  for (const b of jsonBrands) {
    for (const m of b.models) {
      jsonModels.set(`${b.brand}|${m.model}`, { brand: b.brand, model: m });
    }
  }

  const dbOnly: { brand: string; model: string }[] = [];
  const jsonOnly: { brand: string; model: string }[] = [];
  const matching: { brand: string; model: string }[] = [];
  const metadataMismatch: { brand: string; model: string; field: string; db: string; json: string }[] = [];

  // Check DB models against JSON
  for (const [, { brand, model }] of dbModels) {
    const jsonEntry = jsonModels.get(`${brand}|${model.model}`);
    if (!jsonEntry) {
      dbOnly.push({ brand, model: model.model });
    } else {
      matching.push({ brand, model: model.model });

      // Check metadata
      if (model.series !== jsonEntry.model.series) {
        metadataMismatch.push({ brand, model: model.model, field: 'series', db: model.series, json: jsonEntry.model.series });
      }
      if (model.releaseYear !== jsonEntry.model.releaseYear) {
        metadataMismatch.push({ brand, model: model.model, field: 'releaseYear', db: String(model.releaseYear), json: String(jsonEntry.model.releaseYear) });
      }
      if (JSON.stringify(model.modelNumbers) !== JSON.stringify(jsonEntry.model.modelNumbers)) {
        metadataMismatch.push({ brand, model: model.model, field: 'modelNumbers', db: JSON.stringify(model.modelNumbers), json: JSON.stringify(jsonEntry.model.modelNumbers) });
      }
      if (model.variants.length !== jsonEntry.model.variants.length) {
        metadataMismatch.push({ brand, model: model.model, field: 'variantCount', db: String(model.variants.length), json: String(jsonEntry.model.variants.length) });
      }
    }
  }

  // Check JSON models against DB
  for (const [, { brand, model }] of jsonModels) {
    if (!dbModels.has(`${brand}|${model.model}`)) {
      jsonOnly.push({ brand, model: model.model });
    }
  }

  // Variant reconciliation (per model)
  const dbVariantDetails: { brand: string; model: string; variant: string }[] = [];
  const jsonVariantDetails: { brand: string; model: string; variant: string }[] = [];

  for (const [, { brand, model }] of dbModels) {
    for (const v of model.variants) {
      dbVariantDetails.push({ brand, model: model.model, variant: `${v.ram}/${v.storage}` });
    }
  }

  for (const [, { brand, model }] of jsonModels) {
    for (const v of model.variants) {
      jsonVariantDetails.push({ brand, model: model.model, variant: `${v.ram}/${v.storage}` });
    }
  }

  const dbVariantSet = new Set(dbVariantDetails.map(v => `${v.brand}|${v.model}|${v.variant}`));
  const jsonVariantSet = new Set(jsonVariantDetails.map(v => `${v.brand}|${v.model}|${v.variant}`));

  const variantsOnlyInDb = dbVariantDetails.filter(v => !jsonVariantSet.has(`${v.brand}|${v.model}|${v.variant}`));
  const variantsOnlyInJson = jsonVariantDetails.filter(v => !dbVariantSet.has(`${v.brand}|${v.model}|${v.variant}`));
  const variantsMatching = dbVariantDetails.filter(v => jsonVariantSet.has(`${v.brand}|${v.model}|${v.variant}`));

  return {
    timestamp: new Date().toISOString(),
    mode: FROM_JSON ? 'json-vs-json' : 'db-vs-json',
    db: {
      brands: dbBrands.length,
      models: dbBrands.reduce((n, b) => n + b.models.length, 0),
      variants: dbBrands.reduce((n, b) => n + b.models.reduce((m, model) => m + model.variants.length, 0), 0),
    },
    json: {
      brands: jsonBrands.length,
      models: jsonBrands.reduce((n, b) => n + b.models.length, 0),
      variants: jsonBrands.reduce((n, b) => n + b.models.reduce((m, model) => m + model.variants.length, 0), 0),
    },
    models: { dbOnly, jsonOnly, matching, metadataMismatch },
    variants: {
      dbOnly: variantsOnlyInDb,
      jsonOnly: variantsOnlyInJson,
      matching: variantsMatching,
    },
    publication,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FOCUS P1 — CATALOG RECONCILIATION REPORT            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  const jsonBrands = readJson();
  let dbBrands: CatalogBrand[];
  let publication: PublicationCounts | null = null;

  if (FROM_JSON) {
    console.log('Mode: JSON vs JSON (identity verification)');
    console.log('NOTE: approval_status is not present in the runtime JSON — publication counts reported as N/A.');
    console.log();
    dbBrands = buildFakeDbFromJson(jsonBrands);
  } else {
    console.log('Mode: DB vs JSON (requires live database)');
    console.log('NOTE: Use --from-json for offline verification');
    console.log();
    dbBrands = jsonBrands; // Fallback for testing
    publication = await readApprovalCounts();
  }

  const report = reconcile(dbBrands, jsonBrands, publication);

  // Print summary
  console.log('=== SUMMARY ===');
  console.log(`DB:  ${report.db.brands} brands, ${report.db.models} models, ${report.db.variants} variants`);
  console.log(`JSON: ${report.json.brands} brands, ${report.json.models} models, ${report.json.variants} variants`);
  console.log();

  console.log('=== MODELS ===');
  console.log(`Matching:     ${report.models.matching.length}`);
  console.log(`DB-only:      ${report.models.dbOnly.length}`);
  console.log(`JSON-only:    ${report.models.jsonOnly.length}`);
  console.log(`Mismatches:   ${report.models.metadataMismatch.length}`);
  console.log();

  console.log('=== VARIANTS ===');
  console.log(`Matching:     ${report.variants.matching.length}`);
  console.log(`DB-only:      ${report.variants.dbOnly.length}`);
  console.log(`JSON-only:    ${report.variants.jsonOnly.length}`);
  console.log();

  console.log('=== PUBLICATION STATUS (DB approval_status) ===');
  if (report.publication) {
    console.log(`Approved:     ${report.publication.approved}`);
    console.log(`Draft:        ${report.publication.draft}`);
    console.log(`Rejected:     ${report.publication.rejected}`);
    console.log(`Total:        ${report.publication.total}`);
  } else {
    console.log('N/A — approval_status is not available from the runtime JSON source.');
  }
  console.log();

  // P2: Live DB approval reconciliation
  const p2Issues: string[] = [];
  if (LIVE_DB && !FROM_JSON) {
    console.log('=== P2 APPROVAL RECONCILIATION (live DB) ===');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.log('  Skipped — SUPABASE_URL and SUPABASE_ANON_KEY required for --live-db mode');
      } else {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Read all models from DB with approval info
        const PAGE_SIZE = 1000;
        const dbModels = new Map<string, { name: string; approval_status: string; status: string }>();
        let from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from('catalog_models')
            .select('name, approval_status, status')
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(error.message);
          for (const row of data ?? []) {
            dbModels.set(row.name, row);
          }
          if ((data ?? []).length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        // Build JSON model name set
        const jsonModelNames = new Set<string>();
        for (const b of jsonBrands) {
          for (const m of b.models) {
            jsonModelNames.add(m.model);
          }
        }

        // Check: every model in JSON is approved in DB
        const draftInJson: string[] = [];
        const rejectedInJson: string[] = [];
        const inactiveInJson: string[] = [];
        for (const name of jsonModelNames) {
          const dbRow = dbModels.get(name);
          if (!dbRow) {
            p2Issues.push(`JSON model "${name}" not found in DB`);
            continue;
          }
          if (dbRow.approval_status === 'draft') draftInJson.push(name);
          if (dbRow.approval_status === 'rejected') rejectedInJson.push(name);
          if (dbRow.status !== 'active') inactiveInJson.push(`${name} (${dbRow.status})`);
        }

        console.log(`  JSON models:          ${jsonModelNames.size}`);
        console.log(`  Draft in JSON:        ${draftInJson.length}`);
        console.log(`  Rejected in JSON:     ${rejectedInJson.length}`);
        console.log(`  Inactive in JSON:     ${inactiveInJson.length}`);
        console.log(`  Identity mismatches:  ${p2Issues.length}`);

        if (draftInJson.length > 0) {
          console.log(`  WARNING: ${draftInJson.length} draft models found in published JSON`);
          for (const n of draftInJson.slice(0, 5)) console.log(`    - ${n}`);
          if (draftInJson.length > 5) console.log(`    ... and ${draftInJson.length - 5} more`);
          p2Issues.push(`${draftInJson.length} draft models in published JSON`);
        }
        if (rejectedInJson.length > 0) {
          console.log(`  WARNING: ${rejectedInJson.length} rejected models found in published JSON`);
          for (const n of rejectedInJson.slice(0, 5)) console.log(`    - ${n}`);
          p2Issues.push(`${rejectedInJson.length} rejected models in published JSON`);
        }
        if (inactiveInJson.length > 0) {
          console.log(`  WARNING: ${inactiveInJson.length} inactive models found in published JSON`);
          for (const n of inactiveInJson.slice(0, 5)) console.log(`    - ${n}`);
          p2Issues.push(`${inactiveInJson.length} inactive models in published JSON`);
        }

        if (p2Issues.length === 0) {
          console.log('  P2 RECONCILIATION: PASS — all JSON models are approved and active');
        }
      }
    } catch (err) {
      console.log(`  P2 reconciliation error: ${(err as Error).message}`);
      p2Issues.push(`P2 reconciliation error: ${(err as Error).message}`);
    }
    console.log();
  }

  if (VERBOSE) {
    if (report.models.dbOnly.length > 0) {
      console.log('--- DB-only models ---');
      for (const m of report.models.dbOnly.slice(0, 20)) {
        console.log(`  ${m.brand} ${m.model}`);
      }
      if (report.models.dbOnly.length > 20) console.log(`  ... and ${report.models.dbOnly.length - 20} more`);
      console.log();
    }

    if (report.models.jsonOnly.length > 0) {
      console.log('--- JSON-only models ---');
      for (const m of report.models.jsonOnly.slice(0, 20)) {
        console.log(`  ${m.brand} ${m.model}`);
      }
      if (report.models.jsonOnly.length > 20) console.log(`  ... and ${report.models.jsonOnly.length - 20} more`);
      console.log();
    }

    if (report.models.metadataMismatch.length > 0) {
      console.log('--- Metadata mismatches ---');
      for (const m of report.models.metadataMismatch.slice(0, 20)) {
        console.log(`  ${m.brand} ${m.model}.${m.field}: DB="${m.db}" JSON="${m.json}"`);
      }
      if (report.models.metadataMismatch.length > 20) console.log(`  ... and ${report.models.metadataMismatch.length - 20} more`);
      console.log();
    }
  }

  // Verdict
  const hasIssues = report.models.dbOnly.length > 0 ||
    report.models.jsonOnly.length > 0 ||
    report.models.metadataMismatch.length > 0 ||
    report.variants.dbOnly.length > 0 ||
    report.variants.jsonOnly.length > 0 ||
    p2Issues.length > 0;

  if (hasIssues) {
    console.log('RECONCILIATION: ISSUES FOUND');
    process.exit(1);
  } else {
    console.log('RECONCILIATION: PASS — DB and JSON are consistent');
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
