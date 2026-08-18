/**
 * FOCUS — GC-R3 FINAL APPLY PACKAGE BUILDER (READ-ONLY, NO DB, NO SOURCE CHANGE)
 *
 * Emits the final apply package under catalog-audit/gc-r3/apply-final/:
 *   manifests (seed / absorb / excluded / out-of-scope / runtime-only),
 *   pre-baseline SQL, SQL mirror upgrade, seed transaction, post-verify,
 *   rollback, run-order, override before/after diff, review decision table.
 *
 * Runs all collision proofs and prints them. Mutates nothing but the output dir.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modelIdFor, slugify } from '../src/catalog/canonical';
import { resolveModelId, MODEL_ID_OVERRIDES } from '../src/catalog/canonical-adapter';

const ROOT = process.cwd();
const OUT = join(ROOT, 'catalog-audit', 'gc-r3', 'apply-final');
const EXISTING = join(ROOT, 'catalog-audit', 'gc-r3');
mkdirSync(OUT, { recursive: true });

// ── inputs ───────────────────────────────────────────────────────────────────
const ev = JSON.parse(readFileSync(join(ROOT, 'catalog-audit', 'golden-reconcile-evidence.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(ROOT, '.catalog-store', 'catalog_models_v1.json'), 'utf8'));
const byId = new Map(golden.map((g: any) => [g.id, g]));
const proposed = JSON.parse(readFileSync(join(EXISTING, 'proposed-model-id-overrides.json'), 'utf8'));
const approved = readFileSync(join(EXISTING, 'approved-candidate-template.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((l) => l.split('","').map((x) => x.replace(/^"|"$/g, '')));

const csvCell = (x: any) => `"${(x ?? '').toString().replace(/"/g, "'")}"`;
const csv = (r: any[]) => r.map(csvCell).join(',');
const csvFile = (name: string, header: string[], rows: any[][]) =>
  writeFileSync(join(OUT, name), [header.map(csvCell).join(','), ...rows.map(csv)].join('\n'), 'utf8');

// ── runtime (866) from brand files, identity = current resolveModelId ────────
const runtime: { brand_id: string; name: string; canonical_id: string }[] = [];
for (const f of readdirSync(join(ROOT, 'src', 'catalog', 'brands'))) {
  const j = JSON.parse(readFileSync(join(ROOT, 'src', 'catalog', 'brands', f), 'utf8'));
  const bid = slugify(j.brand);
  for (const m of j.models) runtime.push({ brand_id: bid, name: m.model, canonical_id: resolveModelId(bid, m.model) });
}
const runtimeCids = new Set(runtime.map((r) => r.canonical_id));
const runtimeBrandName = new Set(runtime.map((r) => `${r.brand_id}||${r.name}`));
const runtimeBrands = new Set(runtime.map((r) => r.brand_id));

// ── merged override map = existing(4) + proposed(37) = 41 ────────────────────
const merged: Record<string, Record<string, string>> = {};
for (const [b, m] of Object.entries(MODEL_ID_OVERRIDES)) merged[b] = { ...m };
for (const [b, m] of Object.entries(proposed.overrides as Record<string, Record<string, string>>)) {
  merged[b] = { ...(merged[b] ?? {}), ...m };
}
const mergedKeys = Object.values(merged).reduce((s, m) => s + Object.keys(m).length, 0);
const resolveFinal = (brand: string, name: string) => merged[brand]?.[name] ?? modelIdFor(brand, name);

// ── SQL mirror simulation (exact port of 05-catalog-create-model-rpc-apply.sql) ──
const sqlSlug = (name: string) => {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'unknown';
};
const sqlCid = (brand: string, name: string) => {
  const o = merged[brand]?.[name.trim()];
  return o ?? brand.trim() + '-' + sqlSlug(name);
};

// ── PROOF 1: mirror upgrade must NOT change any existing 866 identity ────────
const identityChanges: string[] = [];
for (const r of runtime) {
  if (resolveModelId(r.brand_id, r.name) !== resolveFinal(r.brand_id, r.name)) identityChanges.push(`${r.brand_id}/${r.name}`);
}
if (identityChanges.length) throw new Error(`MIRROR UPGRADE WOULD CHANGE ${identityChanges.length} EXISTING IDENTITIES: ${identityChanges.slice(0, 5)}`);

// ── A manifest (1,264) ───────────────────────────────────────────────────────
const A: any[] = [];
for (const row of approved) {
  const [cid, brand, brandName, name] = [row[0], row[1], row[2], row[3]];
  const src = row[8];
  const gm = src?.match(/#(model_[a-z0-9_]+)/);
  const g = gm ? byId.get(gm[1]) : undefined;
  const finalCid = resolveFinal(brand, name);
  if (finalCid !== cid) throw new Error(`A ROW IDENTITY CHANGES under proposed overrides: ${brand}/${name} ${cid} -> ${finalCid}`);
  if (runtimeCids.has(finalCid)) throw new Error(`A ROW COLLIDES with runtime cid: ${finalCid}`);
  if (runtimeBrandName.has(`${brand}||${name}`)) throw new Error(`A ROW (brand,name) collides with runtime: ${brand}/${name}`);
  A.push({ cid: finalCid, brand, brandName, name, series: g?.seriesName ?? '', aliases: (g?.aliases ?? []), goldenId: gm?.[1], track: 'A' });
}

// ── B manifest (33 PLUS_VARIANT) ─────────────────────────────────────────────
const B: any[] = [];
for (const e of proposed.entries.filter((x: any) => x.kind === 'PLUS_VARIANT')) {
  const row = ev.rows.find((r: any) => r.brand_id === e.brand && r.name === e.name);
  if (!row) throw new Error(`B no evidence row for ${e.brand}/${e.name}`);
  const g = byId.get(row.golden_id);
  const finalCid = resolveFinal(e.brand, e.name);
  if (finalCid !== e.to) throw new Error(`B override target mismatch ${e.name}: ${e.to} vs ${finalCid}`);
  if (runtimeCids.has(finalCid)) throw new Error(`B TARGET EXISTS in runtime: ${finalCid}`);
  if (runtimeBrandName.has(`${e.brand}||${e.name}`)) throw new Error(`B (brand,name) already in runtime: ${e.brand}/${e.name}`);
  B.push({ cid: finalCid, brand: e.brand, brandName: row.brand_name, name: e.name, series: g?.seriesName ?? '', aliases: (g?.aliases ?? []), goldenId: row.golden_id, track: 'B' });
}

// ── C manifest (15 SEED AS-IS) ───────────────────────────────────────────────
const C: any[] = [];
const absorbKeys = new Set(proposed.entries.filter((x: any) => x.kind === 'UNIFY_ABSORB').map((x: any) => `${x.brand}||${x.name}`));
for (const r of ev.rows.filter((x: any) => x.classification === 'NEEDS_REVIEW')) {
  if (absorbKeys.has(`${r.brand_id}||${r.name}`)) continue;
  const g = byId.get(r.golden_id);
  const finalCid = resolveFinal(r.brand_id, r.name);
  if (finalCid !== r.canonical_id) throw new Error(`C identity mismatch ${r.brand_id}/${r.name}`);
  if (runtimeCids.has(finalCid)) throw new Error(`C COLLIDES with runtime: ${finalCid}`);
  C.push({ cid: finalCid, brand: r.brand_id, brandName: r.brand_name, name: r.name, series: g?.seriesName ?? '', aliases: (g?.aliases ?? []), goldenId: r.golden_id, track: 'C' });
}

// ── absorbs (4) + target existence proof ─────────────────────────────────────
const absorbs: any[] = [];
for (const e of proposed.entries.filter((x: any) => x.kind === 'UNIFY_ABSORB')) {
  const t = runtime.find((r) => r.canonical_id === e.to);
  if (!t) throw new Error(`ABSORB TARGET MISSING in runtime: ${e.to} (${e.brand}/${e.name})`);
  if (runtimeBrandName.has(`${e.brand}||${e.name}`)) throw new Error(`ABSORB SOURCE already a runtime (brand,name): ${e.brand}/${e.name} — would duplicate physical model`);
  absorbs.push({ sourceBrand: e.brand, sourceName: e.name, sourceCid: sqlSlug(e.name), targetCid: e.to, targetRuntime: `${t.brand_id}/${t.name}`, kind: e.kind });
}

// ── excluded: 21 dropped bases + 3 invalid ───────────────────────────────────
const cidCount = new Map<string, number>();
for (const r of ev.rows) cidCount.set(r.canonical_id, (cidCount.get(r.canonical_id) ?? 0) + 1);
const droppedBases = ev.rows.filter((r: any) => r.classification === 'SAFE_TO_SEED' && (cidCount.get(r.canonical_id) ?? 0) > 1);
const invalids = ev.rows.filter((r: any) => r.classification === 'INVALID_OR_INCOMPLETE');
const outOfScope = ev.rows.filter((r: any) => r.classification === 'OUT_OF_SCOPE');

// ── combined seed ────────────────────────────────────────────────────────────
const seed = [...A, ...B, ...C];
const seedCids = new Set(seed.map((s) => s.cid));
const seedBrandName = new Set(seed.map((s) => `${s.brand}||${s.name}`));
if (seed.length !== 1312) throw new Error(`seed length ${seed.length} != 1312`);
if (seedCids.size !== 1312) throw new Error(`dup cids in seed batch`);
if (seedBrandName.size !== 1312) throw new Error(`dup (brand,name) in seed batch`);
const runtimeHit = seed.filter((s) => runtimeCids.has(s.cid)).map((s) => s.cid);
if (runtimeHit.length) throw new Error(`seed collides with runtime cids: ${runtimeHit.slice(0, 5)}`);
const runtimeBNHit = seed.filter((s) => runtimeBrandName.has(`${s.brand}||${s.name}`)).map((s) => `${s.brand}/${s.name}`);
if (runtimeBNHit.length) throw new Error(`seed (brand,name) collides with runtime: ${runtimeBNHit.slice(0, 5)}`);
if (!seed.every((s) => runtimeBrands.has(s.brand))) throw new Error(`seed contains non-runtime brand`);
const brandsSeed = new Set(seed.map((s) => s.brand));

// D2 simulation: SQL cid == TS cid for every seed row
const sqlMismatch = seed.filter((s) => sqlCid(s.brand, s.name) !== s.cid);
if (sqlMismatch.length) throw new Error(`SQL-mirror simulation mismatch on ${sqlMismatch.length}: ${sqlMismatch.slice(0,3).map(s=>s.brand+'/'+s.name).join('; ')}`);

// alias reality check
const realAliases = seed.filter((s) => s.aliases.some((a: string) => a.trim() !== '' && a !== s.name));
console.log(`rows with real (non-self) golden aliases: ${realAliases.length}`);

const sqlStr = (s: string) => s.replace(/'/g, "''");

// ── EMIT manifests ───────────────────────────────────────────────────────────
csvFile('00-manifest-seed.csv',
  ['canonical_id', 'brand_id', 'brand_name', 'name', 'series', 'release_year', 'model_numbers', 'aliases', 'track', 'golden_id'],
  seed.map((s) => [s.cid, s.brand, s.brandName, s.name, s.series, 'NULL', "'{}'", s.aliases.length ? `'{}'/*${s.aliases.filter((a: string) => a !== s.name).join(';')}*/` : "'{}'", s.track, s.goldenId ?? '']));

csvFile('00-manifest-absorb.csv',
  ['source_brand', 'source_name', 'source_plain_cid', 'decision', 'final_canonical_id', 'existing_runtime_model', 'action'],
  absorbs.map((a) => [a.sourceBrand, a.sourceName, a.sourceCid, 'UNIFY_ABSORB', a.targetCid, a.targetRuntime, 'NO INSERT — alias resolution via MODEL_ID_OVERRIDES']));

csvFile('00-manifest-excluded-seed.csv',
  ['brand_id', 'name', 'canonical_id', 'exclusion_reason'],
  [
    ...droppedBases.map((r: any) => [r.brand_id, r.name, r.canonical_id, "PLUS_PAIR_COLLAPSE — base dropped; '+' variant owns the identity"]),
    ...invalids.map((r: any) => [r.brand_id, r.name, r.canonical_id, 'INVALID_OR_INCOMPLETE — generic/unknown placeholder; never passed to catalog_create_model']),
  ]);

csvFile('00-manifest-out-of-scope.csv',
  ['brand_id', 'name', 'canonical_id', 'reason'],
  outOfScope.map((r: any) => [r.brand_id, r.name, r.canonical_id, 'OUT_OF_SCOPE — brand absent from runtime; not seedable in GC-R3']));

csvFile('00-manifest-runtime-only.csv',
  ['canonical_id', 'brand_id', 'name', 'protection_rule'],
  ev.runtimeOnly.map((r: any) => [r.canonical_id, r.brand_id, r.name, 'PROTECTED — runtime-owned; never deleted or modified by GC-R3']));

// 17-row review final decision table
csvFile('09-needs-review-final-decisions.csv',
  ['source_brand', 'source_name', 'decision', 'final_canonical_id', 'action'],
  ev.rows.filter((r: any) => r.classification === 'NEEDS_REVIEW').map((r: any) => {
    const absorbed = absorbKeys.has(`${r.brand_id}||${r.name}`);
    const target = absorbed ? resolveFinal(r.brand_id, r.name) : r.canonical_id;
    return [r.brand_id, r.name, absorbed ? 'UNIFY_ABSORB' : 'APPROVE SEED AS-IS', target, absorbed ? 'NO INSERT — alias resolution' : 'INSERT (track C)'];
  }));

// ── SQL pieces ───────────────────────────────────────────────────────────────
const seedRowValue = (s: any) =>
  `  (${csvCell(s.cid).replace(/"/g, "'")}, '${sqlStr(s.brand)}', '${sqlStr(s.name)}', NULLIF('${sqlStr(s.series)}',''), ARRAY[]::text[], ARRAY[]::text[])`;
const SEED_INSERT_CHUNK = 250;
const seedInsertStmts: string[] = [];
for (let i = 0; i < seed.length; i += SEED_INSERT_CHUNK) {
  const chunk = seed.slice(i, i + SEED_INSERT_CHUNK).map(seedRowValue).join(',\n');
  seedInsertStmts.push(
    `INSERT INTO public._gcr3_seed (canonical_id, brand_id, name, series, model_numbers, aliases) VALUES\n${chunk};`,
  );
}
const seedInserts = seedInsertStmts.join('\n');
const seedCidList = seedCids.size ? `ARRAY[${[...seedCids].sort().map((c) => `'${sqlStr(c)}'`).join(', ')}]` : `ARRAY[]::text[]`;
const seedBNValues = seed.map((s) => `  ('${sqlStr(s.brand)}', '${sqlStr(s.name)}')`).join(',\n');

const whenClauses = Object.entries(merged)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([brand, m]) => Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, to]) => `    WHEN p_brand_id = '${sqlStr(brand)}' AND btrim(p_name) = '${sqlStr(name)}' THEN '${sqlStr(to)}'`)
    .join('\n'))
  .join('\n');

