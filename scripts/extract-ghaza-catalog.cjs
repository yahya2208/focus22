/**
 * Yahya Phone Catalog Extractor (migrated from Ghaza-Store2)
 * Reads all phone model data, merges, deduplicates, and outputs unified catalog.
 */
const fs = require('fs');
const path = require('path');

const GH2 = path.join('C:', 'Users', 'lenovo', 'Downloads', 'New folder', 'Yahya-Phone');

// ── Extract from constants.ts PHONE_DATABASE ──────────────────────────
function extractFromConstants() {
  const src = fs.readFileSync(path.join(GH2, 'constants.ts'), 'utf8');
  // Find PHONE_DATABASE block between export const PHONE_DATABASE: Record<string, string[]> = { ... }
  const match = src.match(/export\s+const\s+PHONE_DATABASE\s*:\s*Record\s*<.*?>\s*=\s*({[\s\S]*?});/);
  if (!match) { console.error('PHONE_DATABASE not found'); return {}; }
  const objStr = match[1];
  const result = {};
  const brandRegex = /['"]([^'"]+)['"]\s*:\s*\[([\s\S]*?)\](?:,|\s*})/g;
  let m;
  while ((m = brandRegex.exec(objStr)) !== null) {
    const brand = m[1];
    const modelsStr = m[2];
    const models = modelsStr
      .split(/['"]\s*,?\s*['"]?/)
      .map(s => s.replace(/^['"]|['"]$/g, '').trim())
      .filter(s => s && !s.startsWith('//') && !s.startsWith('\n'));
    const cleaned = [];
    for (const model of modelsStr.split('\n')) {
      const trimmed = model.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const mm = trimmed.match(/['"]([^'"]+)['"]/);
      if (mm) cleaned.push(mm[1]);
    }
    result[brand] = cleaned;
  }
  return result;
}

// ── Extract from PHONE_DATABASE_UPDATES.json ──────────────────────────
function extractFromUpdates() {
  try {
    return JSON.parse(fs.readFileSync(path.join(GH2, 'PHONE_DATABASE_UPDATES.json'), 'utf8'));
  } catch { return {}; }
}

// ── Extract from PHONE_MODELS_SUPPLEMENT.ts ───────────────────────────
function extractFromSupplement() {
  const src = fs.readFileSync(path.join(GH2, 'data', 'PHONE_MODELS_SUPPLEMENT.ts'), 'utf8');
  const result = {};
  // Find arrays like: 'Samsung': [ '...', ]
  const brandRegex = /['"]([^'"]+)['"]\s*:\s*\[([\s\S]*?)\](?:,|\s*})/g;
  let m;
  while ((m = brandRegex.exec(src)) !== null) {
    const brand = m[1];
    const models = [];
    const str = m[2];
    const modelRegex = /['"]([^'"]+)['"]/g;
    let mm;
    while ((mm = modelRegex.exec(str)) !== null) {
      models.push(mm[1]);
    }
    if (models.length > 0) result[brand] = models;
  }
  return result;
}

// ── Extract from PHONE_MODELS_CATALOG_PART1.json ──────────────────────
function extractFromCatalogJSON() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(GH2, 'PHONE_MODELS_CATALOG_PART1.json'), 'utf8'));
    const result = {};
    // Could be { brands: { 'Samsung': [...], ... } } or { Samsung: [...], ... }
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        result[key] = data[key];
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        for (const k2 of Object.keys(data[key])) {
          if (Array.isArray(data[key][k2])) result[k2] = data[key][k2];
        }
      }
    }
    return result;
  } catch { return {}; }
}

