import { getAllBrands } from '../catalog';
import { BRAND_RULES, generateBrandAliases, detectBrandSeries } from './brand-rules';

export interface AliasEntry {
  modelId: string;
  canonical: string;
  brand: string;
  model: string;
  aliases: string[];
}

const _aliases: Map<string, string> = new Map();
const _canonicalMap: Map<string, AliasEntry> = new Map();

const _brandAliases: Record<string, string> = {
  'سامسونج': 'Samsung', 'ابل': 'Apple', 'ايفون': 'Apple',
  'شاومي': 'Xiaomi', 'ريدمي': 'Redmi', 'شياومي': 'Xiaomi',
  'هواوي': 'Huawei', 'أونور': 'Honor', 'وان بلس': 'OnePlus',
  'جوجل': 'Google', 'نوكيا': 'Nokia', 'سوني': 'Sony',
  'موتورولا': 'Motorola', 'ال جي': 'LG', 'اتش تي سي': 'HTC',
  'اوبو': 'Oppo', 'فيفو': 'Vivo', 'ريلمي': 'Realme',
  'انفينيكس': 'Infinix', 'تكنو': 'Tecno', 'لينوفو': 'Lenovo',
  'اسوس': 'Asus', 'جيمي': 'Meizu', 'ون بلس': 'OnePlus',
  'نothing': 'Nothing',
};

const _brandReverse: Record<string, string[]> = {};
for (const [ar, en] of Object.entries(_brandAliases)) {
  const key = en.toLowerCase();
  if (!_brandReverse[key]) _brandReverse[key] = [];
  _brandReverse[key].push(ar);
}

const _digitMap: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function normalize(query: string): string {
  let s = query.toLowerCase().trim();
  for (const [ar, en] of Object.entries(_digitMap)) {
    s = s.replace(new RegExp(ar, 'g'), en);
  }
  return s.replace(/\s+/g, '').replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/g, '').split(/\s+/).filter(Boolean);
}

function stripCommonWords(model: string): string[] {
  const words = ['Pro', 'Max', 'Plus', 'Ultra', 'Lite', 'SE', 'FE', 'Mini', 'Neo'];
  const results: string[] = [model];
  for (const w of words) {
    const stripped = model.replace(new RegExp('\\s+' + w + '$', 'i'), '');
    if (stripped !== model) results.push(stripped);
    const stripped2 = model.replace(new RegExp(w + '\\s+', 'i'), '');
    if (stripped2 !== model) results.push(stripped2);
  }
  return results;
}