const baseline =
`-- ============================================================================
-- GC-R3 FINAL APPLY — 01) PRE-APPLY BASELINE (READ-ONLY, SELECT ONLY)
-- Run as \`postgres\` in the Supabase SQL Editor immediately before 03-apply-seed.sql.
-- Every check must pass exactly as annotated; any deviation = STOP.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public.catalog_models)   AS models_count,        -- EXPECT 866
  (SELECT count(*) FROM public.catalog_variants) AS variants_count;      -- EXPECT 1816
SELECT count(*) AS identity_mismatches FROM public.catalog_models
  WHERE public.catalog_model_id(brand_id, name) <> canonical_id;         -- EXPECT 0
SELECT canonical_id, count(*) AS n FROM public.catalog_models
  GROUP BY canonical_id HAVING count(*) > 1;                             -- EXPECT 0 rows
SELECT count(*) AS inventory_count,
       md5(string_agg(id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
         ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
         ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id)) AS inventory_fingerprint
  FROM public.inventory_items;                                           -- EXPECT 17 / 1c5d9b8a117a93f03335e7296abddec1
SELECT id, canonical_id, brand_id, name FROM public.catalog_models ORDER BY canonical_id; -- save as pre-apply snapshot (866)
-- ============================================================================
`;

const mirrorUpgrade =
`-- ============================================================================
-- GC-R3 FINAL APPLY — 02) SQL identity mirror upgrade for catalog_model_id()
-- Mirrors resolveModelId() in src/catalog/canonical-adapter.ts AFTER the 37
-- proposed MODEL_ID_OVERRIDES are merged (41 total). Required so that:
--   * post-apply identity check (catalog_model_id(brand_id,name)=canonical_id)
--     passes for the 1,312 seeded rows, and
--   * future catalog_create_model() calls compute the same canonical_id.
-- Included inside 03-apply-seed.sql (same transaction). Shown here standalone
-- for review. IDEMPOTENT (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.catalog_model_id(p_brand_id text, p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  v_slug := lower(btrim(p_name));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN v_slug := 'unknown'; END IF;
  RETURN CASE
${whenClauses}
    ELSE btrim(p_brand_id) || '-' || v_slug
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.catalog_model_id(text, text) FROM PUBLIC;
`;

