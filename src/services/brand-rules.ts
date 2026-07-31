export interface BrandSeriesRule {
  series: string;
  pattern: RegExp;
  tier: 'budget' | 'mid' | 'high-end' | 'flagship';
  description: string;
}

export interface BrandRule {
  brand: string;
  aliases: string[];
  series: BrandSeriesRule[];
  modelPattern: RegExp;
  aliasTemplate?: (model: string) => string[];
}

function extractModelCode(model: string): string {
  const cleaned = model.replace(/^Galaxy\s+/i, '');
  const parts = cleaned.split(/\s+/);
  if (parts.length > 0 && /^[a-z]\d+$/i.test(parts[0]!)) {
    return parts[0]!.toUpperCase();
  }
  const match = cleaned.match(/([A-Za-z]+)\s*(\d+)/);
  if (match) {
    return `${match[1]!.toUpperCase()}${match[2]!}`;
  }
  return cleaned.replace(/\s+/g, '');
}

export const BRAND_RULES: Record<string, BrandRule> = {
  samsung: {
    brand: 'Samsung',
    aliases: ['سامسونج', 'Samsung', 'samsung'],
    series: [
      { series: 'Galaxy S', pattern: /^Galaxy\s+S/i, tier: 'flagship', description: 'Galaxy S series' },
      { series: 'Galaxy A', pattern: /^Galaxy\s+A/i, tier: 'mid', description: 'Galaxy A series' },
      { series: 'Galaxy M', pattern: /^Galaxy\s+M/i, tier: 'mid', description: 'Galaxy M series' },
      { series: 'Galaxy Note', pattern: /^Galaxy\s+Note/i, tier: 'high-end', description: 'Galaxy Note series' },
      { series: 'Galaxy Z', pattern: /^Galaxy\s+Z/i, tier: 'flagship', description: 'Galaxy Z foldable series' },
      { series: 'Galaxy J', pattern: /^Galaxy\s+J/i, tier: 'budget', description: 'Galaxy J series' },
      { series: 'Galaxy Tab', pattern: /^Galaxy\s+Tab/i, tier: 'mid', description: 'Galaxy Tab series' },
    ],
    modelPattern: /^Galaxy\s+\S+/i,
    aliasTemplate: (model) => ['SM-' + extractModelCode(model), extractModelCode(model)],
  },
  xiaomi: {
    brand: 'Xiaomi',
    aliases: ['شاومي', 'Xiaomi', 'xiaomi', 'شياومي'],
    series: [
      { series: 'Redmi', pattern: /^Redmi/i, tier: 'budget', description: 'Redmi budget series' },
      { series: 'Redmi Note', pattern: /^Redmi\s+Note/i, tier: 'mid', description: 'Redmi Note mid-range' },
      { series: 'Poco', pattern: /^Poco/i, tier: 'mid', description: 'Poco series' },
      { series: 'Mi', pattern: /^Mi\s/i, tier: 'flagship', description: 'Mi flagship series' },
      { series: 'Black Shark', pattern: /^Black\s+Shark/i, tier: 'high-end', description: 'Black Shark gaming series' },
    ],
    modelPattern: /^(Redmi|Redmi\s+Note|Poco|Mi|Black\s+Shark)/i,
    aliasTemplate: (model) => {
      const arBrand = 'شاومي';
      return [arBrand + ' ' + model, arBrand + model.replace(/\s/g, '')];
    },
  },
  apple: {
    brand: 'Apple',
    aliases: ['Apple', 'ابل', 'ايفون', 'iPhone'],
    series: [
      { series: 'iPhone', pattern: /^iPhone/i, tier: 'flagship', description: 'iPhone base' },
      { series: 'iPhone Pro', pattern: /^iPhone\s+\d+\s+Pro$/i, tier: 'flagship', description: 'iPhone Pro' },
      { series: 'iPhone Pro Max', pattern: /^iPhone\s+\d+\s+Pro\s+Max$/i, tier: 'flagship', description: 'iPhone Pro Max' },
      { series: 'iPhone SE', pattern: /^iPhone\s+SE/i, tier: 'mid', description: 'iPhone SE' },
    ],
    modelPattern: /^iPhone/i,
    aliasTemplate: () => [],
  },
  huawei: {
    brand: 'Huawei',
    aliases: ['هواوي', 'Huawei'],
    series: [
      { series: 'P series', pattern: /^P\d+/i, tier: 'flagship', description: 'Huawei P series' },
      { series: 'Mate', pattern: /^Mate/i, tier: 'high-end', description: 'Huawei Mate series' },
      { series: 'Nova', pattern: /^Nova/i, tier: 'mid', description: 'Huawei Nova series' },
      { series: 'Y series', pattern: /^Y\d+/i, tier: 'budget', description: 'Huawei Y series' },
    ],
    modelPattern: /^(P\d+|Mate|Nova|Y\d+)/i,
  },
  oneplus: {
    brand: 'OnePlus',
    aliases: ['OnePlus', 'ون بلس', 'One Plus'],
    series: [
      { series: 'Nord', pattern: /^Nord/i, tier: 'mid', description: 'OnePlus Nord series' },
      { series: 'Ace', pattern: /^Ace/i, tier: 'high-end', description: 'OnePlus Ace series' },
    ],
    modelPattern: /^(Nord|Ace)/i,
  },
  realme: {
    brand: 'Realme',
    aliases: ['Realme', 'ريلمي'],
    series: [
      { series: 'GT', pattern: /^GT/i, tier: 'high-end', description: 'Realme GT series' },
      { series: 'Narzo', pattern: /^Narzo/i, tier: 'mid', description: 'Realme Narzo series' },
      { series: 'C series', pattern: /^C\d+/i, tier: 'budget', description: 'Realme C series' },
      { series: 'Number series', pattern: /^\d+\s*/i, tier: 'mid', description: 'Realme number series' },
    ],
    modelPattern: /^(GT|Narzo|C\d+|\d+)/i,
  },
  oppo: {
    brand: 'Oppo',
    aliases: ['Oppo', 'اوبو'],
    series: [
      { series: 'Find', pattern: /^Find/i, tier: 'flagship', description: 'Oppo Find series' },
      { series: 'Reno', pattern: /^Reno/i, tier: 'mid', description: 'Oppo Reno series' },
      { series: 'A series', pattern: /^A\d+/i, tier: 'budget', description: 'Oppo A series' },
    ],
    modelPattern: /^(Find|Reno|A\d+)/i,
  },
  vivo: {
    brand: 'Vivo',
    aliases: ['Vivo', 'فيفو'],
    series: [
      { series: 'Y series', pattern: /^Y\d+/i, tier: 'budget', description: 'Vivo Y series' },
      { series: 'V series', pattern: /^V\d+/i, tier: 'mid', description: 'Vivo V series' },
      { series: 'X series', pattern: /^X\d+/i, tier: 'flagship', description: 'Vivo X series' },
      { series: 'iQOO', pattern: /^iQOO/i, tier: 'high-end', description: 'Vivo iQOO series' },
    ],
    modelPattern: /^(Y\d+|V\d+|X\d+|iQOO)/i,
  },
  honor: {
    brand: 'Honor',
    aliases: ['Honor', 'أونور'],
    series: [
      { series: 'Magic', pattern: /^Magic/i, tier: 'flagship', description: 'Honor Magic series' },
      { series: 'X series', pattern: /^X\d+/i, tier: 'mid', description: 'Honor X series' },
    ],
    modelPattern: /^(Magic|X\d+)/i,
  },
  google: {
    brand: 'Google',
    aliases: ['Google', 'جوجل', 'Pixel'],
    series: [
      { series: 'Pixel', pattern: /^Pixel/i, tier: 'flagship', description: 'Google Pixel' },
      { series: 'Pixel Pro', pattern: /^Pixel\s+\d+\s+Pro/i, tier: 'flagship', description: 'Google Pixel Pro' },
      { series: 'Pixel XL', pattern: /^Pixel\s+\d+\s+XL/i, tier: 'flagship', description: 'Google Pixel XL' },
    ],
    modelPattern: /^Pixel/i,
  },
  nothing: {
    brand: 'Nothing',
    aliases: ['Nothing', 'نothing'],
    series: [],
    modelPattern: /^Nothing/i,
  },
};

