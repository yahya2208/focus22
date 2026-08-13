/**
 * FOCUS — STATIC CATALOG REGENERATION (866 → 2178)
 *
 * Deterministic generator that syncs the runtime static catalog
 * (src/catalog/brands/*.json) with the post-GC-R3 canonical DB state.
 *
 * Inputs (committed, no network, no DB):
 *   - src/catalog/brands/*.json                  (the original 866 models)
 *   - catalog-audit/gc-r3/apply-final/00-manifest-seed.csv (the 1312 seeded models)
 *
 * Rules (approved 2026-08-13):
 *   - The original 866 model entries are preserved byte-for-byte.
 *   - The 1312 seeded models are appended with DB truth:
 *       variants: []         (catalog_variants has NO rows for them — nothing invented)
 *       modelNumbers: []     (DB model_numbers = '{}')
 *       releaseYear: null    (DB release_year = NULL — never fabricated)
 *       series: DB value or '' when the DB series is NULL
 *   - Identity is validated with the 41-entry mirror that the DB function
 *     catalog_model_id() uses (MODEL_ID_OVERRIDES + slugify). All 2178 models
 *     must map to 2178 unique canonical ids.
 *   - Every seeded canonical_id in the manifest must equal the mirror's
 *     computation (0 mismatches).
 *
 * Idempotent: models already present in a brand file are never duplicated.
 * Prints a reconciliation report. Mutates nothing but the 18 brand JSON files.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modelIdFor, slugify } from '../src/catalog/canonical';
import { resolveModelId, MODEL_ID_OVERRIDES } from '../src/catalog/canonical-adapter';

const ROOT = process.cwd();
const BRANDS_DIR = join(ROOT, 'src', 'catalog', 'brands');
const SEED_MANIFEST = join(ROOT, 'catalog-audit', 'gc-r3', 'apply-final', '00-manifest-seed.csv');

interface SeedRow {
  canonicalId: string;
  brandId: string;
  name: string;
  series: string;
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function readSeedManifest(): SeedRow[] {
  const lines = readFileSync(SEED_MANIFEST, 'utf8').trim().split('\n');
  const rows: SeedRow[] = [];
  for (const line of lines.slice(1)) {
    const c = parseCsvLine(line);
    rows.push({
      canonicalId: c[0],
      brandId: c[1],
      name: c[3],
      series: c[4],
    });
  }
  return rows;
}

function brandIdForDisplay(brand: string): string {
  return slugify(brand);
}

const files = readdirSync(BRANDS_DIR).filter((f) => f.endsWith('.json')).sort();
const existing: { file: string; brand: string; brandId: string; models: any[]; raw: string }[] = [];
for (const f of files) {
  const raw = readFileSync(join(BRANDS_DIR, f), 'utf8');
  const j = JSON.parse(raw);
  existing.push({ file: f, brand: j.brand, brandId: brandIdForDisplay(j.brand), models: j.models, raw });
}

const seeded = readSeedManifest();
const seedBrandIds = new Set(seeded.map((s) => s.brandId));

// ── validations ────────────────────────────────────────────────────────────────
const problems: string[] = [];
const existingBrands = new Set(existing.map((e) => e.brandId));
const missingBrands = [...seedBrandIds].filter((b) => !existingBrands.has(b));
if (missingBrands.length > 0) problems.push(`seeded brands missing from static catalog: ${missingBrands.join(', ')}`);

const existingNames = new Map<string, Set<string>>();
for (const e of existing) existingNames.set(e.brandId, new Set(e.models.map((m) => m.model)));
const dupSeeded: string[] = [];
for (const s of seeded) {
  if (existingNames.get(s.brandId)?.has(s.name)) dupSeeded.push(`${s.brandId}|${s.name}`);
}
if (dupSeeded.length > 0) problems.push(`seeded models already exist in static catalog: ${dupSeeded.join(', ')}`);

// mirror identity: existing = resolveModelId(41), seeded = manifest canonicalId
const idOwner = new Map<string, string>();
const collisions: string[] = [];
for (const e of existing) {
  for (const m of e.models) {
    const cid = resolveModelId(e.brandId, m.model);
    const key = `${e.brandId}|${m.model}`;
    const prior = idOwner.get(cid);
    if (prior && prior !== key) collisions.push(`${cid}: ${prior} vs ${key}`);
    idOwner.set(cid, key);
  }
}
for (const s of seeded) {
  const computed = MODEL_ID_OVERRIDES[s.brandId]?.[s.name] ?? modelIdFor(s.brandId, s.name);
  if (computed !== s.canonicalId) problems.push(`seeded mirror mismatch: ${s.brandId}|${s.name} manifest=${s.canonicalId} mirror=${computed}`);
  const key = `${s.brandId}|${s.name}`;
  const prior = idOwner.get(s.canonicalId);
  if (prior && prior !== key) collisions.push(`${s.canonicalId}: ${prior} vs ${key}`);
  idOwner.set(s.canonicalId, key);
}
if (collisions.length > 0) problems.push(`canonical id collisions (${collisions.length}): ${collisions.slice(0, 10).join('; ')}`);
if (idOwner.size !== 2178) problems.push(`expected 2178 unique canonical ids, got ${idOwner.size}`);
if (seeded.length !== 1312) problems.push(`expected 1312 seeded rows, got ${seeded.length}`);

if (problems.length > 0) {
  console.error('ABORT — validation failed:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

// ── append seeded models to brand files, preserving original bytes ────────────
const perBrandSeeded = new Map<string, SeedRow[]>();
for (const s of seeded) {
  const arr = perBrandSeeded.get(s.brandId) ?? [];
  arr.push(s);
  perBrandSeeded.set(s.brandId, arr);
}

const compact = (m: SeedRow) =>
  JSON.stringify({ model: m.name, series: m.series, variants: [], modelNumbers: [], releaseYear: null });
const spaced = (m: SeedRow) =>
  `{ "model": "${m.name.replace(/"/g, '\\"')}", "series": "${m.series.replace(/"/g, '\\"')}", "variants": [], "modelNumbers": [], "releaseYear": null }`;

let totalAfter = 0;
let totalVariants = 0;
const brandReport: string[] = [];
for (const e of existing) {
  const eol = '\r\n';
  const lines = e.raw.split(eol);
  const closeIdx = lines.findIndex((l) => l.trim() === ']');
  if (closeIdx < 0) throw new Error(`cannot locate models array close in ${e.file}`);

  const add = (perBrandSeeded.get(e.brandId) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const spacedStyle = /^\s*\{ "model"/.test(lines.find((l) => /^\s*\{/.test(l) && l.includes('"model"')) ?? '');
  const render = spacedStyle ? spaced : compact;

  const out: string[] = [];
  for (let i = 0; i < closeIdx; i++) out.push(lines[i]);
  if (add.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = /,\s*$/.test(last) ? last : last + ',';
    add.forEach((m, idx) => out.push(`    ${render(m)}${idx < add.length - 1 ? ',' : ''}`));
  }
  out.push(lines[closeIdx]);
  out.push(lines[closeIdx + 1]);
  writeFileSync(join(BRANDS_DIR, e.file), out.join(eol) + eol);

  const after = JSON.parse(readFileSync(join(BRANDS_DIR, e.file), 'utf8'));
  totalAfter += after.models.length;
  totalVariants += after.models.reduce((n: number, m: any) => n + m.variants.length, 0);
  brandReport.push(`${e.brand.padEnd(10)} ${e.models.length} → ${after.models.length}  (+${after.models.length - e.models.length})`);
}

// ── report ─────────────────────────────────────────────────────────────────────
console.log('=== STATIC CATALOG REGENERATION REPORT ===');
console.log(`identity mirror: ${Object.keys(MODEL_ID_OVERRIDES).reduce((s, b) => s + Object.keys(MODEL_ID_OVERRIDES[b]).length, 0)} overrides`);
for (const r of brandReport) console.log(r);
console.log('------------------------------------------------');
console.log(`total models: ${totalAfter}  (866 + 1312 seeded)`);
console.log(`total variants: ${totalVariants}  (seeded models contribute 0 — DB has none)`);
console.log(`unique canonical ids: ${idOwner.size}`);
console.log(`seeded with empty series (DB NULL → ''): ${seeded.filter((s) => s.series === '').length}`);