const seedSql =
`-- ============================================================================
-- GC-R3 FINAL APPLY — 03) SEED TRANSACTION (fail-closed, atomic)
-- Run as \`postgres\`. Single BEGIN..COMMIT. Any error -> full rollback.
--   inserts 1,312 catalog_models rows (A 1,264 + B 33 + C 15)
--   leaves catalog_variants (1,816) and inventory_items (17, fp unchanged) untouched
--   never touches runtime-only 251, out-of-scope 1,029, dropped bases, invalid
-- Verify preconditions with 01-pre-apply-baseline.sql first.
-- ============================================================================
BEGIN;

-- 0) FAIL-CLOSED PRE-GUARDS (abort transaction on any deviation)
DO $$
DECLARE v_inv_fp text;
BEGIN
  IF (SELECT count(*) FROM public.catalog_models) <> 866 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: catalog_models=% expected 866', (SELECT count(*) FROM public.catalog_models);
  END IF;
  IF (SELECT count(*) FROM public.catalog_variants) <> 1816 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: catalog_variants=% expected 1816', (SELECT count(*) FROM public.catalog_variants);
  END IF;
  IF (SELECT count(*) FROM public.inventory_items) <> 17 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: inventory_items=% expected 17', (SELECT count(*) FROM public.inventory_items);
  END IF;
  SELECT md5(string_agg(id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
    ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
    ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id)) INTO v_inv_fp FROM public.inventory_items;
  IF v_inv_fp IS DISTINCT FROM '1c5d9b8a117a93f03335e7296abddec1' THEN
    RAISE EXCEPTION 'GC-R3 ABORT: inventory fingerprint=% expected 1c5d9b8a117a93f03335e7296abddec1', v_inv_fp;
  END IF;
END $$;

-- 1) PRE-APPLY SNAPSHOT (backup table used by 05-rollback.sql)
DROP TABLE IF EXISTS public._gcr3_preapply_models;
CREATE TABLE public._gcr3_preapply_models AS SELECT id, canonical_id FROM public.catalog_models;

-- 2) SQL IDENTITY MIRROR UPGRADE (37 new overrides; 41 total)
${mirrorUpgrade}

-- 3) STAGING (regular table, in-transaction; dropped before COMMIT)
DROP TABLE IF EXISTS public._gcr3_seed;
CREATE TABLE public._gcr3_seed (
  canonical_id text PRIMARY KEY,
  brand_id     text NOT NULL,
  name         text NOT NULL,
  series       text NULL,
  model_numbers text[] NOT NULL,
  aliases      text[] NOT NULL
);

${seedInserts}

-- 4) SEED-BATCH GUARDS
DO $$
BEGIN
  IF (SELECT count(*) FROM _gcr3_seed) <> 1312 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: seed batch=% expected 1312', (SELECT count(*) FROM _gcr3_seed);
  END IF;
  IF EXISTS (SELECT 1 FROM _gcr3_seed s JOIN _gcr3_seed s2
             ON s2.brand_id = s.brand_id AND s2.name = s.name AND s2.canonical_id <> s.canonical_id) THEN
    RAISE EXCEPTION 'GC-R3 ABORT: duplicate (brand,name) inside seed batch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_models m JOIN _gcr3_seed s ON m.canonical_id = s.canonical_id) THEN
    RAISE EXCEPTION 'GC-R3 ABORT: canonical_id already exists in catalog_models';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_models m JOIN _gcr3_seed s
             ON m.brand_id = s.brand_id AND m.name = s.name) THEN
    RAISE EXCEPTION 'GC-R3 ABORT: (brand,name) already exists in catalog_models';
  END IF;
END $$;

-- 5) SEED
INSERT INTO public.catalog_models (canonical_id, brand_id, name, series, release_year, model_numbers, aliases, status)
SELECT canonical_id, brand_id, name, series, NULL::integer, model_numbers, aliases, 'active'
  FROM _gcr3_seed
  ORDER BY canonical_id;

-- 6) IN-TRANSACTION VERIFICATION
DO $$
DECLARE v_inv_fp text; v_bad bigint; v_dup bigint; v_kept bigint; v_seeded bigint;
BEGIN
  IF (SELECT count(*) FROM public.catalog_models) <> 2178 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: post models=% expected 2178', (SELECT count(*) FROM public.catalog_models);
  END IF;
  SELECT count(*) INTO v_bad FROM public.catalog_models
    WHERE public.catalog_model_id(brand_id, name) <> canonical_id;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'GC-R3 ABORT: % identity mismatches after seed', v_bad; END IF;
  SELECT count(*) INTO v_dup FROM (
    SELECT canonical_id FROM public.catalog_models GROUP BY canonical_id HAVING count(*) > 1) x;
  IF v_dup <> 0 THEN RAISE EXCEPTION 'GC-R3 ABORT: % duplicate canonical_ids after seed', v_dup; END IF;
  SELECT count(*) INTO v_kept FROM public.catalog_models m
    WHERE EXISTS (SELECT 1 FROM public._gcr3_preapply_models p WHERE p.id = m.id);
  IF v_kept <> 866 THEN RAISE EXCEPTION 'GC-R3 ABORT: only % pre-existing models preserved (expected 866)', v_kept; END IF;
  SELECT count(*) INTO v_seeded FROM public.catalog_models m
    WHERE m.canonical_id = ANY(${seedCidList});
  IF v_seeded <> 1312 THEN RAISE EXCEPTION 'GC-R3 ABORT: % seeded rows present (expected 1312)', v_seeded; END IF;
  IF (SELECT count(*) FROM public.catalog_variants) <> 1816 THEN
    RAISE EXCEPTION 'GC-R3 ABORT: variants changed (%)', (SELECT count(*) FROM public.catalog_variants);
  END IF;
  SELECT md5(string_agg(id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
    ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
    ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id)) INTO v_inv_fp FROM public.inventory_items;
  IF v_inv_fp IS DISTINCT FROM '1c5d9b8a117a93f03335e7296abddec1' THEN
    RAISE EXCEPTION 'GC-R3 ABORT: inventory fingerprint changed (%)', v_inv_fp;
  END IF;
  RAISE NOTICE 'GC-R3 SEED OK: 1312 inserted, 2178 models, identity=0, variants=1816, inventory=17/unchanged';
END $$;

-- cleanup staging table (transaction-scoped)
DROP TABLE IF EXISTS public._gcr3_seed;

COMMIT;
-- ============================================================================
-- END OF SEED TRANSACTION. Run 04-post-apply-verify.sql afterwards.
-- ============================================================================
`;

