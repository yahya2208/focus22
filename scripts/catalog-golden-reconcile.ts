/**
 * FOCUS — Golden Catalog Reconciliation (READ-ONLY DISCOVERY, phase CATALOG-GC-R1)
 *
 * Pure local computation. NO database access, NO writes to any DB, NO mutation.
 * It only READS:
 *   - .catalog-store/catalog_models_v1.json            (Golden Catalog, 3,004)
 *   - src/catalog/brands/*.json                        (Runtime SSOT, 866)
 *
 * Identity rules: REUSED from the authoritative TS implementation already
 * proven against the DB in Gate 05 (catalog_model_id, 866/866) and used by the
 * GATE 2 runtime seed:
 *   - brandIdFor(name)  = slugify(name)                     (canonical.ts)
 *   - modelIdFor(b,f)   = `${brandId}-${slugify(model)}`    (canonical.ts)
 *   - resolveModelId(b,f) = MODEL_ID_OVERRIDES ?? modelIdFor (canonical-adapter.ts)
 *
 * Matching is by canonical_id ONLY (per the phase directive).
 *
 * Output:
 *   - catalog-audit/golden-reconcile-evidence.json   (every Golden row + classification)
 *   - catalog-audit/golden-reconcile-gap.csv         (the classified gap rows only)
 *   - console summary used by the report.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from '../src/catalog/canonical';
import { resolveModelId } from '../src/catalog/canonical-adapter';

type Classification =
  | 'MATCHED'
  | 'SAFE_TO_SEED'
  | 'IDENTITY_MISMATCH'
  | 'DUPLICATE'
  | 'COLLISION'
  | 'INVALID_OR_INCOMPLETE'
  | 'OUT_OF_SCOPE'
  | 'NEEDS_REVIEW';

interface GoldenModel {
  id: string;
  brandId: string;
  brandName: string;
  seriesId: string | null;
  seriesName: string | null;
  name: string;
  normalized: string;
  aliases: string[];
  variantCount: number;
}

interface RtModel {
  canonical_id: string;
  brand_id: string;
  name: string;
  series?: string;
  release_year?: number;
  model_numbers: string[];
}

const ROOT = process.cwd();

function loadGolden(): GoldenModel[] {
  return JSON.parse(readFileSync(join(ROOT, '.catalog-store', 'catalog_models_v1.json'), 'utf8'));
}

function loadRuntime(): RtModel[] {
  const dir = join(ROOT, 'src', 'catalog', 'brands');
  const out: RtModel[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const brandId = slugify(j.brand);
    for (const m of j.models) {
      out.push({
        canonical_id: resolveModelId(brandId, m.model),
        brand_id: brandId,
        name: m.model,
        series: m.series,
        release_year: m.releaseYear,
        model_numbers: m.modelNumbers ?? [],
      });
    }
  }
  return out;
}

function normalizeForAlias(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const golden = loadGolden();
const runtime = loadRuntime();

const activeBrands = new Set(runtime.map((r) => r.brand_id));

const rtByCanonical = new Map<string, RtModel>();
for (const r of runtime) if (!rtByCanonical.has(r.canonical_id)) rtByCanonical.set(r.canonical_id, r);

const rtNameLowerByBrand = new Map<string, Set<string>>();
for (const r of runtime) {
  if (!rtNameLowerByBrand.has(r.brand_id)) rtNameLowerByBrand.set(r.brand_id, new Set());
  rtNameLowerByBrand.get(r.brand_id)!.add(r.name.toLowerCase());
}

const rtNameLowerAcrossBrands = new Map<string, Set<string>>();
for (const r of runtime) {
  if (!rtNameLowerAcrossBrands.has(r.name.toLowerCase())) rtNameLowerAcrossBrands.set(r.name.toLowerCase(), new Set());
  rtNameLowerAcrossBrands.get(r.name.toLowerCase())!.add(r.brand_id);
}

interface Row {
  golden_id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  plain_model_id: string;
  canonical_id: string;
  classification: Classification;
  reason: string;
  matched_runtime_name?: string;
  golden_duplicate_count?: number;
}

const rows: Row[] = [];

for (const g of golden) {
  const b = slugify(g.brandName);
  const plain = `${b}-${slugify(g.name)}`;
  const cid = resolveModelId(b, g.name);
  rows.push({
    golden_id: g.id,
    brand_id: b,
    brand_name: g.brandName,
    name: g.name,
    plain_model_id: plain,
    canonical_id: cid,
    classification: 'SAFE_TO_SEED',
    reason: '',
  });
}

const cidCount = new Map<string, number>();
for (const r of rows) cidCount.set(r.canonical_id, (cidCount.get(r.canonical_id) ?? 0) + 1);
const seenCid = new Set<string>();

for (const r of rows) {
  const g = golden.find((x) => x.id === r.golden_id)!;
  const brandName = (g.brandName ?? '').trim();
  const name = (g.name ?? '').trim();

  // 1) INVALID_OR_INCOMPLETE
  if (
    !brandName || !name ||
    brandName.toLowerCase() === 'generic/unknown' ||
    slugify(name) === 'unknown'
  ) {
    r.classification = 'INVALID_OR_INCOMPLETE';
    r.reason = !brandName ? 'blank brand' : brandName.toLowerCase() === 'generic/unknown' ? 'brand="Generic/Unknown"' : slugify(name) === 'unknown' ? 'name slugifies to "unknown"' : 'blank name';
    continue;
  }

  // 2) DUPLICATE — same canonical_id appears more than once inside the Golden set
  if (cidCount.get(r.canonical_id)! > 1 && seenCid.has(r.canonical_id)) {
    r.classification = 'DUPLICATE';
    r.reason = `canonical_id "${r.canonical_id}" appears ${cidCount.get(r.canonical_id)}x in Golden`;
    r.golden_duplicate_count = cidCount.get(r.canonical_id)!;
    continue;
  }
  seenCid.add(r.canonical_id);

  // 3) OUT_OF_SCOPE — brand not among the 18 active runtime brands
  if (!activeBrands.has(r.brand_id)) {
    r.classification = 'OUT_OF_SCOPE';
    r.reason = `brand "${g.brandName}" not in active runtime catalog (18 brands)`;
    continue;
  }

  // 4) MATCHED — exact canonical identity exists in runtime
  const owner = rtByCanonical.get(r.canonical_id);
  if (owner && owner.brand_id === r.brand_id && owner.name === r.name) {
    r.classification = 'MATCHED';
    r.reason = 'exact canonical match in runtime';
    r.matched_runtime_name = owner.name;
    continue;
  }

  // 5) COLLISION — canonical_id already owned by a DIFFERENT runtime model
  if (owner) {
    r.classification = 'COLLISION';
    r.reason = `canonical_id "${r.canonical_id}" is owned by runtime "${owner.brand_id}/${owner.name}" (golden has "${r.brand_id}/${r.name}")`;
    r.matched_runtime_name = owner.name;
    continue;
  }

  // 6) IDENTITY_MISMATCH — same textual name exists in runtime for this brand,
  //    but the computed canonical_id differs (only possible via override asymmetry)
  const sameBrandNames = rtNameLowerByBrand.get(r.brand_id);
  if (sameBrandNames && sameBrandNames.has(name.toLowerCase())) {
    r.classification = 'IDENTITY_MISMATCH';
    r.reason = `runtime has same brand+name but canonical differs (golden cid="${r.canonical_id}")`;
    continue;
  }

  // 7) NEEDS_REVIEW — cross-brand name ambiguity, or alias/name-variant of an
  //    existing runtime model in the same brand
  const crossBrands = rtNameLowerAcrossBrands.get(name.toLowerCase());
  if (crossBrands && [...crossBrands].some((cb) => cb !== r.brand_id)) {
    r.classification = 'NEEDS_REVIEW';
    r.reason = `model name also exists in runtime under brand(s): ${[...crossBrands].join(', ')}`;
    continue;
  }
  const aliasHit = (g.aliases ?? []).some((a) =>
    sameBrandNames?.has(a.toLowerCase()) ||
    [...(rtNameLowerByBrand.get(r.brand_id) ?? [])].some((rn) => normalizeForAlias(a) === normalizeForAlias(rn)),
  );
  if (aliasHit) {
    r.classification = 'NEEDS_REVIEW';
    r.reason = 'golden alias/name is a textual variant of an existing runtime model in same brand';
    continue;
  }

  // 8) SAFE_TO_SEED
  r.classification = 'SAFE_TO_SEED';
  r.reason = 'in-scope brand, unique canonical_id, not present in runtime, no collision';
}

// ── summary ────────────────────────────────────────────────────────────────
const summary: Record<string, number> = {};
for (const r of rows) summary[r.classification] = (summary[r.classification] ?? 0) + 1;

const goldenCids = new Set(rows.map((r) => r.canonical_id));
const runtimeOnly = runtime.filter((r) => !goldenCids.has(r.canonical_id));
const runtimeNoGoldenCounterpart = runtimeOnly.length;
const runtimeByBrandName = new Map<string, RtModel[]>();
for (const r of runtime) {
  if (!runtimeByBrandName.has(`${r.brand_id}|${r.name.toLowerCase()}`)) runtimeByBrandName.set(`${r.brand_id}|${r.name.toLowerCase()}`, []);
  runtimeByBrandName.get(`${r.brand_id}|${r.name.toLowerCase()}`)!.push(r);
}
const runtimeModelsWithGoldenBrandNameButDiffCid = runtime.filter((r) => {
  const g = golden.find((x) => slugify(x.brandName) === r.brand_id && x.name.toLowerCase() === r.name.toLowerCase());
  return g !== undefined && resolveModelId(r.brand_id, r.name) !== r.canonical_id;
});

console.log('=== GOLDEN CATALOG RECONCILIATION (READ-ONLY) ===');
console.log('Golden models read    :', golden.length);
console.log('Runtime models read   :', runtime.length);
console.log('Active brands (runtime):', activeBrands.size);
console.log('Golden distinct cids  :', goldenCids.size);
console.log('');
for (const k of Object.keys(summary).sort()) console.log(`  ${k.padEnd(20)} ${summary[k]}`);
const matched = summary.MATCHED ?? 0;
const gap = golden.length - matched;
const gapSum = gap - (summary.SAFE_TO_SEED ?? 0);
console.log('');
console.log('Matched:', matched, '| Gap (golden minus matched):', gap);
const classified = (summary.SAFE_TO_SEED ?? 0) + (summary.IDENTITY_MISMATCH ?? 0) + (summary.DUPLICATE ?? 0) +
  (summary.COLLISION ?? 0) + (summary.INVALID_OR_INCOMPLETE ?? 0) + (summary.OUT_OF_SCOPE ?? 0) + (summary.NEEDS_REVIEW ?? 0);
console.log('Sum of the 7 gap classifications:', classified, '| check:', classified === gap ? 'OK' : 'MISMATCH!');
console.log('');
console.log('Runtime-only (no Golden counterpart):', runtimeNoGoldenCounterpart);
console.log('Runtime models w/ same brand+name as Golden but different cid:', runtimeModelsWithGoldenBrandNameButDiffCid.length);

// ── write evidence ──────────────────────────────────────────────────────────
const evidence = {
  generatedAt: new Date().toISOString(),
  identity: 'resolveModelId(brandIdFor(name)) + MODEL_ID_OVERRIDES (src/catalog/canonical*.ts)',
  goldenSource: '.catalog-store/catalog_models_v1.json',
  runtimeSource: 'src/catalog/brands/*.json (== DB catalog_models, proven by GATE 2 + Gate 05)',
  goldenTotal: golden.length,
  runtimeTotal: runtime.length,
  summary,
  matched,
  gap,
  runtimeOnlyCount: runtimeNoGoldenCounterpart,
  runtimeOnly: runtimeOnly.map((r) => ({ canonical_id: r.canonical_id, brand_id: r.brand_id, name: r.name })),
  runtimeBrandNameCidMismatch: runtimeModelsWithGoldenBrandNameButDiffCid.map((r) => ({
    canonical_id: r.canonical_id, brand_id: r.brand_id, name: r.name,
  })),
  rows: rows.map((r) => ({ ...r })),
};

writeFileSync(join(ROOT, 'catalog-audit', 'golden-reconcile-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

const gapRows = rows.filter((r) => r.classification !== 'MATCHED');
const csv = ['classification,brand_id,brand_name,name,canonical_id,plain_model_id,golden_id,reason,match']
  .concat(gapRows.map((r) => [
    r.classification, `"${r.brand_id}"`, `"${r.brand_name}"`, `"${r.name}"`, `"${r.canonical_id}"`, `"${r.plain_model_id}"`, `"${r.golden_id}"`, `"${r.reason.replace(/"/g, "'")}"`, `"${r.matched_runtime_name ?? ''}"`,
  ].join(',')))
  .join('\n');
writeFileSync(join(ROOT, 'catalog-audit', 'golden-reconcile-gap.csv'), csv, 'utf8');

console.log('Wrote catalog-audit/golden-reconcile-evidence.json and catalog-audit/golden-reconcile-gap.csv');
