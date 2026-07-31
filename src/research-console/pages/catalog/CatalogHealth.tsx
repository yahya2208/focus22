import { useState, useMemo } from 'react';
import { PHONE_CATALOG, PHONE_MODELS } from '../../../data/phone-catalog';
import { PHONE_VARIANTS } from '../../../data/phone-variants';
import { InventoryService } from '../../../services/inventory-service';
import { getAllAliases } from '../../../services/alias-engine';
import { DashboardHeader, StatCard } from '../../layout/ResearchLayout';
import type { InventoryRecord } from '../../../services/inventory-service';
import { useThemeColors } from '../../../hooks/useThemeColors';

function computeHealth() {
  const allRecords = InventoryService.getAll();
  const brands = PHONE_CATALOG;
  const totalModels = brands.reduce((sum, b) => sum + b.models.length, 0);
  const totalBrands = brands.length;
  const totalVariants = PHONE_VARIANTS.length;

  const modelsInInventory = new Set(allRecords.map(r => r.modelId.toLowerCase()));
  const neverInInventory: { brand: string; model: string }[] = [];
  for (const b of brands) {
    for (const m of b.models) {
      const modelId = `${b.brand} ${m}`.toLowerCase();
      if (!modelsInInventory.has(modelId)) {
        neverInInventory.push({ brand: b.brand, model: m });
      }
    }
  }

  const outOfStock = allRecords.filter(r => r.quantity <= 0);

  const seen = new Set<string>();
  const duplicateVariantRecords: InventoryRecord[] = [];
  for (const r of allRecords) {
    const key = `${r.modelId}-${r.variant}`;
    if (seen.has(key)) duplicateVariantRecords.push(r);
    seen.add(key);
  }

  const sorted = [...allRecords].sort((a, b) => ((b.totalPurchased ?? 0) + (b.totalSold ?? 0)) - ((a.totalPurchased ?? 0) + (a.totalSold ?? 0)));
  const mostUsed = sorted.slice(0, 5);
  const leastUsed = sorted.slice(-5).reverse();

  const normalizedGroups: Record<string, { brand: string; model: string }[]> = {};
  for (const entry of PHONE_MODELS) {
    const key = entry.normalized;
    if (!normalizedGroups[key]) normalizedGroups[key] = [];
    normalizedGroups[key].push({ brand: entry.brand, model: entry.model });
  }
  const duplicateModels = Object.values(normalizedGroups).filter(group => group.length > 1);

  const allAliases = getAllAliases();
  const modelsWithExtraAliases = allAliases.filter(a => a.aliases.length > 3);
  const aliasCoverage = allAliases.length > 0 ? Math.round((modelsWithExtraAliases.length / allAliases.length) * 100) : 0;

  const modelsWithoutStock = neverInInventory.length + outOfStock.length;

  return {
    totalModels,
    totalBrands,
    totalVariants,
    modelsWithoutStock,
    neverInInventoryCount: neverInInventory.length,
    neverInInventory,
    duplicateModels,
    duplicateModelsCount: duplicateModels.length,
    duplicateVariantRecords,
    duplicateVariantsCount: duplicateVariantRecords.length,
    outOfStock,
    outOfStockCount: outOfStock.length,
    mostUsed,
    leastUsed,
    aliasCoverage,
    recordsInStock: allRecords.filter(r => r.quantity > 0).length,
  };
}

function ExpandableSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '0.75rem 1rem', background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: '8px', color: '#f0f0f0', fontSize: '0.95rem', fontWeight: 600,
          cursor: 'pointer', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{title}</span>
      </button>
      {open && (
        <div style={{ padding: '0.75rem', background: '#0d0d14', border: '1px solid #1e1e2e', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function CatalogHealth() {
  const theme = useThemeColors();

  const health = useMemo(() => computeHealth(), []);

  const summaryCards = [
    { label: 'إجمالي الموديلات', value: health.totalModels, color: theme.accent },
    { label: 'العلامات التجارية', value: health.totalBrands, color: theme.accent },
    { label: 'إجمالي النسخ', value: health.totalVariants, color: theme.accent },
    { label: 'موديلات بدون مخزون', value: health.modelsWithoutStock, color: health.modelsWithoutStock > 0 ? theme.warning : theme.success },
    { label: 'موديلات مكررة', value: health.duplicateModelsCount, color: health.duplicateModelsCount > 0 ? theme.danger : theme.success },
    { label: 'نسخ مكررة', value: health.duplicateVariantsCount, color: health.duplicateVariantsCount > 0 ? theme.danger : theme.success },
    { label: 'لم يتم اختيارها أبداً', value: health.neverInInventoryCount, color: health.neverInInventoryCount > 0 ? theme.warning : theme.success },
    { label: 'نفد المخزون', value: health.outOfStockCount, color: health.outOfStockCount > 0 ? theme.danger : theme.success },
    { label: 'متوفر بالمخزون', value: health.recordsInStock, color: theme.success },
    { label: 'تغطية الأسماء البديلة', value: `${health.aliasCoverage}%`, subtitle: `${health.aliasCoverage >= 70 ? 'جيدة' : health.aliasCoverage >= 40 ? 'متوسطة' : 'ضعيفة'}`, color: health.aliasCoverage >= 70 ? theme.success : health.aliasCoverage >= 40 ? theme.warning : theme.danger },
  ];

  return (
    <div dir="rtl">
      <DashboardHeader title="صحة كتالوج الهواتف" subtitle="لوحة تشخيصية لحالة كتالوج الهواتف والمخزون" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {summaryCards.map(card => (
          <StatCard key={card.label} label={card.label} value={card.value} subtitle={'subtitle' in card ? (card as any).subtitle : undefined} color={card.color} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <ExpandableSection title={`موديلات بدون مخزون (${health.neverInInventoryCount + health.outOfStockCount})`}>
          {health.neverInInventory.length === 0 && health.outOfStock.length === 0 ? (
            <p style={{ color: theme.success, textAlign: 'center', padding: '1rem' }}>جميع الموديلات متوفرة بالمخزون ✅</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {health.neverInInventory.length > 0 && (
                <div>
                  <h3 style={{ color: theme.warning, fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    موديلات بدون سجل مخزون (لم يتم اختيارها) — {health.neverInInventory.length}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem' }}>
                    {health.neverInInventory.map((item, i) => (
                      <div key={i} style={{ padding: '0.35rem 0.6rem', background: theme.warningBg, borderRadius: '4px', border: `1px solid ${theme.warning}22`, fontSize: '0.75rem' }}>
                        <span style={{ color: theme.text }}>{item.brand}</span>
                        <span style={{ color: theme.textMuted }}> — </span>
                        <span style={{ color: theme.textSecondary }}>{item.model}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {health.outOfStock.length > 0 && (
                <div>
                  <h3 style={{ color: theme.danger, fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    موديلات نفد مخزونها (الكمية = 0) — {health.outOfStock.length}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem' }}>
                    {health.outOfStock.map((r, i) => (
                      <div key={i} style={{ padding: '0.35rem 0.6rem', background: theme.dangerBg, borderRadius: '4px', border: `1px solid ${theme.danger}22`, fontSize: '0.75rem' }}>
                        <span style={{ color: theme.text }}>{r.brand} {r.model}</span>
                        <span style={{ color: theme.textMuted }}> — </span>
                        <span style={{ color: theme.textSecondary }}>{r.variant}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ExpandableSection>

        <ExpandableSection title={`أكثر الموديلات استخداماً`}>
          {health.mostUsed.length === 0 ? (
            <p style={{ color: theme.textMuted, textAlign: 'center', padding: '1rem' }}>لا توجد بيانات كافية</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>#</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>الموديل</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>النسخة</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>تم الشراء</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>تم البيع</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>المجموع</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>المخزون</th>
                </tr>
              </thead>
              <tbody>
                {health.mostUsed.map((r, i) => {
                  const total = (r.totalPurchased ?? 0) + (r.totalSold ?? 0);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderLight}`, color: theme.text }}>
                      <td style={{ padding: '0.5rem', color: theme.textMuted }}>{i + 1}</td>
                      <td style={{ padding: '0.5rem' }}>{r.brand} {r.model}</td>
                      <td style={{ padding: '0.5rem', color: theme.textSecondary }}>{r.variant}</td>
                      <td style={{ padding: '0.5rem', color: theme.success }}>{r.totalPurchased ?? 0}</td>
                      <td style={{ padding: '0.5rem', color: theme.warning }}>{r.totalSold ?? 0}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: theme.accent }}>{total}</td>
                      <td style={{ padding: '0.5rem', color: r.quantity > 0 ? theme.success : theme.danger }}>{r.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ExpandableSection>

        <ExpandableSection title={`أقل الموديلات استخداماً`}>
          {health.leastUsed.length === 0 ? (
            <p style={{ color: theme.textMuted, textAlign: 'center', padding: '1rem' }}>لا توجد بيانات كافية</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>#</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>الموديل</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>النسخة</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>تم الشراء</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>تم البيع</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>المجموع</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>المخزون</th>
                </tr>
              </thead>
              <tbody>
                {health.leastUsed.map((r, i) => {
                  const total = (r.totalPurchased ?? 0) + (r.totalSold ?? 0);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderLight}`, color: theme.text }}>
                      <td style={{ padding: '0.5rem', color: theme.textMuted }}>{i + 1}</td>
                      <td style={{ padding: '0.5rem' }}>{r.brand} {r.model}</td>
                      <td style={{ padding: '0.5rem', color: theme.textSecondary }}>{r.variant}</td>
                      <td style={{ padding: '0.5rem', color: theme.success }}>{r.totalPurchased ?? 0}</td>
                      <td style={{ padding: '0.5rem', color: theme.warning }}>{r.totalSold ?? 0}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: theme.danger }}>{total}</td>
                      <td style={{ padding: '0.5rem', color: r.quantity > 0 ? theme.success : theme.danger }}>{r.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </ExpandableSection>
      </div>
    </div>
  );
}