const postVerify =
`-- ============================================================================
-- GC-R3 FINAL APPLY — 04) POST-APPLY VERIFICATION (READ-ONLY, SELECT ONLY)
-- Run AFTER 03-apply-seed.sql COMMIT. Every check must match exactly.
-- ============================================================================
SELECT count(*) AS models_count FROM public.catalog_models;              -- EXPECT 2178
SELECT count(*) AS variants_count FROM public.catalog_variants;          -- EXPECT 1816
SELECT count(*) AS identity_mismatches FROM public.catalog_models
  WHERE public.catalog_model_id(brand_id, name) <> canonical_id;         -- EXPECT 0
SELECT canonical_id, count(*) AS n FROM public.catalog_models
  GROUP BY canonical_id HAVING count(*) > 1;                             -- EXPECT 0 rows
SELECT count(*) AS inventory_count,
       md5(string_agg(id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
         ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
         ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id)) AS inventory_fingerprint
  FROM public.inventory_items;                                           -- EXPECT 17 / 1c5d9b8a117a93f03335e7296abddec1
SELECT count(*) AS preserved_preapply FROM public.catalog_models m
  WHERE EXISTS (SELECT 1 FROM public._gcr3_preapply_models p WHERE p.id = m.id); -- EXPECT 866
SELECT count(*) AS seeded_present FROM public.catalog_models
  WHERE canonical_id = ANY(${seedCidList});                              -- EXPECT 1312
SELECT count(*) AS unexpected_rows FROM public.catalog_models
  WHERE canonical_id NOT IN (SELECT canonical_id FROM public._gcr3_preapply_models)
    AND canonical_id NOT IN (SELECT unnest(${seedCidList}));            -- EXPECT 0
SELECT count(*) AS seeded_null_release_year FROM public.catalog_models
  WHERE release_year IS NULL AND canonical_id = ANY(${seedCidList});    -- EXPECT 1312
-- ============================================================================
`;