function generateModelAliases(brand: string, model: string): string[] {
  const aliases: Set<string> = new Set();
  const base = `${brand} ${model}`;

  aliases.add(normalize(base));
  aliases.add(normalize(model));
  aliases.add(normalize(`${brand}${model}`));

  const lowerModel = model.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  const arBrands = _brandReverse[lowerBrand];
  if (arBrands) {
    for (const ar of arBrands) {
      aliases.add(normalize(`${ar} ${model}`));
      aliases.add(normalize(`${ar}${model}`));
    }
  }

  const withoutBrand = lowerModel.replace(new RegExp(`^${lowerBrand}\\s*`), '');
  if (withoutBrand && withoutBrand !== lowerModel) {
    aliases.add(normalize(withoutBrand));
  }

  const modelWords = model.split(/\s+/);
  if (modelWords.length >= 2) {
    aliases.add(normalize(modelWords.join('')));
    const initials = modelWords.map(w => w[0]).filter(Boolean).join('');
    if (initials.length >= 2) aliases.add(normalize(initials));
  }

  const brandSeriesAliases = generateBrandAliases(brand, model);
  for (const a of brandSeriesAliases) {
    aliases.add(normalize(a));
  }

  const brandRule = BRAND_RULES[brand.toLowerCase().trim()];
  if (brandRule) {
    for (const al of brandRule.aliases) {
      aliases.add(normalize(al + model));
      aliases.add(normalize(al + ' ' + model));
    }
  }

  const series = detectBrandSeries(brand, model);
  if (series) {
    const afterSeries = model.replace(series.pattern, '').trim();
    if (afterSeries) {
      aliases.add(normalize(afterSeries));
      const seriesShort = series.series.split(/\s+/).map(w => w[0]).join('');
      if (seriesShort.length >= 1 && afterSeries) {
        aliases.add(normalize(seriesShort + afterSeries.replace(/\s/g, '')));
      }
    }
  }

  const parts = model.split(/(\d+)/);
  if (parts.length >= 3) {
    const alpha = parts[0]!.toLowerCase().replace(/\s/g, '');
    const num = parts[1]!;
    if (alpha && num) {
      aliases.add(normalize(`${alpha}${num}`));
      aliases.add(normalize(`${alpha}-${num}`));
    }
  }

  if (/^[a-z]\d{3,4}$/i.test(model.replace(/\s/g, ''))) {
    const smCode = model.replace(/\s/g, '').toUpperCase();
    aliases.add(normalize(smCode));
    aliases.add(normalize(`${brand}${smCode}`));
  }

  if (lowerModel.includes('galaxy') && lowerBrand.includes('samsung')) {
    const matches = model.match(/Galaxy\s+(\S+)/i);
    if (matches) {
      aliases.add(normalize(`samsung${matches[1]!}`));
      aliases.add(normalize(matches[1]!));
    }
  }

  for (const stripped of stripCommonWords(model)) {
    if (stripped !== model) {
      aliases.add(normalize(stripped));
      aliases.add(normalize(`${brand}${stripped}`));
      aliases.add(normalize(`${brand} ${stripped}`));
    }
  }

  return Array.from(aliases).filter(Boolean);
}

export function buildAliasIndex(): void {
  _aliases.clear();
  _canonicalMap.clear();

  for (const brand of getAllBrands()) {
    for (const model of brand.models) {
      const modelId = normalize(`${brand.brand}_${model.model}`);
      const canonical = `${brand.brand} ${model.model}`;
      const entryAliases = generateModelAliases(brand.brand, model.model);
      entryAliases.push(normalize(canonical));

      for (const a of entryAliases) {
        if (!_aliases.has(a)) _aliases.set(a, modelId);
      }

      if (!_canonicalMap.has(modelId)) {
        _canonicalMap.set(modelId, {
          modelId, canonical,
          brand: brand.brand, model: model.model,
          aliases: entryAliases,
        });
      }
    }
  }
}

export function resolveAlias(input: string): AliasEntry | null {
  if (_aliases.size === 0) buildAliasIndex();
  const key = normalize(input);
  if (!key) return null;
  const modelId = _aliases.get(key);
  if (!modelId) return null;
  return _canonicalMap.get(modelId) ?? null;
}

export interface AliasSearchResult {
  brand: string;
  model: string;
  score: number;
  matchedOn: string;
}

function tokenScore(queryToken: string, targetWord: string): number {
  if (targetWord === queryToken) return 100;
  if (targetWord.startsWith(queryToken) && queryToken.length >= 3) return 85;
  if (targetWord.includes(queryToken) && queryToken.length >= 3) return 70;
  if (queryToken.startsWith(targetWord) && targetWord.length >= 3) return 60;
  return 0;
}

function translateToken(t: string): string {
  const brandEntry = Object.entries(_brandAliases).find(([ar]) => t === ar);
  if (brandEntry) return brandEntry[1].toLowerCase();
  for (const [ar, en] of Object.entries(_digitMap)) {
    t = t.replace(new RegExp(ar, 'g'), en);
  }
  return t;
}