// ── Merge & Deduplicate ───────────────────────────────────────────────
function mergeCatalogs(sources) {
  const merged = {};
  for (const source of sources) {
    for (const [brand, models] of Object.entries(source)) {
      if (!merged[brand]) merged[brand] = new Set();
      for (const model of models) {
        merged[brand].add(model.trim());
      }
    }
  }
  // Convert Sets to sorted arrays
  const result = {};
  const brandOrder = Object.keys(merged).sort((a, b) => {
    const order = ['Samsung','Apple','Xiaomi','Oppo','Vivo','Realme','OnePlus','Huawei','Honor','Google','Motorola','Nokia','Infinix','Tecno','Itel','Sony','Asus','Nothing','ZTE','Lenovo','Meizu','Sharp','Alcatel','HTC','LG','BlackBerry','Wiko','Lava','Micromax','Fairphone','Panasonic','Kyocera','CAT','AGM','UMIDIGI','Oukitel','Crosscall','Blackview','Doogee','Ulefone','Cubot','TCL','HOMTOM','LEAGOO','Elephone','Vernee','Generic/Unknown'];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  for (const brand of brandOrder) {
    result[brand] = [...merged[brand]].sort();
  }
  return result;
}

// ── Normalize model names (deduplicate aliases) ───────────────────────
function normalizeModel(name) {
  let n = name.trim();
  // Remove leading brand name if model already contains it
  // Normalize "Samsung Galaxy S25" → "Galaxy S25"
  const knownBrands = ['Samsung','Apple','Xiaomi','Oppo','Vivo','Realme','OnePlus','Huawei','Honor','Google','Motorola','Nokia','Infinix','Tecno','Itel','Sony','Asus','Nothing','ZTE','Lenovo','Meizu','Sharp','Alcatel','HTC','LG'];
  for (const b of knownBrands) {
    if (n.toLowerCase().startsWith(b.toLowerCase() + ' ') && !n.toLowerCase().startsWith(b.toLowerCase() + ' ' + b.toLowerCase())) {
      n = n.slice(b.length).trim();
    }
  }
  return n;
}

// ── MAIN ─────────────────────────────────────────────────────────────
console.log('=== Ghaza-Store2 Catalog Extractor ===\n');

const constants = extractFromConstants();
console.log(`constants.ts PHONE_DATABASE: ${Object.keys(constants).length} brands, ${Object.values(constants).reduce((s, a) => s + a.length, 0)} models`);

const updates = extractFromUpdates();
console.log(`PHONE_DATABASE_UPDATES.json: ${Object.keys(updates).length} brands, ${Object.values(updates).reduce((s, a) => s + a.length, 0)} models`);

const supplement = extractFromSupplement();
console.log(`PHONE_MODELS_SUPPLEMENT.ts: ${Object.keys(supplement).length} brands, ${Object.values(supplement).reduce((s, a) => s + a.length, 0)} models`);

const catalogJSON = extractFromCatalogJSON();
console.log(`PHONE_MODELS_CATALOG_PART1.json: ${Object.keys(catalogJSON).length} brands, ${Object.values(catalogJSON).reduce((s, a) => s + a.length, 0)} models`);

const merged = mergeCatalogs([constants, updates, supplement, catalogJSON]);
console.log(`\nMERGED: ${Object.keys(merged).length} brands, ${Object.values(merged).reduce((s, a) => s + a.length, 0)} models\n`);

// Print brand counts
for (const [brand, models] of Object.entries(merged)) {
  console.log(`  ${brand}: ${models.length}`);
}

// Generate output file for our project
const outputPath = path.join(__dirname, '..', 'src', 'data', 'phone-catalog.ts');
const existingSrc = fs.readFileSync(outputPath, 'utf8');

// Read existing brands/model sets from current phone-catalog.ts
const existingBrands = {};
const brandRegex = /brand:\s*'([^']+)'[\s\S]*?models:\s*\[([\s\S]*?)\]/g;
let mm;
while ((mm = brandRegex.exec(existingSrc)) !== null) {
  const brand = mm[1];
  const modelsStr = mm[2];
  const models = [];
  const modelRegex = /'([^']+)'/g;
  let mmm;
  while ((mmm = modelRegex.exec(modelsStr)) !== null) {
    models.push(mmm[1]);
  }
  existingBrands[brand] = models;
}

console.log(`\nExisting catalog: ${Object.keys(existingBrands).length} brands, ${Object.values(existingBrands).reduce((s, a) => s + a.length, 0)} models`);

// Find new models from Ghaza-Store2 that aren't in existing catalog
const newModels = {};
for (const [brand, models] of Object.entries(merged)) {
  const existing = existingBrands[brand];
  if (!existing) {
    newModels[brand] = models;
    continue;
  }
  const existingSet = new Set(existing.map(m => m.toLowerCase().replace(/\s+/g, '')));
  const added = models.filter(m => !existingSet.has(m.toLowerCase().replace(/\s+/g, '')));
  if (added.length > 0) newModels[brand] = added;
}

console.log(`\n=== NEW MODELS TO ADD (${Object.values(newModels).reduce((s, a) => s + a.length, 0)} total) ===`);
for (const [brand, models] of Object.entries(newModels)) {
  console.log(`\n  ${brand} (${models.length} new):`);
  for (const m of models.slice(0, 10)) {
    console.log(`    - ${m}`);
  }
  if (models.length > 10) console.log(`    ... and ${models.length - 10} more`);
}

// Also find models in existing that are NOT in Ghaza-Store2 (might be removed)
const removedModels = {};
for (const [brand, models] of Object.entries(existingBrands)) {
  const ghazamodels = merged[brand];
  if (!ghazamodels) {
    removedModels[brand] = models;
    continue;
  }
  const ghazaSet = new Set(ghazamodels.map(m => m.toLowerCase().replace(/\s+/g, '')));
  const removed = models.filter(m => !ghazaSet.has(m.toLowerCase().replace(/\s+/g, '')));
  if (removed.length > 0) removedModels[brand] = removed;
}

if (Object.keys(removedModels).length > 0) {
  console.log(`\n=== MODELS IN EXISTING BUT NOT IN GHAZA-STORE2 (${Object.values(removedModels).reduce((s, a) => s + a.length, 0)} total) ===`);
  for (const [brand, models] of Object.entries(removedModels)) {
    console.log(`  ${brand}: ${models.length} models`);
  }
}

const totalModels = Object.values(merged).reduce((s, a) => s + a.length, 0);
console.log(`\n\n=== SUMMARY ===`);
console.log(`Total Brands: ${Object.keys(merged).length}`);
console.log(`Total Models: ${totalModels}`);
console.log(`New to add: ${Object.values(newModels).reduce((s, a) => s + a.length, 0)}`);