const rollback =
`-- ============================================================================
-- GC-R3 FINAL APPLY — 05) ROLLBACK / RECOVERY
-- Run ONLY if the owner decides to undo a COMMITTED 03-apply-seed.sql.
-- Deletes ONLY rows inserted by the apply: canonical_id in seed list AND NOT in
-- the pre-apply snapshot. Never deletes existing runtime models.
-- The identity mirror upgrade (catalog_model_id) is intentionally NOT reverted
-- (idempotent, harmless); uncomment the revert at the bottom if desired.
-- ============================================================================
BEGIN;

-- precondition: pre-apply snapshot must exist (created inside 03-apply-seed.sql)
DO $$
BEGIN
  IF to_regclass('public._gcr3_preapply_models') IS NULL THEN
    RAISE EXCEPTION 'GC-R3 ROLLBACK ABORT: _gcr3_preapply_models missing — apply never ran or snapshot dropped';
  END IF;
END $$;

CREATE TABLE public._gcr3_rollback (canonical_id text PRIMARY KEY);
INSERT INTO public._gcr3_rollback VALUES
${[...seedCids].sort().map((c) => `  ('${sqlStr(c)}')`).join(',\n')};

DELETE FROM public.catalog_models m
USING _gcr3_rollback r
WHERE m.canonical_id = r.canonical_id
  AND NOT EXISTS (SELECT 1 FROM public._gcr3_preapply_models p WHERE p.id = m.id);

SELECT count(*) AS models_after_rollback FROM public.catalog_models;    -- EXPECT 866 (+ any legit rows added later)

DROP TABLE IF EXISTS public._gcr3_preapply_models;
DROP TABLE IF EXISTS public._gcr3_rollback;

-- Optional: revert identity mirror to the 4 xiaomi overrides only (uncomment):
-- CREATE OR REPLACE FUNCTION public.catalog_model_id(p_brand_id text, p_name text) ... (original body) ...;

COMMIT;
-- ============================================================================
`;

