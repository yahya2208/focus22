import { getVariantsByName } from '../catalog/loader';

export type StorageSize = '4GB' | '8GB' | '16GB' | '32GB' | '64GB' | '128GB' | '256GB' | '512GB' | '1TB' | '2TB';
export type RamSize = '0.25GB' | '0.5GB' | '1GB' | '2GB' | '3GB' | '4GB' | '6GB' | '8GB' | '12GB' | '16GB' | '18GB' | '24GB' | '32GB';

export interface PhoneVariant {
  ram: RamSize;
  storage: StorageSize;
  label: string;
}

export const RAM_VALUES: RamSize[] = ['1GB', '2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '18GB', '24GB', '32GB'];
export const STORAGE_VALUES: StorageSize[] = ['8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

export const RAM_OPTIONS = RAM_VALUES;
export const STORAGE_OPTIONS = STORAGE_VALUES;

export const VARIANT_EXCEPTIONS: string[] = [
  '1/256', '1/512', '1/1T',
  '2/512', '2/1T',
  '3/512', '3/1T',
  '4/1T', '4/2T',
  '6/1T', '6/2T',
  '8/1T',
  '32/64', '32/128', '32/256', '32/512', '32/1T', '32/2T',
  '18/8', '18/16', '18/32', '18/64', '18/128',
  '24/8', '24/16', '24/32', '24/64', '24/128',
  '32/8', '32/16', '32/32',
  '16/8', '16/16', '16/32', '16/64',
  '12/8', '12/16', '12/32',
  '8/8', '8/16',
  '6/8', '6/16',
  '4/8',
  '3/8',
  '2/8',
];

export const MODEL_VARIANT_OVERRIDES: Record<string, string[]> = {};

function toGB(value: string): number {
  if (value.endsWith('TB')) return parseInt(value) * 1024;
  return parseInt(value);
}

function storageLabel(storage: StorageSize): string {
  if (storage.endsWith('TB')) return `${parseInt(storage)}T`;
  return storage.replace('GB', '');
}

export function generateAllVariants(): PhoneVariant[] {
  const variants: PhoneVariant[] = [];
  for (const ram of RAM_VALUES) {
    const ramGB = toGB(ram);
    for (const storage of STORAGE_VALUES) {
      const storageGB = toGB(storage);
      if (ramGB >= 1 && storageGB >= 8 && storageGB / ramGB <= 128) {
        const label = `${parseInt(ram)}/${storageLabel(storage)}`;
        if (!VARIANT_EXCEPTIONS.includes(label)) {
          variants.push({ ram, storage, label });
        }
      }
    }
  }
  variants.sort((a, b) => {
    const aRam = toGB(a.ram);
    const bRam = toGB(b.ram);
    if (aRam !== bRam) return aRam - bRam;
    return toGB(a.storage) - toGB(b.storage);
  });
  return variants;
}

export const PHONE_VARIANTS = generateAllVariants();

export const VARIANT_LOOKUP: Map<string, PhoneVariant> = new Map(
  PHONE_VARIANTS.map(v => [v.label, v])
);

function toGBf(value: string): number {
  if (value.endsWith('TB')) return parseFloat(value) * 1024;
  return parseFloat(value);
}

function ramToSize(ram: string): RamSize {
  const n = Number(ram);
  if (n === 0.25) return '0.25GB';
  if (n === 0.5) return '0.5GB';
  return `${n}GB` as RamSize;
}

function storageToSize(storage: string): StorageSize {
  const n = Number(storage);
  if (Number.isInteger(n) && (n === 1000 || n === 2000)) return `${n / 1000}TB` as StorageSize;
  return `${n}GB` as StorageSize;
}

export function getRealVariantsForModel(modelName: string, brand?: string): PhoneVariant[] {
  const catalogVariants = getVariantsByName(modelName, brand);
  const seen = new Set<string>();
  const result: PhoneVariant[] = [];
  for (const cv of catalogVariants) {
    const ram = ramToSize(cv.ram);
    const storage = storageToSize(cv.storage);
    const label = formatVariant(ram, storage);
    if (seen.has(label)) continue;
    seen.add(label);
    result.push({ ram, storage, label });
  }
  result.sort((a, b) => {
    const ar = toGBf(a.ram);
    const br = toGBf(b.ram);
    if (ar !== br) return ar - br;
    return toGBf(a.storage) - toGBf(b.storage);
  });
  return result;
}

/**
 * Real variants for a model. When `brand` is provided, results are restricted
 * to that brand (cross-brand isolation — S2 AT-23). When `brand` is absent,
 * legacy behavior is kept: first brand match wins (backward compatible).
 */
export function getVariantsForModel(modelName: string, brand?: string): PhoneVariant[] {
  if (!brand && MODEL_VARIANT_OVERRIDES[modelName]) {
    return MODEL_VARIANT_OVERRIDES[modelName]
      .map(label => VARIANT_LOOKUP.get(label))
      .filter((v): v is PhoneVariant => v !== undefined);
  }
  const real = getRealVariantsForModel(modelName, brand);
  if (real.length > 0) return real;
  return getHeuristicVariants(modelName);
}

/**
 * REMOVABLE FALLBACK (P2-C, C-1): heuristic variant buckets used ONLY when a
 * model has no real JSON variants (0 of 866 today). Safe to delete once the
 * JSON catalog guarantees a variants array for every model.
 */
function getHeuristicVariants(modelName: string): PhoneVariant[] {
  const lower = modelName.toLowerCase();
  const isHighEnd = lower.includes('pro') || lower.includes('ultra') || lower.includes('max') || lower.includes('plus')
    || lower.includes('s25') || lower.includes('s24') || lower.includes('s23') || lower.includes('s22') || lower.includes('s21')
    || lower.includes('iphone 15') || lower.includes('iphone 16') || lower.includes('iphone 14 pro')
    || lower.includes('fold') || lower.includes('flip') || lower.includes('note20') || lower.includes('note10');
  const isBudget = lower.includes('a0') || lower.includes('a1') || lower.includes('a2') || lower.includes('a3')
    || lower.includes('y6') || lower.includes('y5') || lower.includes('y4')
    || lower.includes('redmi 9') || lower.includes('redmi 8') || lower.includes('redmi 7')
    || lower.includes('note 8') || lower.includes('note 9') || lower.includes('note 10')
    || /^j\d/.test(lower) || lower.includes('galaxy j')
    || lower.includes('galaxy a0') || lower.includes('galaxy a1') || lower.includes('galaxy a2') || lower.includes('galaxy a3');

  if (isHighEnd) {
    return PHONE_VARIANTS.filter(v =>
      ['8/128', '8/256', '8/512', '12/128', '12/256', '12/512', '12/1T', '16/256', '16/512', '16/1T', '24/1T'].includes(v.label)
    );
  }
  if (isBudget) {
    return PHONE_VARIANTS.filter(v =>
      ['1/8', '1/16', '2/16', '2/32', '2/64', '3/32', '3/64', '4/64', '4/128'].includes(v.label)
    );
  }
  return PHONE_VARIANTS.filter(v =>
    ['2/32', '2/64', '3/32', '3/64', '4/64', '4/128', '4/256', '6/64', '6/128', '6/256', '8/128', '8/256'].includes(v.label)
  );
}

export function formatVariant(ram: string, storage: string): string {
  const r = ram.replace(/GB$/i, '');
  const s = /TB$/i.test(storage)
    ? `${storage.replace(/TB$/i, '')}T`
    : storage.replace(/GB$/i, '');
  return `${r}/${s}`;
}

export function parseVariant(label: string): { ram: string; storage: string } | null {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(T|TB)?$/i);
  if (!match) return null;
  const ramNum = match[1]!;
  const storageNum = match[2]!;
  const unit = (match[3] ?? '').toUpperCase();
  const ram = `${ramNum}GB`;
  const storage = unit === 'T' || unit === 'TB' ? `${storageNum}TB` : `${storageNum}GB`;
  return { ram, storage };
}