function searchByTokens(query: string): AliasSearchResult[] {
  const rawTokens = tokenize(query);
  if (rawTokens.length === 0) return [];
  const tokens = rawTokens.map(translateToken).filter(Boolean);

  const scored: { brand: string; model: string; score: number }[] = [];

  for (const brand of getAllBrands()) {
    const brandWords = tokenize(brand.brand);
    const aliasWords = brand.aliases.flatMap(a => tokenize(a));
    const allBrandTokens = [...new Set([...brandWords, ...aliasWords])];

    for (const model of brand.models) {
      const modelWords = tokenize(model.model);
      const allWords = [...new Set([...allBrandTokens, ...modelWords])];
      const fullText = (brand.brand + ' ' + brand.aliases.join(' ') + ' ' + model.model).toLowerCase();

      let total = 0;
      let matched = 0;

      for (const qt of tokens) {
        total++;
        let best = 0;

        for (const bw of allBrandTokens) {
          const s = tokenScore(qt, bw);
          if (s > best) best = s;
        }

        for (const mw of modelWords) {
          const s = tokenScore(qt, mw);
          if (s > best) best = s;
        }

        for (const mn of model.modelNumbers) {
          const mnNorm = mn.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (mnNorm.includes(qt) && qt.length >= 3) { best = Math.max(best, 90); }
          if (mnNorm === qt) { best = Math.max(best, 100); }
        }

        if (best === 0 && fullText.includes(qt) && qt.length >= 3) best = 50;

        if (qt.length <= 2) {
          const exactWord = allWords.some(w => w === qt);
          best = exactWord ? 100 : 0;
        }

        if (best >= 50) matched++;
      }

      let finalScore = 0;

      if (matched > 0) {
        const pct = matched / total;
        const brandExact = allBrandTokens.some(bw => tokens.some(t => bw === t));
        const quality = brandExact ? 1.2 : pct >= 1 ? 1.0 : 0.7;
        finalScore = Math.round(pct * 100 * quality);
      }

      const qLower = query.toLowerCase().trim();
      const mLower = model.model.toLowerCase();
      if (mLower.startsWith(qLower + ' ') && qLower.length >= 3) {
        finalScore = Math.max(finalScore, 95);
      }

      if (finalScore > 0) {
        scored.push({ brand: brand.brand, model: model.model, score: finalScore });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => ({
      brand: s.brand, model: s.model,
      score: Math.min(100, s.score),
      matchedOn: 'token',
    }));
}

export function searchWithAliases(query: string, limit = 20): AliasSearchResult[] {
  if (!query.trim()) return [];
  if (_aliases.size === 0) buildAliasIndex();

  const seen = new Set<string>();
  const results: AliasSearchResult[] = [];

  const exact = resolveAlias(query);
  if (exact) {
    const dedupKey = `${exact.brand}|${exact.model}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      results.push({ brand: exact.brand, model: exact.model, score: 110, matchedOn: 'exact' });
    }
  }

  const tokenResults = searchByTokens(query);
  for (const r of tokenResults) {
    const dedupKey = `${r.brand}|${r.model}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      results.push(r);
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getAllAliases(): AliasEntry[] {
  if (_canonicalMap.size === 0) buildAliasIndex();
  return Array.from(_canonicalMap.values());
}

export function getAliasCount(brand: string, model: string): number {
  if (_canonicalMap.size === 0) buildAliasIndex();
  const modelId = normalize(`${brand}_${model}`);
  const entry = _canonicalMap.get(modelId);
  return entry ? entry.aliases.length : 0;
}

export function getModelsWithFewAliases(threshold: number): { brand: string; model: string; aliasCount: number }[] {
  if (_canonicalMap.size === 0) buildAliasIndex();
  const result: { brand: string; model: string; aliasCount: number }[] = [];
  for (const entry of _canonicalMap.values()) {
    if (entry.aliases.length < threshold) {
      result.push({ brand: entry.brand, model: entry.model, aliasCount: entry.aliases.length });
    }
  }
  return result;
}

export function rebuildAliasIndex(): void {
  buildAliasIndex();
}

buildAliasIndex();