writeFileSync(join(OUT, '01-pre-apply-baseline.sql'), baseline, 'utf8');
writeFileSync(join(OUT, '02-override-sql-mirror-upgrade.sql'), mirrorUpgrade, 'utf8');
writeFileSync(join(OUT, '03-apply-seed.sql'), seedSql, 'utf8');
writeFileSync(join(OUT, '04-post-apply-verify.sql'), postVerify, 'utf8');
writeFileSync(join(OUT, '05-rollback.sql'), rollback, 'utf8');

// ── override before/after diff (TS + SQL) ────────────────────────────────────
const existingTs = JSON.stringify(MODEL_ID_OVERRIDES, null, 2);
const mergedForDiff: Record<string, Record<string, string>> = {};
for (const [b, m] of Object.entries(MODEL_ID_OVERRIDES)) mergedForDiff[b] = { ...m };
for (const [b, m] of Object.entries(proposed.overrides)) mergedForDiff[b] = { ...(mergedForDiff[b] ?? {}), ...m };
const mergedTs = JSON.stringify(mergedForDiff, null, 2);

const diff =
`# GC-R3 OVERRIDE MIGRATION — EXACT BEFORE / AFTER (TS + SQL)

## TS — src/catalog/canonical-adapter.ts MODEL_ID_OVERRIDES

### BEFORE (current, 4 entries)
\`\`\`ts
export const MODEL_ID_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  xiaomi: {
    'Redmi Note 13 Pro+': 'xiaomi-redmi-note-13-pro-plus',
    'Redmi Note 14 Pro+': 'xiaomi-redmi-note-14-pro-plus',
    'Redmi Note 15 Pro+': 'xiaomi-redmi-note-15-pro-plus',
    'Redmi Note 16 Pro+': 'xiaomi-redmi-note-16-pro-plus',
  },
};
\`\`\`

### AFTER (41 entries = 4 existing + 37 proposed)
\`\`\`ts
export const MODEL_ID_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = ${mergedTs};
\`\`\`

## SQL — public.catalog_model_id() (mirror)

### BEFORE (4 WHEN clauses)
\`\`\`sql
${`    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 13 Pro+' THEN 'xiaomi-redmi-note-13-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 14 Pro+' THEN 'xiaomi-redmi-note-14-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 15 Pro+' THEN 'xiaomi-redmi-note-15-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 16 Pro+' THEN 'xiaomi-redmi-note-16-pro-plus'`}
\`\`\`

### AFTER (41 WHEN clauses)
\`\`\`sql
${whenClauses}
\`\`\`

## Diff summary (37 ADDED, 0 MODIFIED, 0 REMOVED)

| # | brand | name | target | kind | track |
|---|---|---|---|---|---|
${proposed.entries.sort((a: any, b: any) => a.brand.localeCompare(b.brand)).map((e: any, i: number) =>
  `| ${i + 1} | ${e.brand} | ${e.name} | ${e.to} | ${e.kind} | ${e.kind === 'PLUS_VARIANT' ? 'B (seed)' : 'absorb (no seed)'} |`).join('\n')}

Verified: none of the 866 existing identities change under the AFTER map (checked in builder).
`;
writeFileSync(join(OUT, '07-override-diff-before-after.md'), diff, 'utf8');