export function getBrandRule(brand: string): BrandRule | null {
  const key = brand.toLowerCase().trim();
  return BRAND_RULES[key] ?? null;
}

export function detectBrandSeries(brand: string, model: string): BrandSeriesRule | null {
  const rule = getBrandRule(brand);
  if (!rule) return null;
  for (const s of rule.series) {
    if (s.pattern.test(model)) return s;
  }
  return null;
}

export function generateBrandAliases(brand: string, model: string): string[] {
  const aliases: Set<string> = new Set();
  const rule = getBrandRule(brand);
  if (!rule) return [];

  for (const al of rule.aliases) {
    aliases.add(al + ' ' + model);
    aliases.add(al + model.replace(/\s/g, ''));
  }

  if (rule.aliasTemplate) {
    for (const a of rule.aliasTemplate(model)) {
      aliases.add(a);
    }
  }

  const series = detectBrandSeries(brand, model);
  if (series) {
    const afterSeries = model.replace(series.pattern, '').trim();
    if (afterSeries) {
      aliases.add(afterSeries);
    }
  }

  return Array.from(aliases).filter(Boolean);
}

export function getBrandTier(brand: string, model: string): 'budget' | 'mid' | 'high-end' | 'flagship' {
  const series = detectBrandSeries(brand, model);
  return series?.tier ?? 'mid';
}

export function getAllBrandsWithRules(): string[] {
  return Object.values(BRAND_RULES).map(r => r.brand);
}
