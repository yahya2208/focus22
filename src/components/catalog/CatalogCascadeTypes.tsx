import type { CatalogSearchResult } from '../../services/catalog-service';
import type { DeviceCondition } from '../../services/price-memory';
import { useThemeColors } from '../../hooks/useThemeColors';
import { InventoryService } from '../../services/inventory-service';
import { formatVariant, parseVariant } from '../../data/phone-variants';

export type { CatalogSearchResult, DeviceCondition };

export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ARABIC_BRANDS: Record<string, string> = {
  'سامسونج': 'Samsung', 'أبل': 'Apple', 'آيفون': 'Apple', 'شاومي': 'Xiaomi',
  'هواوي': 'Huawei', 'أوبو': 'Oppo', 'فيفو': 'Vivo', 'ون بلس': 'OnePlus',
  'نوكيا': 'Nokia', 'سوني': 'Sony', 'إل جي': 'LG', 'جوجل': 'Google',
  'موتورولا': 'Motorola', 'ريلمي': 'Realme', 'أونور': 'Honor', 'إنفينيكس': 'Infinix',
  'تكنو': 'Tecno', 'إتش تي سي': 'HTC', 'لينوفو': 'Lenovo', 'أسوس': 'Asus',
  'ميزو': 'Meizu', 'شارب': 'Sharp', 'بوكو': 'POCO', 'ريدمي': 'Redmi',
};

export const STEP_NAMES = ['بحث', 'براند', 'سلسلة', 'موديل', 'نسخة', 'حالة', 'عملية'];

export function getFavorites(): { brand: string; model: string }[] {
  try { return JSON.parse(localStorage.getItem('catalog_favorites') || '[]'); } catch { return []; }
}
export function saveFavorites(favs: { brand: string; model: string }[]): void {
  localStorage.setItem('catalog_favorites', JSON.stringify(favs.slice(0, 50)));
}
export function addFavorite(brand: string, model: string): void {
  const favs = getFavorites().filter(f => !(f.brand === brand && f.model === model));
  favs.unshift({ brand, model });
  saveFavorites(favs);
}
export function getMostUsed(): { brand: string; model: string; count: number }[] {
  try { return JSON.parse(localStorage.getItem('catalog_most_used') || '[]'); } catch { return []; }
}
export function trackUsage(brand: string, model: string): void {
  const used = getMostUsed();
  const existing = used.find(u => u.brand === brand && u.model === model);
  if (existing) { existing.count++; } else { used.push({ brand, model, count: 1 }); }
  used.sort((a, b) => b.count - a.count);
  localStorage.setItem('catalog_most_used', JSON.stringify(used.slice(0, 50)));
}

function canonicalVariantKey(variant: string): string {
  const parsed = parseVariant(variant);
  if (!parsed) return variant;
  return formatVariant(parsed.ram, parsed.storage);
}

export function getStockForModel(modelId: string): { variant: string; stock: number }[] {
  try {
    const records = InventoryService.getAll();
    const counts: Record<string, number> = {};

    const addMatching = (targetId: string) => {
      let matched = false;
      for (const r of records) {
        if (r.modelId.toLowerCase() === targetId.toLowerCase()) {
          matched = true;
          const key = canonicalVariantKey(r.variant || (r.ram || r.storage ? `${r.ram || ''}/${r.storage || ''}` : 'default'));
          counts[key] = (counts[key] || 0) + r.quantity;
        }
      }
      return matched;
    };

    if (!addMatching(modelId)) {
      return [];
    }

    return Object.entries(counts).map(([variant, stock]) => ({ variant, stock }));
  } catch { return []; }
}

export function getPriceSummary(modelId: string): { lastBuy?: number; avgBuy?: number; lastSell?: number; avgSell?: number } {
  try {
    const raw = localStorage.getItem('price_memory_v1');
    if (!raw) return {};
    const prices: Record<string, Array<{ operation: string; price: number }>> = JSON.parse(raw);
    const modelPrices = prices[modelId];
    if (!modelPrices) return {};
    const buys = modelPrices.filter((p) => p.operation === 'buy').map((p) => p.price);
    const sells = modelPrices.filter((p) => p.operation === 'sell').map((p) => p.price);
    return {
      lastBuy: buys.length > 0 ? buys[buys.length - 1] : undefined,
      avgBuy: buys.length > 0 ? Math.round(buys.reduce((a: number, b: number) => a + b, 0) / buys.length) : undefined,
      lastSell: sells.length > 0 ? sells[sells.length - 1] : undefined,
      avgSell: sells.length > 0 ? Math.round(sells.reduce((a: number, b: number) => a + b, 0) / sells.length) : undefined,
    };
  } catch { return {}; }
}

export function Highlight({ text, query, accentColor }: { text: string; query: string; accentColor: string }) {
  if (!query.trim()) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: accentColor, fontWeight: 700 }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

export function StepIndicator({ current, stepNames }: { current: number; total?: number; stepNames: string[] }) {
  const colors = useThemeColors();
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', justifyContent: 'center' }}>
      {stepNames.map((name, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          opacity: i <= current ? 1 : 0.35,
          color: i <= current ? colors.accent : colors.textMuted,
          fontSize: '0.68rem', fontWeight: i === current ? 700 : 400,
        }}>
          {i > 0 && <span style={{ color: colors.border }}>‹</span>}
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
}