// ── run order ────────────────────────────────────────────────────────────────
const runOrder =
`# GC-R3 FINAL APPLY — RUN ORDER (nothing here executes on its own)

All files read-only deliverables. The only executable artifact is 03-apply-seed.sql,
run manually by the owner as \`postgres\` in the Supabase SQL Editor after an explicit GO.

1. 01-pre-apply-baseline.sql   READ-ONLY. All checks must pass (866 / 1816 / 17 / fp / 0 / 0).
2. 02-override-sql-mirror-upgrade.sql — informational. The upgrade is embedded inside 03.
3. 03-apply-seed.sql           THE transaction. Fail-closed: any guard failure aborts & rolls back.
4. 04-post-apply-verify.sql    READ-ONLY. Run after COMMIT. Must show 2178 / 1816 / 17+fp / 0 / 0 / 0 / 866 / 1312 / 0 / 1312.
5. 05-rollback.sql             ONLY if the owner orders an undo of a COMMITTED apply.

Manifests:
  00-manifest-seed.csv         every model that WOULD be inserted (1,312)
  00-manifest-absorb.csv       4 absorbs (no insert)
  00-manifest-excluded-seed.csv 21 dropped bases + 3 invalid (never inserted)
  00-manifest-out-of-scope.csv  1,029 (never inserted)
  00-manifest-runtime-only.csv  251 protected runtime models (never touched)
  09-needs-review-final-decisions.csv  17-row final decision table

NOT to do: no catalog_create_model() invocation, no catalog_variants changes,
no inventory_items changes, no out-of-scope / runtime-only changes, no deletions.
`;
writeFileSync(join(OUT, '06-run-order.md'), runOrder, 'utf8');

