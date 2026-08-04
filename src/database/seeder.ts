import { PHONE_CATALOG } from '../data/phone-catalog';
import { PHONE_VARIANTS } from '../data/phone-variants';
import { getAllAliases } from '../services/alias-engine';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CatalogBrand, CatalogModel, CatalogVariant, CatalogAlias, CatalogStats, CatalogVersion, CatalogChangeEntry,
} from './schema';
import { TABLES, CATALOG_CURRENT_VERSION } from './schema';

// ─── universal store (localStorage in browser, JSON file in Node) ──
function getStore(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  if (typeof localStorage !== 'undefined') return localStorage;

  const storeDir = join(process.cwd(), '.catalog-store');
  try { mkdirSync(storeDir, { recursive: true }); } catch { /* Intentionally ignored. */ }

  return {
    getItem(k: string) {
      try {
        return readFileSync(join(storeDir, k.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'), 'utf8');
      } catch { return null; }
    },
    setItem(k: string, v: string) {
      writeFileSync(join(storeDir, k.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'), v, 'utf8');
    },
  };
}

const _store = getStore();

function now(): string {
  return new Date().toISOString();
}

function loadTable<T>(key: string): T[] {
  try {
    const raw = _store.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTable<T>(key: string, data: T[]): void {
  _store.setItem(key, JSON.stringify(data));
}

function getMeta(key: string): string | null {
  try {
    return _store.getItem(`${TABLES.CATALOG_META}_${key}`);
  } catch { return null; }
}

function setMeta(key: string, value: string): void {
  _store.setItem(`${TABLES.CATALOG_META}_${key}`, value);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9+]/g, '').replace(/\+/g, 'plus');
}

// ── Brand → Series mapping ──────────────────────────────────────────
function detectSeries(brand: string, model: string): string | null {
  const ml = model.toLowerCase();
  // Samsung
  if (brand === 'Samsung') {
    if (ml.startsWith('galaxy s ultra')) return 'Galaxy S Ultra';
    if (ml.startsWith('galaxy s')) return 'Galaxy S';
    if (ml.startsWith('galaxy z')) return 'Galaxy Z';
    if (ml.startsWith('galaxy note')) return 'Galaxy Note';
    if (ml.startsWith('galaxy tab')) return 'Galaxy Tab';
    if (ml.startsWith('galaxy a')) return 'Galaxy A';
    if (ml.startsWith('galaxy m')) return 'Galaxy M';
    if (ml.startsWith('galaxy f')) return 'Galaxy F';
    if (ml.startsWith('galaxy j')) return 'Galaxy J';
    if (ml.startsWith('galaxy xcover')) return 'Galaxy XCover';
    if (ml.startsWith('galaxy')) return 'Galaxy Other';
    return null;
  }
  // Xiaomi
  if (brand === 'Xiaomi') {
    if (ml.startsWith('redmi note')) return 'Redmi Note';
    if (ml.startsWith('redmi')) return 'Redmi';
    if (ml.startsWith('poco')) return 'POCO';
    if (ml.startsWith('black shark')) return 'Black Shark';
    if (ml.startsWith('mi ')) return 'Xiaomi Mi';
    return 'Xiaomi Other';
  }
  // Apple
  if (brand === 'Apple') {
    if (ml.includes('pro max')) return 'iPhone Pro Max';
    if (ml.includes('pro')) return 'iPhone Pro';
    if (ml.includes('se')) return 'iPhone SE';
    if (ml.includes('mini')) return 'iPhone mini';
    if (ml.includes('plus')) return 'iPhone Plus';
    if (ml.includes('iphone')) return 'iPhone';
    if (ml.includes('ipad pro')) return 'iPad Pro';
    if (ml.includes('ipad air')) return 'iPad Air';
    if (ml.includes('ipad mini')) return 'iPad mini';
    if (ml.includes('ipad')) return 'iPad';
    return null;
  }
  // Huawei
  if (brand === 'Huawei') {
    if (ml.startsWith('mate')) return 'Mate';
    if (ml.startsWith('pura')) return 'Pura';
    if (ml.startsWith('p ')) return 'P series';
    if (ml.startsWith('p')) return 'P series';
    if (ml.startsWith('nova')) return 'Nova';
    if (ml.startsWith('enjoy')) return 'Enjoy';
    if (ml.startsWith('y ')) return 'Y series';
    if (ml.startsWith('y')) return 'Y series';
    if (ml.startsWith('ascend')) return 'Ascend';
    if (ml.startsWith('honor')) return 'Honor (legacy)';
    return null;
  }
  // Honor
  if (brand === 'Honor') {
    if (ml.startsWith('magic')) return 'Magic';
    if (ml.startsWith('honor ')) {
      const rest = ml.replace('honor ', '');
      if (/^\d/.test(rest)) return 'Honor Numbered';
      if (rest.startsWith('x')) return 'Honor X';
      if (rest.startsWith('play')) return 'Honor Play';
      return 'Honor Other';
    }
    if (ml.startsWith('x')) return 'Honor X';
    if (ml.startsWith('play')) return 'Honor Play';
    return null;
  }
  // Realme
  if (brand === 'Realme') {
    if (ml.includes('gt')) return 'GT';
    if (ml.includes('narzo')) return 'Narzo';
    if (ml.startsWith('c')) return 'C Series';
    if (/^\d/.test(ml) || /^\d/.test(ml.replace('realme ', ''))) return 'Numbered';
    if (ml.startsWith('x')) return 'X Series';
    return null;
  }
  // OnePlus
  if (brand === 'OnePlus') {
    if (ml.includes('nord')) return 'Nord';
    if (ml.includes('ace')) return 'Ace';
    if (ml.startsWith('oneplus ')) {
      if (/^\d/.test(ml.replace('oneplus ', ''))) return 'Flagship';
      return 'OnePlus Other';
    }
    if (ml === 'open') return 'Open';
    return null;
  }
  // Oppo
  if (brand === 'Oppo') {
    if (ml.startsWith('find')) return 'Find';
    if (ml.startsWith('reno')) return 'Reno';
    if (ml.startsWith('a')) return 'A Series';
    if (ml.startsWith('f')) return 'F Series';
    if (ml.startsWith('k')) return 'K Series';
    if (ml.startsWith('r')) return 'R Series';
    return null;
  }
  // Vivo
  if (brand === 'Vivo') {
    if (ml.startsWith('v')) return 'V Series';
    if (ml.startsWith('y')) return 'Y Series';
    if (ml.startsWith('iqoo')) return 'iQOO';
    if (ml.startsWith('x')) return 'X Series';
    if (ml.startsWith('t')) return 'T Series';
    if (ml.startsWith('s')) return 'S Series';
    return null;
  }
  // Google
  if (brand === 'Google') {
    if (ml.startsWith('pixel')) return 'Pixel';
    if (ml.startsWith('nexus')) return 'Nexus';
    return null;
  }
  // Motorola
  if (brand === 'Motorola') {
    if (ml.includes('edge')) return 'Edge';
    if (ml.includes('razr')) return 'Razr';
    if (ml.startsWith('moto g')) return 'Moto G';
    if (ml.startsWith('moto e')) return 'Moto E';
    if (ml.startsWith('moto x')) return 'Moto X';
    if (ml.startsWith('moto z')) return 'Moto Z';
    if (ml.startsWith('one ')) return 'One Series';
    return null;
  }
  // Nokia
  if (brand === 'Nokia') {
    if (/^\d/.test(ml)) return 'Nokia Android';
    if (ml.startsWith('c')) return 'C Series';
    if (ml.startsWith('g')) return 'G Series';
    if (ml.startsWith('x')) return 'X Series';
    if (ml.startsWith('lumia')) return 'Lumia';
    return null;
  }
  return null;
}

// ─── SEEDER ──────────────────────────────────────────────────────────
export function seedCatalog(options?: { force?: boolean }): { brands: number; models: number; variants: number; aliases: number } {
  const seedVersion = getMeta('seed_version');
  const currentVersion = '1.0.0';

  if (seedVersion === currentVersion && !options?.force) {
    console.log('[Seeder] Catalog already seeded (version ' + currentVersion + '). Use force: true to re-seed.');
    const brands = loadTable<CatalogBrand>(TABLES.CATALOG_BRANDS);
    const models = loadTable<CatalogModel>(TABLES.CATALOG_MODELS);
    const variants = loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS);
    const aliases = loadTable<CatalogAlias>(TABLES.CATALOG_ALIASES);
    return { brands: brands.length, models: models.length, variants: variants.length, aliases: aliases.length };
  }

  const existingBrands = loadTable<CatalogBrand>(TABLES.CATALOG_BRANDS);
  const existingModelIds = new Set(loadTable<CatalogModel>(TABLES.CATALOG_MODELS).map(m => m.id));
  const existingVariantKeys = new Set(loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS).map(v => v.normalized));
  const existingAliasKeys = new Set(loadTable<CatalogAlias>(TABLES.CATALOG_ALIASES).map(a => a.normalized));

  const brands: CatalogBrand[] = options?.force ? [] : [...existingBrands];
  const brandNames = new Set(brands.map(b => b.name));
  const models: CatalogModel[] = options?.force ? [] : [...loadTable<CatalogModel>(TABLES.CATALOG_MODELS)];
  const variants: CatalogVariant[] = options?.force ? [] : [...loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS)];
  const aliases: CatalogAlias[] = options?.force ? [] : [...loadTable<CatalogAlias>(TABLES.CATALOG_ALIASES)];

  let brandCount = brands.length;
  let modelCount = models.length;
  let variantCount = variants.length;
  let aliasCount = aliases.length;

  for (const entry of PHONE_CATALOG) {
    if (!brandNames.has(entry.brand)) {
      brands.push({
        id: `brand_${normalize(entry.brand)}`,
        name: entry.brand,
        normalized: normalize(entry.brand),
        series: [],
        modelCount: 0,
        createdAt: now(),
        updatedAt: now(),
      });
      brandNames.add(entry.brand);
      brandCount++;
    }

    const brand = brands.find(b => b.name === entry.brand)!;
    const detectedSeries = new Set<string>();

    for (const modelName of entry.models) {
      const modelNorm = normalize(modelName);
      const modelId = `model_${normalize(entry.brand)}_${modelNorm}`;

      const series = detectSeries(entry.brand, modelName);
      if (series) detectedSeries.add(series);

      if (!existingModelIds.has(modelId) || options?.force) {
        if (!models.find(m => m.id === modelId)) {
          models.push({
            id: modelId,
            brandId: brand.id,
            brandName: entry.brand,
            seriesId: series ? `series_${normalize(entry.brand)}_${normalize(series)}` : null,
            seriesName: series,
            name: modelName,
            normalized: modelNorm,
            aliases: [modelName],
            variantCount: 0,
            createdAt: now(),
            updatedAt: now(),
          });
          modelCount++;
        }
      }
    }

    brand.series = [...new Set([...brand.series, ...detectedSeries])];
    brand.modelCount = entry.models.length;
    brand.updatedAt = now();
  }

  // ── 2. Variants (global, not per-model) ──
  for (const variant of PHONE_VARIANTS) {
    const vNorm = normalize(variant.label);
    if (!existingVariantKeys.has(vNorm) || options?.force) {
      if (!variants.find(v => v.normalized === vNorm)) {
        variants.push({
          id: `variant_${vNorm}`,
          modelId: 'all',
          brandName: '',
          modelName: 'global',
          ram: variant.ram,
          storage: variant.storage,
          label: variant.label,
          normalized: vNorm,
        });
        variantCount++;
      }
    }
  }

  // ── 3. Aliases ──
  const aliasSource = getAllAliases();
  for (const entry of aliasSource) {
    const modelId = `model_${normalize(entry.brand)}_${normalize(entry.model)}`;
    for (const alias of entry.aliases) {
      const aNorm = normalize(alias);
      if (!existingAliasKeys.has(aNorm) || options?.force) {
        if (!aliases.find(a => a.normalized === aNorm)) {
          const aliasType: CatalogAlias['type'] =
            /^[A-Z0-9]{2,6}$/.test(alias) ? 'model_code' :
            /[\u0600-\u06FF]/.test(alias) ? 'arabic' :
            alias.length <= 4 ? 'abbreviation' : 'english';
          aliases.push({
            id: `alias_${aNorm}`,
            modelId,
            alias,
            normalized: aNorm,
            type: aliasType,
          });
          aliasCount++;
        }
      }
    }
  }

  // ── Save ──
  saveTable(TABLES.CATALOG_BRANDS, brands);
  saveTable(TABLES.CATALOG_MODELS, models);
  saveTable(TABLES.CATALOG_VARIANTS, variants);
  saveTable(TABLES.CATALOG_ALIASES, aliases);
  setMeta('seed_version', currentVersion);
  setMeta('seed_timestamp', now());

  // Auto-tag version after seed
  tagCatalogVersion();

  return { brands: brandCount, models: modelCount, variants: variantCount, aliases: aliasCount };
}

// ─── VERIFICATION ────────────────────────────────────────────────────
export function verifyCatalog(): CatalogStats {
  const brands = loadTable<CatalogBrand>(TABLES.CATALOG_BRANDS);
  const models = loadTable<CatalogModel>(TABLES.CATALOG_MODELS);
  const variants = loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS);
  const aliases = loadTable<CatalogAlias>(TABLES.CATALOG_ALIASES);

  const brandModelCount = new Map<string, number>();
  const brandSeries = new Map<string, Set<string>>();
  for (const m of models) {
    brandModelCount.set(m.brandName, (brandModelCount.get(m.brandName) || 0) + 1);
    if (m.seriesName) {
      if (!brandSeries.has(m.brandName)) brandSeries.set(m.brandName, new Set());
      brandSeries.get(m.brandName)!.add(m.seriesName);
    }
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const m of models) {
    const key = `${normalize(m.brandName)}_${m.normalized}`;
    if (seen.has(key)) duplicateCount++;
    seen.add(key);
  }

  let missingAliasCount = 0;
  for (const m of models) {
    const modelAliases = aliases.filter(a => a.modelId === m.id);
    if (modelAliases.length < 3) missingAliasCount++;
  }

  const totalModels = models.length;
  const totalBrands = brands.length;
  const expectedModels = PHONE_CATALOG.reduce((s, b) => s + b.models.length, 0);
  const coveragePercent = expectedModels > 0 ? (totalModels / expectedModels) * 100 : 0;

  return {
    totalBrands,
    totalModels,
    totalVariants: variants.length,
    totalAliases: aliases.length,
    brandsWithModels: [...brandModelCount.entries()]
      .map(([brand, count]) => ({
        brand,
        count,
        series: [...(brandSeries.get(brand) || [])].sort(),
      }))
      .sort((a, b) => b.count - a.count),
    duplicateCount,
    missingAliasCount,
    coveragePercent: Math.min(100, coveragePercent),
  };
}

