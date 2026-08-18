/**
 * FOCUS — Golden Catalog Owner Review (READ-ONLY, GATE GC-R2)
 *
 * Independent recomputation + manifest generation for the owner-review package.
 * PURE local computation. NO database access, NO writes to any DB, NO mutation,
 * NO MODEL_ID_OVERRIDES edits.
 *
 * Reads only:
 *   - .catalog-store/catalog_models_v1.json   (Golden Catalog, 3,004)
 *   - src/catalog/brands/*.json               (Runtime SSOT, 866)
 *   - src/catalog/canonical.ts / canonical-adapter.ts (identity, reused verbatim)
 *
 * Outputs (all under catalog-audit/review/, gitignored):
 *   - owner-review-summary.json               (totals + arithmetic closure)
 *   - manifest-safe-to-seed.csv               (1,285)
 *   - manifest-duplicate.csv                  (55 flagged rows, grouped w/ cause)
 *   - manifest-needs-review.csv               (17)
 *   - manifest-invalid.csv                    (3)
 *   - manifest-out-of-scope.csv               (1,029 + per-brand summary section)
 *   - manifest-runtime-only.csv               (251, authoritative)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from '../src/catalog/canonical';
import { resolveModelId } from '../src/catalog/canonical-adapter';

type Classification =
  | 'MATCHED' | 'SAFE_TO_SEED' | 'IDENTITY_MISMATCH' | 'DUPLICATE'
  | 'COLLISION' | 'INVALID_OR_INCOMPLETE' | 'OUT_OF_SCOPE' | 'NEEDS_REVIEW';

const ROOT = process.cwd();
const OUT = join(ROOT, 'catalog-audit', 'review');
mkdirSync(OUT, { recursive: true });

const normAlias = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const csv = (r: string[]) => r.map((x) => `"${(x ?? '').toString().replace(/"/g, "'")}"`).join(',');
const csvFile = (name: string, header: string[], rows: string[][]) =>
  writeFileSync(join(OUT, name), [header.map((h) => `"${h}"`).join(','), ...rows.map(csv)].join('\n'), 'utf8');

// ── load sources ────────────────────────────────────────────────────────────
const golden = JSON.parse(readFileSync(join(ROOT, '.catalog-store', 'catalog_models_v1.json'), 'utf8'));
const runtime: { canonical_id: string; brand_id: string; name: string; series: string; release_year: string; model_numbers: string }[] = [];
for (const f of readdirSync(join(ROOT, 'src', 'catalog', 'brands')).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join(ROOT, 'src', 'catalog', 'brands', f), 'utf8'));
  const bid = slugify(j.brand);
  for (const m of j.models) {
    runtime.push({
      canonical_id: resolveModelId(bid, m.model),
      brand_id: bid,
      name: m.model,
      series: m.series ?? '',
      release_year: m.releaseYear != null ? String(m.releaseYear) : '',
      model_numbers: (m.modelNumbers ?? []).join(';'),
    });
  }
}

const activeBrands = new Set(runtime.map((r) => r.brand_id));
const rtByCid = new Map(runtime.map((r) => [r.canonical_id, r]));
const rtNamesByBrand = new Map<string, Set<string>>();
const rtNamesAcross = new Map<string, Set<string>>();
for (const r of runtime) {
  if (!rtNamesByBrand.has(r.brand_id)) rtNamesByBrand.set(r.brand_id, new Set());
  rtNamesByBrand.get(r.brand_id)!.add(r.name.toLowerCase());
  if (!rtNamesAcross.has(r.name.toLowerCase())) rtNamesAcross.set(r.name.toLowerCase(), new Set());
  rtNamesAcross.get(r.name.toLowerCase())!.add(r.brand_id);
}

// ── classify (same rule set as R1; recomputed independently) ────────────────
interface Row {
  golden_id: string; brand_id: string; brand_name: string; name: string; series: string;
  aliases: string; plain_model_id: string; canonical_id: string;
  classification: Classification; reason: string; matched_runtime_name: string;
}
const rows: Row[] = golden.map((g: any) => ({
  golden_id: g.id, brand_id: slugify(g.brandName), brand_name: g.brandName, name: g.name,
  series: g.seriesName ?? '', aliases: (g.aliases ?? []).join(';'),
  plain_model_id: `${slugify(g.brandName)}-${slugify(g.name)}`,
  canonical_id: resolveModelId(slugify(g.brandName), g.name),
  classification: 'SAFE_TO_SEED' as Classification, reason: '', matched_runtime_name: '',
}));

const cidCount = new Map<string, number>();
for (const r of rows) cidCount.set(r.canonical_id, (cidCount.get(r.canonical_id) ?? 0) + 1);
const seen = new Set<string>();

for (const r of rows) {
  const brand = r.brand_name.trim();
  const name = r.name.trim();
  if (!brand || !name || brand.toLowerCase() === 'generic/unknown' || slugify(name) === 'unknown') {
    r.classification = 'INVALID_OR_INCOMPLETE';
    r.reason = !brand ? 'blank brand'
      : brand.toLowerCase() === 'generic/unknown' ? 'brand is Generic/Unknown placeholder'
      : slugify(name) === 'unknown' ? 'name slugifies to "unknown"'
      : 'blank name';
    continue;
  }
  if ((cidCount.get(r.canonical_id) ?? 0) > 1 && seen.has(r.canonical_id)) {
    r.classification = 'DUPLICATE';
    r.reason = `canonical_id appears ${cidCount.get(r.canonical_id)}x in Golden`;
    continue;
  }
  seen.add(r.canonical_id);
  if (!activeBrands.has(r.brand_id)) {
    r.classification = 'OUT_OF_SCOPE';
    r.reason = `brand "${r.brand_name}" not among the 18 active runtime brands`;
    continue;
  }
  const owner = rtByCid.get(r.canonical_id);
  if (owner && owner.brand_id === r.brand_id && owner.name === r.name) {
    r.classification = 'MATCHED'; r.reason = 'exact canonical match in runtime'; r.matched_runtime_name = owner.name;
    continue;
  }
  if (owner) {
    r.classification = 'COLLISION';
    r.reason = `cid owned by runtime ${owner.brand_id}/${owner.name} (golden ${r.brand_id}/${r.name})`;
    r.matched_runtime_name = owner.name;
    continue;
  }
  const sameBrandNames = rtNamesByBrand.get(r.brand_id);
  if (sameBrandNames && sameBrandNames.has(name.toLowerCase())) {
    r.classification = 'IDENTITY_MISMATCH';
    r.reason = `runtime has same brand+name but different canonical_id`;
    continue;
  }
  const cross = rtNamesAcross.get(name.toLowerCase());
  if (cross && [...cross].some((cb) => cb !== r.brand_id)) {
    r.classification = 'NEEDS_REVIEW';
    r.reason = `model name also in runtime under brand(s): ${[...cross].join(', ')}`;
    continue;
  }
  const aliasHit = (r.aliases || '').split(';').some((a) =>
    sameBrandNames?.has(a.toLowerCase()) ||
    [...(rtNamesByBrand.get(r.brand_id) ?? [])].some((rn) => normAlias(a) === normAlias(rn)));
  if (aliasHit) {
    r.classification = 'NEEDS_REVIEW';
    r.reason = 'golden alias/name is a textual variant of an existing runtime model in same brand';
    continue;
  }
  r.reason = 'in-scope brand, unique canonical_id, not present in runtime, no collision';
}

const summary: Record<string, number> = {};
for (const r of rows) summary[r.classification] = (summary[r.classification] ?? 0) + 1;

// ── runtime-only (authoritative) ─────────────────────────────────────────────
const goldenCids = new Set(rows.map((r) => r.canonical_id));
const runtimeOnly = runtime.filter((r) => !goldenCids.has(r.canonical_id));

// ── A) SAFE_TO_SEED manifest + per-brand proof ───────────────────────────────
const safe = rows.filter((r) => r.classification === 'SAFE_TO_SEED');
const safeByBrand = new Map<string, number>();
for (const r of safe) safeByBrand.set(r.brand_id, (safeByBrand.get(r.brand_id) ?? 0) + 1);
csvFile('manifest-safe-to-seed.csv',
  ['canonical_id', 'brand_id', 'brand_name', 'name', 'series', 'release_year', 'model_numbers', 'aliases', 'source', 'reason'],
  safe.map((r) => [r.canonical_id, r.brand_id, r.brand_name, r.name, r.series,
    'N/A (not in Golden source)', 'N/A (not in Golden source)', r.aliases,
    `.catalog-store/catalog_models_v1.json#${r.golden_id}`, r.reason]));

// ── B) DUPLICATE manifest (grouped w/ collision cause) ───────────────────────
const dupRows = rows.filter((r) => r.classification === 'DUPLICATE');
const dupGroups = new Map<string, Row[]>();
for (const r of rows) {
  if ((cidCount.get(r.canonical_id) ?? 0) > 1) {
    if (!dupGroups.has(r.canonical_id)) dupGroups.set(r.canonical_id, []);
    dupGroups.get(r.canonical_id)!.push(r);
  }
}
const causeOf = (g: Row[]): string => {
  const names = g.map((r) => r.name);
  const noPlus = names.map((n) => n.replace(/\+/g, ''));
  if (noPlus.every((n) => n.toLowerCase() === noPlus[0].toLowerCase())) return 'PLUS_SIGN_LOSS (slugify drops "+")';
  const alnum = names.map((n) => normAlias(n));
  if (alnum.every((n) => n === alnum[0])) return 'SPACING_PUNCTUATION_NORMALIZATION';
  return 'ALIASING_OTHER_IDENTITY';
};
const dupCsv: string[][] = [];
for (const [cid, g] of [...dupGroups].sort()) {
  const cause = causeOf(g);
  for (const r of g) {
    dupCsv.push([cid, cause, r.golden_id, r.brand_name, r.name, r.aliases,
      `${r.classification}${r.reason ? ` — ${r.reason}` : ''}`]);
  }
}
csvFile('manifest-duplicate.csv',
  ['canonical_id', 'collision_cause', 'golden_id', 'brand_name', 'name', 'aliases', 'row_classification_reason'],
  dupCsv);

// ── C) NEEDS_REVIEW manifest ─────────────────────────────────────────────────
const review = rows.filter((r) => r.classification === 'NEEDS_REVIEW');
csvFile('manifest-needs-review.csv',
  ['golden_id', 'brand_id', 'brand_name', 'name', 'series', 'aliases', 'canonical_id',
   'proposed_identity', 'reason', 'runtime_brands_with_same_name'],
  review.map((r) => [r.golden_id, r.brand_id, r.brand_name, r.name, r.series, r.aliases,
    r.canonical_id, 'NO CHANGE (awaiting owner decision; MODEL_ID_OVERRIDES untouched)', r.reason,
    [...(rtNamesAcross.get(r.name.toLowerCase()) ?? [])].join(', ')]));

// ── D) INVALID manifest ──────────────────────────────────────────────────────
const invalid = rows.filter((r) => r.classification === 'INVALID_OR_INCOMPLETE');
csvFile('manifest-invalid.csv',
  ['golden_id', 'brand_id', 'brand_name', 'name', 'normalized', 'aliases', 'canonical_id', 'reason'],
  invalid.map((r) => {
    const g = golden.find((x: any) => x.id === r.golden_id);
    return [r.golden_id, r.brand_id, r.brand_name, r.name, g?.normalized ?? '', r.aliases, r.canonical_id, r.reason];
  }));

// ── E) OUT_OF_SCOPE breakdown ────────────────────────────────────────────────
const oos = rows.filter((r) => r.classification === 'OUT_OF_SCOPE');
const oosByBrand = new Map<string, number>();
for (const r of oos) oosByBrand.set(r.brand_id, (oosByBrand.get(r.brand_id) ?? 0) + 1);
csvFile('manifest-out-of-scope.csv',
  ['brand_id', 'brand_name', 'count', 'rule'],
  [...oosByBrand].sort((a, b) => b[1] - a[1]).map(([b, n]) =>
    [b, rows.find((r) => r.brand_id === b)!.brand_name, String(n),
     'brand not among the 18 active runtime brands (src/catalog/brands/*.json). NOT permanently excluded — scope is a product decision']));
writeFileSync(join(OUT, 'manifest-out-of-scope-all.csv'),
  [['brand_id', 'brand_name', 'name', 'series', 'canonical_id', 'golden_id'].map((h) => `"${h}"`).join(','),
   ...oos.map((r) => csv([r.brand_id, r.brand_name, r.name, r.series, r.canonical_id, r.golden_id]))].join('\n'), 'utf8');

// ── F) RUNTIME-ONLY manifest ─────────────────────────────────────────────────
csvFile('manifest-runtime-only.csv',
  ['canonical_id', 'brand_id', 'name', 'series', 'release_year', 'model_numbers', 'note'],
  runtimeOnly.map((r) => [r.canonical_id, r.brand_id, r.name, r.series, r.release_year, r.model_numbers,
    Number(r.release_year) >= 2024
      ? 'newer than the 2026-07-29 Golden snapshot (release_year >= 2024)'
      : 'absent from Golden despite release_year <= 2023 — Golden is incomplete for this model']));

// ── G) arithmetic closure ────────────────────────────────────────────────────
const matched = summary.MATCHED ?? 0;
const safeN = summary.SAFE_TO_SEED ?? 0;
const oosN = summary.OUT_OF_SCOPE ?? 0;
const dupN = summary.DUPLICATE ?? 0;
const revN = summary.NEEDS_REVIEW ?? 0;
const invN = summary.INVALID_OR_INCOMPLETE ?? 0;
const colN = summary.COLLISION ?? 0;
const imN = summary.IDENTITY_MISMATCH ?? 0;
const goldenTotal = golden.length;
const runtimeTotal = runtime.length;
const runtimeOnlyN = runtimeOnly.length;
const closureGolden = matched + safeN + oosN + dupN + revN + invN + colN + imN;
const closureRuntime = matched + runtimeOnlyN;

const out = {
  generatedAt: new Date().toISOString(),
  identity: 'resolveModelId(brandIdFor(name)) + MODEL_ID_OVERRIDES (src/catalog/canonical*.ts) — reused verbatim',
  goldenSource: '.catalog-store/catalog_models_v1.json',
  runtimeSource: 'src/catalog/brands/*.json (== DB catalog_models per GATE 2 + Gate 05)',
  goldenTotal, runtimeTotal,
  summary,
  matched,
  runtimeOnlyCount: runtimeOnlyN,
  duplicateGroups: dupGroups.size,
  duplicateFlaggedRows: dupRows.length,
  arithmetic: {
    goldenClosure: `${matched} + ${safeN} + ${oosN} + ${dupN} + ${revN} + ${invN} + ${colN} + ${imN} = ${closureGolden}`,
    goldenCloses: closureGolden === goldenTotal,
    runtimeClosure: `${matched} + ${runtimeOnlyN} = ${closureRuntime}`,
    runtimeCloses: closureRuntime === runtimeTotal,
  },
  safeToSeedByBrand: Object.fromEntries([...safeByBrand].sort((a, b) => b[1] - a[1])),
  safeToSeedSum: safe.length,
  outOfScopeByBrand: Object.fromEntries([...oosByBrand].sort((a, b) => b[1] - a[1])),
  outOfScopeSum: oos.length,
  note_261_vs_251: 'Report Section 12 "261" was a typographical error; evidence and this recomputation both give 251. See runtime-only manifest.',
};
writeFileSync(join(OUT, 'owner-review-summary.json'), JSON.stringify(out, null, 2), 'utf8');

// ── console proof ────────────────────────────────────────────────────────────
console.log('=== GATE GC-R2 OWNER REVIEW (READ-ONLY) ===');
console.log('Golden read:', goldenTotal, '| Runtime read:', runtimeTotal);
console.log('Summary:', JSON.stringify(summary));
console.log('Golden closure:', closureGolden === goldenTotal ? `OK (${closureGolden})` : `FAIL ${closureGolden}`);
console.log(`  ${matched}(M) + ${safeN}(S) + ${oosN}(O) + ${dupN}(D) + ${revN}(R) + ${invN}(I) + ${colN}(C) + ${imN}(IM) = ${closureGolden}`);
console.log('Runtime closure:', closureRuntime === runtimeTotal ? `OK (${closureRuntime})` : `FAIL ${closureRuntime}`);
console.log(`  ${matched}(M) + ${runtimeOnlyN}(RO) = ${closureRuntime}`);
console.log('SAFE_TO_SEED by brand (sum must be 1285):');
for (const [b, n] of [...safeByBrand].sort((a, b) => b[1] - a[1])) console.log(`  ${b.padEnd(12)} ${n}`);
console.log('SAFE_TO_SEED sum =', safe.length, safe.length === 1285 ? 'OK' : 'FAIL');
console.log('DUPLICATE groups:', dupGroups.size, '| flagged rows:', dupRows.length);
console.log('OUT_OF_SCOPE groups:', oosByBrand.size, '| rows:', oos.length);
console.log('NEEDS_REVIEW:', review.length, '| INVALID:', invalid.length);
console.log('Runtime-only (authoritative):', runtimeOnlyN, runtimeOnlyN === 251 ? 'OK' : 'FAIL');
console.log('Wrote manifests to', OUT);