// ── builder report (stdout) ──────────────────────────────────────────────────
console.log('=== GC-R3 FINAL APPLY PACKAGE BUILDER (READ-ONLY) ===');
console.log('runtime models:', runtime.length, '| runtime cids unique:', runtimeCids.size);
console.log('merged override keys:', mergedKeys, '(4 existing + 37 proposed)');
console.log('mirror upgrade changes existing identity?', identityChanges.length === 0 ? 'NO (proven)' : `YES: ${identityChanges.length}`);
console.log('A (independent):', A.length, '| B (plus):', B.length, '| C (seed-as-is):', C.length, '| TOTAL:', seed.length);
console.log('absorbs:', absorbs.length, '| dropped bases:', droppedBases.length, '| invalid:', invalids.length, '| out-of-scope:', outOfScope.length);
console.log('seed cids unique:', seedCids.size, '| (brand,name) unique:', seedBrandName.size);
console.log('seed cids colliding with runtime:', runtimeHit.length, '| (brand,name) colliding:', runtimeBNHit.length);
console.log('seed brands:', [...brandsSeed].sort().join(','));
console.log('SQL-mirror simulation mismatches on seed:', sqlMismatch.length);
console.log('rows with real golden aliases:', realAliases.length);
console.log('wrote package to', OUT);