// ─── EXPORT ──────────────────────────────────────────────────────────
export function exportCatalog(format: 'json' | 'csv' = 'json'): string {
  const models = loadTable<CatalogModel>(TABLES.CATALOG_MODELS);
  const variants = loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS);

  if (format === 'csv') {
    const header = 'brand,model,series,ram,storage';
    const rows = models.flatMap(m => {
      const modelVariants = variants.filter(v => v.modelId === m.id);
      if (modelVariants.length === 0) {
        return [`${m.brandName},${m.name},${m.seriesName || ''},,`];
      }
      return modelVariants.map(v => `${m.brandName},${m.name},${m.seriesName || ''},${v.ram},${v.storage}`);
    });
    return [header, ...rows].join('\n');
  }

  return JSON.stringify({ models, variants }, null, 2);
}

// ─── VERSIONING ──────────────────────────────────────────────────────
export function getCatalogVersion(): CatalogVersion | null {
  try {
    const raw = _store.getItem(TABLES.CATALOG_VERSION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getCatalogChangelog(): CatalogChangeEntry[] {
  try {
    const raw = _store.getItem(TABLES.CATALOG_CHANGELOG);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function tagCatalogVersion(previousVersion?: string | null): CatalogVersion {
  const brands = loadTable<CatalogBrand>(TABLES.CATALOG_BRANDS);
  const models = loadTable<CatalogModel>(TABLES.CATALOG_MODELS);
  const variants = loadTable<CatalogVariant>(TABLES.CATALOG_VARIANTS);
  const aliases = loadTable<CatalogAlias>(TABLES.CATALOG_ALIASES);
  const prev = getCatalogVersion();
  const existingChangelog = getCatalogChangelog();

  const version: CatalogVersion = {
    version: CATALOG_CURRENT_VERSION,
    previousVersion: previousVersion ?? prev?.version ?? null,
    timestamp: now(),
    stats: {
      brands: brands.length,
      models: models.length,
      variants: variants.length,
      aliases: aliases.length,
    },
    changelog: existingChangelog,
  };

  _store.setItem(TABLES.CATALOG_VERSION, JSON.stringify(version));
  return version;
}

export function addChangelogEntry(entry: CatalogChangeEntry): void {
  const log = getCatalogChangelog();
  log.push(entry);
  _store.setItem(TABLES.CATALOG_CHANGELOG, JSON.stringify(log));
}

export function clearChangelog(): void {
  _store.setItem(TABLES.CATALOG_CHANGELOG, '[]');
}
