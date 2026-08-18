/**
 * FOCUS — GC-R3 APPLY PREPARATION (READ-ONLY)
 *
 * Produces the authoritative APPLY candidate dataset + decision matrices +
 * proposed (NOT applied) MODEL_ID_OVERRIDES from the frozen GC-R2 evidence.
 * No DB access, no mutation, no override change, no seeding.
 *
 * Identity reused VERBATIM from the established implementation (no recompute
 * with a different algorithm): slugify(), resolveModelId(), MODEL_ID_OVERRIDES
 * as in src/catalog/canonical.ts + canonical-adapter.ts.
 *
 * Outputs (catalog-audit/gc-r3/):
 *   approved-candidate-template.csv      A: 1,264 (SAFE_TO_SEED minus 21 '+' bases)
 *   plus-pair-decision-matrix.csv        B: 35 active '+' pairs
 *   needs-review-decision-matrix.csv     C: 17
 *   proposed-model-id-overrides.json     proposed (NOT applied) overrides
 *   runtime-only-protection.csv          F: 251
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from '../src/catalog/canonical';
import { resolveModelId } from '../src/catalog/canonical-adapter';

const ROOT = process.cwd();
const OUT = join(ROOT, 'catalog-audit', 'gc-r3');
mkdirSync(OUT, { recursive: true });

const csv = (r: string[]) => r.map((x) => `"${(x ?? '').toString().replace(/"/g, "'")}"`).join(',');
const csvFile = (name: string, header: string[], rows: string[][]) =>
  writeFileSync(join(OUT, name), [header.map((h) => `"${h}"`).join(','), ...rows.map(csv)].join('\n'), 'utf8');

// ── frozen evidence + sources ────────────────────────────────────────────────
const ev = JSON.parse(readFileSync(join(ROOT, 'catalog-audit', 'golden-reconcile-evidence.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(ROOT, '.catalog-store', 'catalog_models_v1.json'), 'utf8'));
const byId = new Map(golden.map((g: any) => [g.id, g]));

const runtime: { canonical_id: string; brand_id: string; name: string; series: string; release_year: string; model_numbers: string }[] = [];
for (const f of readdirSync(join(ROOT, 'src', 'catalog', 'brands'))) {
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
const rtByBrand = new Map<string, Map<string, string>>(); // brand_id -> name(lower) -> canonical_id
for (const r of runtime) {
  if (!rtByBrand.has(r.brand_id)) rtByBrand.set(r.brand_id, new Map());
  rtByBrand.get(r.brand_id)!.set(r.name.toLowerCase(), r.canonical_id);
}
const rtNameAcross = new Map<string, string[]>(); // name(lower) -> [{brand_id, canonical_id}]
for (const r of runtime) {
  if (!rtNameAcross.has(r.name.toLowerCase())) rtNameAcross.set(r.name.toLowerCase(), []);
  rtNameAcross.get(r.name.toLowerCase())!.push(r.canonical_id);
}

// ── A) approved candidates = SAFE_TO_SEED minus the 21 '+' bases ─────────────
const cidCount = new Map<string, number>();
for (const r of ev.rows) cidCount.set(r.canonical_id, (cidCount.get(r.canonical_id) ?? 0) + 1);
const plusBaseCids = new Set<string>();
for (const r of ev.rows) {
  if (r.classification === 'SAFE_TO_SEED' && (cidCount.get(r.canonical_id) ?? 0) > 1) plusBaseCids.add(r.canonical_id);
}

const safeRows = ev.rows.filter((r: any) => r.classification === 'SAFE_TO_SEED');
const A = safeRows.filter((r: any) => !plusBaseCids.has(r.canonical_id));
const A_bases = safeRows.filter((r: any) => plusBaseCids.has(r.canonical_id));

csvFile('approved-candidate-template.csv',
  ['canonical_id', 'brand_id', 'brand_name', 'name', 'series', 'release_year', 'model_numbers',
   'aliases', 'source', 'reason', 'plus_pair_status', 'blocked_by', 'owner_decision', 'seed_after_decision', 'missing_field_status'],
  A.map((r: any) => {
    const g = byId.get(r.golden_id) ?? {};
    return [r.canonical_id, r.brand_id, r.brand_name, r.name, g.seriesName ?? '',
      'N/A (not in Golden source)', 'N/A (not in Golden source)',
      (g.aliases ?? []).join(';'), `.catalog-store/catalog_models_v1.json#${r.golden_id}`,
      r.reason, 'NOT_PLUS_PAIR', 'none', 'OWNER_DECISION_REQUIRED', 'yes',
      'release_year + model_numbers: decision required (no repo source; RPC accepts NULL/empty)'];
  }));

// ── B) plus-pair decision matrix (35 active pairs) ───────────────────────────
const dupGroups = new Map<string, { rows: { name: string; classification: string; golden_id: string }[]; brand: string; brandName: string }>();
for (const r of ev.rows) {
  if ((cidCount.get(r.canonical_id) ?? 0) > 1) {
    if (!dupGroups.has(r.canonical_id)) {
      dupGroups.set(r.canonical_id, { rows: [], brand: r.brand_id, brandName: r.brand_name });
    }
    dupGroups.get(r.canonical_id)!.rows.push({ name: r.name, classification: r.classification, golden_id: r.golden_id });
  }
}
const activeBrands = new Set(runtime.map((r) => r.brand_id));
const activePairs: { cid: string; base: string; plus: string; baseCls: string; brand: string; brandName: string }[] = [];
for (const [cid, g] of [...dupGroups].sort()) {
  if (!activeBrands.has(g.brand)) continue; // 20 pairs are in out-of-scope brands
  const dup = g.rows.find((r) => r.classification === 'DUPLICATE');
  const first = g.rows.find((r) => r.classification !== 'DUPLICATE');
  if (!dup || !first) continue;
  activePairs.push({ cid, base: first.name, plus: dup.name, baseCls: first.classification, brand: g.brand, brandName: g.brandName });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const plusMatrix: string[][] = [];
const proposedOverrides: Record<string, Record<string, string>> = {};
const flatOverrides: { brand: string; name: string; to: string; kind: string; note: string }[] = [];
let overrideCount = 0;

for (const p of activePairs) {
  // runtime ownership of plus variant: does runtime hold the SAME device under a "Plus" spelling?
  let plusOwned = '';
  const candidates = [p.plus.replace(/\+/g, 'Plus'), p.plus.replace(/\+/g, ' Plus')];
  const rt = rtByBrand.get(p.brand);
  if (rt) {
    for (const cand of candidates) {
      const hit = rt.get(cand.toLowerCase());
      if (hit) { plusOwned = `${cand} -> ${hit}`; break; }
    }
  }
  const baseInRuntime = p.baseCls === 'MATCHED';
  let proposedPlus: string;
  let seedable: string;
  let note: string;
  if (plusOwned) {
    const ownedCid = plusOwned.split(' -> ')[1];
    proposedPlus = ownedCid;
    seedable = `NO — runtime already represents the device as "${plusOwned.split(' -> ')[0]}"; absorb golden "${p.plus}" as alias, do not seed`;
    note = 'SPECIAL_IDENTITY: golden "+" spelling and runtime "Plus" spelling are the same device. Unify via override to the existing runtime cid; absorb as alias.';
  } else {
    proposedPlus = `${p.cid}-plus`;
    seedable = 'YES (after override + owner approval)';
    note = 'Convention follows existing MODEL_ID_OVERRIDES (Redmi Note 13 Pro+ -> xiaomi-redmi-note-13-pro-plus).';
  }
  if (!proposedOverrides[p.brand]) proposedOverrides[p.brand] = {};
  proposedOverrides[p.brand][p.plus] = proposedPlus;
  flatOverrides.push({
    brand: p.brand, name: p.plus, to: proposedPlus,
    kind: plusOwned ? 'UNIFY_ABSORB' : 'PLUS_VARIANT',
    note: plusOwned ? note : `${p.plus} and ${p.base} both slug to ${p.cid}; override gives the '+' model its own canonical identity.`,
  });
  overrideCount++;

  plusMatrix.push([
    p.brand, p.brandName, p.base, p.plus, p.cid,
    baseInRuntime ? `MATCHED (${p.cid} in runtime as "${p.base}")` : `SAFE_TO_SEED (${p.cid} not in runtime)`,
    plusOwned || 'ABSENT_FROM_RUNTIME',
    plusOwned ? 'YES' : 'NO',
    proposedPlus,
    p.brand, p.plus,
    'yes',
    seedable,
    'OWNER_DECISION_REQUIRED',
    note,
  ]);
}

// ── C) needs-review decision matrix (17) ─────────────────────────────────────
const reviewRows = ev.rows.filter((r: any) => r.classification === 'NEEDS_REVIEW');
const reviewMatrix: string[][] = [];
for (const r of reviewRows) {
  const g = byId.get(r.golden_id) ?? {};
  const conflicts = rtNameAcross.get(r.name.toLowerCase()) ?? [];
  const conflictDescs = conflicts.map((cid) => {
    const rr = runtime.find((x) => x.canonical_id === cid);
    return `${rr ? rr.brand_id : '?'}/${rr ? rr.name : '?'} (${cid})`;
  });
  const isSameBrandSpelling = conflicts.length === 0 && g.seriesName === 'Galaxy Z';
  let recommended = '';
  let requiredOverride = 'none';
  let risk = '';
  if (isSameBrandSpelling) {
    const target = r.name === 'Galaxy Z Flip7' ? 'samsung-galaxy-z-flip-7' : 'samsung-galaxy-z-fold-7';
    recommended = `UNIFY to runtime "${r.name.replace('7', ' 7')}" (${target}) — absorb as alias, do not seed`;
    requiredOverride = `"${r.brand_id}" "${r.name}" -> ${target}`;
    risk = 'HIGH — seeding without decision creates a SECOND canonical_id for the same physical device (samsung-galaxy-z-flip-7/-fold-7 already in runtime) -> duplicate physical model under 2 cids.';
    flatOverrides.push({ brand: r.brand_id, name: r.name, to: target, kind: 'UNIFY_ABSORB', note: `Golden "${r.name}" and runtime "${r.name.replace('7', ' 7')}" are the same device with different spacing.` });
    if (!proposedOverrides[r.brand_id]) proposedOverrides[r.brand_id] = {};
    proposedOverrides[r.brand_id][r.name] = target;
    overrideCount++;
  } else {
    recommended = `SEED AS-IS (${r.canonical_id}) — distinct physical model; name coincidence only`;
    risk = 'LOW-MEDIUM — no canonical_id collision (brand prefix differs); risk is catalog correctness if the device is actually the same physical model misattributed to the wrong brand.';
  }
  reviewMatrix.push([
    r.brand_name, r.name, r.canonical_id,
    conflictDescs.map((c) => c.split(' (')[0]).join('; '),
    conflictDescs.map((c) => c.split(' (')[1]?.replace(')', '') ?? '').join('; '),
    r.reason,
    recommended,
    requiredOverride,
    risk,
    'OWNER_DECISION_REQUIRED',
  ]);
}

// ── F) runtime-only protection (251) ─────────────────────────────────────────
csvFile('runtime-only-protection.csv',
  ['canonical_id', 'brand_id', 'name', 'series', 'release_year', 'model_numbers', 'protection_rule'],
  ev.runtimeOnly.map((r: any) => {
    const rr = runtime.find((x) => x.canonical_id === r.canonical_id) ?? {};
    return [r.canonical_id, r.brand_id, r.name, rr.series ?? '', rr.release_year ?? '',
      rr.model_numbers ?? '',
      'MUST NOT be overwritten by Golden: canonical_id is owned by Runtime; Golden has no counterpart (Golden is an incomplete snapshot, not authoritative).'];
  }));

// ── proposed overrides JSON ──────────────────────────────────────────────────
const overrideMeta = {
  status: 'PROPOSED — NOT APPLIED. Requires owner approval + TS change (canonical-adapter.ts MODEL_ID_OVERRIDES) AND SQL mirror change (catalog_model_id() in 05-catalog-create-model-rpc-apply.sql) before any use.',
  generatedAt: new Date().toISOString(),
  identityRule: 'resolveModelId() = MODEL_ID_OVERRIDES[brand][name] ?? modelIdFor(brand,name); "-plus" suffix follows the established Redmi Note Pro+ convention.',
  total: overrideCount,
  counts: {
    plus_variant_new_cid: flatOverrides.filter((o) => o.kind === 'PLUS_VARIANT').length,
    unify_absorb: flatOverrides.filter((o) => o.kind === 'UNIFY_ABSORB').length,
  },
};
writeFileSync(join(OUT, 'proposed-model-id-overrides.json'),
  JSON.stringify({ meta: overrideMeta, overrides: proposedOverrides, entries: flatOverrides }, null, 2), 'utf8');

// ── CSVs ─────────────────────────────────────────────────────────────────────
csvFile('plus-pair-decision-matrix.csv',
  ['brand_id', 'brand_name', 'base_name', 'plus_name', 'current_collided_canonical_id',
   'runtime_ownership_base', 'runtime_ownership_plus', 'plus_spelled_runtime_counterpart',
   'proposed_plus_canonical_id', 'override_key_brand', 'override_key_name',
   'base_unchanged', 'plus_seedable', 'decision_status', 'note'],
  plusMatrix);

csvFile('needs-review-decision-matrix.csv',
  ['golden_brand', 'golden_name', 'golden_canonical_id',
   'runtime_conflict_brand_name', 'runtime_conflict_canonical_id',
   'reason', 'recommended_identity', 'required_override', 'risk_if_seeded_without_decision', 'decision_status'],
  reviewMatrix);

// ── summary ──────────────────────────────────────────────────────────────────
const blockedPlusBases = A_bases.length;
const blockedPlusVariants = activePairs.filter((p) => p.baseCls === 'MATCHED').length + activePairs.filter((p) => p.baseCls === 'SAFE_TO_SEED').length * 2;
const summary = {
  A_independent_candidates: A.length,
  A_plus_pair_bases_excluded: blockedPlusBases,
  safe_to_seed_total: safeRows.length,
  plus_pairs_active: activePairs.length,
  plus_pairs_matched_base: activePairs.filter((p) => p.baseCls === 'MATCHED').length,
  plus_pairs_safe_base: activePairs.filter((p) => p.baseCls === 'SAFE_TO_SEED').length,
  blocked_by_plus_records: blockedPlusVariants,
  needs_review: reviewRows.length,
  invalid: ev.rows.filter((r: any) => r.classification === 'INVALID_OR_INCOMPLETE').length,
  out_of_scope: ev.rows.filter((r: any) => r.classification === 'OUT_OF_SCOPE').length,
  runtime_only: ev.runtimeOnly.length,
  proposed_overrides: overrideCount,
};
writeFileSync(join(OUT, 'gc-r3-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

console.log('=== GC-R3 PREPARE (READ-ONLY) ===');
console.log('A independent candidates:', summary.A_independent_candidates, '(+21 bases excluded from template)');
console.log('SAFE_TO_SEED total:', summary.safe_to_seed_total);
console.log('plus pairs active:', summary.plus_pairs_active, '(matched-base', summary.plus_pairs_matched_base + ', safe-base', summary.plus_pairs_safe_base + ')');
console.log('records blocked by plus:', summary.blocked_by_plus_records);
console.log('needs_review:', summary.needs_review, '| invalid:', summary.invalid, '| out_of_scope:', summary.out_of_scope, '| runtime_only:', summary.runtime_only);
console.log('proposed overrides:', summary.proposed_overrides, '(plus_variant', overrideMeta.counts.plus_variant_new_cid, '+ unify_absorb', overrideMeta.counts.unify_absorb + ')');
console.log('Wrote gc-r3 package to', OUT);
