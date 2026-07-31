import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { verifyAllModels } from '../../services/variant-verification';
import { getAllPriceMemory } from '../../services/price-memory';
import type { VariantReport } from '../../services/variant-verification';
import type { ModelPriceHistory } from '../../services/price-memory';
import { DashboardHeader } from '../../research-console/layout/ResearchLayout';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

interface HealthReport {
  brand: string;
  model: string;
  variantsCount: number;
  hasPrices: boolean;
  missingVariants: string[];
  health: 'good' | 'warning' | 'critical';
  lastUpdated: string | null;
}

type HealthFilter = 'all' | 'good' | 'warning' | 'critical';

export const InventoryHealthScreen = memo(function InventoryHealthScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const [variantReports, setVariantReports] = useState<VariantReport[]>([]);
  const [priceMemory, setPriceMemory] = useState<ModelPriceHistory[]>([]);
  const [brandFilter, setBrandFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');

  useEffect(() => {
    setVariantReports(verifyAllModels());
    setPriceMemory(getAllPriceMemory());
  }, []);

  const reports = useMemo<HealthReport[]>(() => {
    const priceSet = new Set<string>();
    const priceDates = new Map<string, string>();
    for (const pm of priceMemory) {
      const key = `${pm.brand}|${pm.model}`.toLowerCase();
      if (pm.records.length > 0) {
        priceSet.add(key);
        const latestDate = pm.records.reduce((latest, r) =>
          r.date > latest ? r.date : latest, pm.records[0]!.date
        );
        priceDates.set(key, latestDate);
      }
    }

    return variantReports.map(r => {
      const key = `${r.brand}|${r.model}`.toLowerCase();
      const hasPrices = priceSet.has(key);
      const lastUpdated = priceDates.get(key) ?? null;
      const variantsCount = r.actualVariants.length;

      let health: 'good' | 'warning' | 'critical';
      if (variantsCount > 0 && hasPrices && r.missing.length === 0) {
        health = 'good';
      } else if (variantsCount === 0 && !hasPrices) {
        health = 'critical';
      } else {
        health = 'warning';
      }

      return {
        brand: r.brand,
        model: r.model,
        variantsCount,
        hasPrices,
        missingVariants: r.missing,
        health,
        lastUpdated,
      };
    });
  }, [variantReports, priceMemory]);

  const stats = useMemo(() => {
    const total = reports.length;
    const missingPrices = reports.filter(r => !r.hasPrices).length;
    const missingVariantsCount = reports.filter(r => r.variantsCount === 0).length;
    const complete = reports.filter(r => r.health === 'good').length;
    return { total, missingPrices, missingVariants: missingVariantsCount, complete };
  }, [reports]);

  const brands = useMemo(() => {
    return Array.from(new Set(reports.map(r => r.brand))).sort();
  }, [reports]);

  const filtered = useMemo(() => {
    let result = reports;
    if (brandFilter) {
      result = result.filter(r => r.brand === brandFilter);
    }
    if (healthFilter !== 'all') {
      result = result.filter(r => r.health === healthFilter);
    }
    return result;
  }, [reports, brandFilter, healthFilter]);

  const handleExport = useCallback(() => {
    const header = `Brand\tModel\tVariants\tHas Prices\tMissing Variants\tHealth\tLast Updated`;
    const lines = filtered.map(r =>
      `${r.brand}\t${r.model}\t${r.variantsCount}\t${r.hasPrices ? 'Yes' : 'No'}\t${r.missingVariants.join(', ') || '—'}\t${r.health}\t${r.lastUpdated ?? '—'}`
    );
    const summary = `Total: ${stats.total} | Missing Prices: ${stats.missingPrices} | Missing Variants: ${stats.missingVariants} | Complete: ${stats.complete}`;
    return [summary, '', header, ...lines].join('\n');
  }, [filtered, stats]);

  const healthLabel = (h: string) => {
    switch (h) {
      case 'good': return t('research.inventoryHealth.health.good' as any);
      case 'warning': return t('research.inventoryHealth.health.warning' as any);
      case 'critical': return t('research.inventoryHealth.health.critical' as any);
      default: return h;
    }
  };

  const healthColor = (h: string) => {
    switch (h) {
      case 'good': return colors.success;
      case 'warning': return colors.warning;
      case 'critical': return colors.danger;
      default: return colors.text;
    }
  };

  return (
    <div>
      <DashboardHeader
        title={t('research.inventoryHealth.title' as any)}
        actions={
          <button
            onClick={() => {
              navigator.clipboard.writeText(handleExport()).catch(console.error);
            }}
            style={{
              padding: '0.4rem 1rem', borderRadius: '4px',
              border: `1px solid ${colors.border}`,
              background: colors.bgInput, color: colors.text,
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {t('research.inventoryHealth.export' as any)}
          </button>
        }
      />

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          flex: '1 1 160px', padding: '1rem', borderRadius: '8px',
          background: colors.bgCard, border: `1px solid ${colors.border}`,
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            {t('research.inventoryHealth.summary.totalModels' as any)}
          </p>
          <p style={{ color: colors.text, fontSize: '1.5rem', fontWeight: 'bold' }}>
            {stats.total}
          </p>
        </div>
        <div style={{
          flex: '1 1 160px', padding: '1rem', borderRadius: '8px',
          background: colors.bgCard, border: `1px solid ${colors.danger}`,
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            {t('research.inventoryHealth.summary.missingPrices' as any)}
          </p>
          <p style={{ color: colors.danger, fontSize: '1.5rem', fontWeight: 'bold' }}>
            {stats.missingPrices}
          </p>
        </div>
        <div style={{
          flex: '1 1 160px', padding: '1rem', borderRadius: '8px',
          background: colors.bgCard, border: `1px solid ${colors.warning}`,
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            {t('research.inventoryHealth.summary.missingVariants' as any)}
          </p>
          <p style={{ color: colors.warning, fontSize: '1.5rem', fontWeight: 'bold' }}>
            {stats.missingVariants}
          </p>
        </div>
        <div style={{
          flex: '1 1 160px', padding: '1rem', borderRadius: '8px',
          background: colors.bgCard, border: `1px solid ${colors.success}`,
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            {t('research.inventoryHealth.summary.complete' as any)}
          </p>
          <p style={{ color: colors.success, fontSize: '1.5rem', fontWeight: 'bold' }}>
            {stats.complete}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={brandFilter}
          onChange={e => setBrandFilter(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: `1px solid ${colors.border}`, background: '#12121a', color: colors.text, fontSize: '0.85rem' }}
        >
          <option value="">{t('research.variantCoverage.filter.brand' as any)}</option>
          {brands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value as HealthFilter)}
          style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: `1px solid ${colors.border}`, background: '#12121a', color: colors.text, fontSize: '0.85rem' }}
        >
          <option value="all">{t('research.inventoryHealth.filter.all' as any)}</option>
          <option value="good">{t('research.inventoryHealth.filter.good' as any)}</option>
          <option value="warning">{t('research.inventoryHealth.filter.warning' as any)}</option>
          <option value="critical">{t('research.inventoryHealth.filter.critical' as any)}</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.brand' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.model' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.variants' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.hasPrices' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.missingVariants' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.health' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.inventoryHealth.table.lastUpdated' as any)}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={`${r.brand}-${r.model}`} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <td style={{ padding: '0.5rem', color: colors.text }}>{r.brand}</td>
                <td style={{ padding: '0.5rem', color: colors.textSecondary }}>{r.model}</td>
                <td style={{ padding: '0.5rem', color: colors.text }}>{r.variantsCount}</td>
                <td style={{ padding: '0.5rem', color: r.hasPrices ? colors.success : colors.danger }}>
                  {r.hasPrices ? '✅' : '❌'}
                </td>
                <td style={{ padding: '0.5rem', color: r.missingVariants.length > 0 ? colors.danger : colors.textMuted, fontSize: '0.8rem' }}>
                  {r.missingVariants.length > 0 ? r.missingVariants.join(', ') : '—'}
                </td>
                <td style={{ padding: '0.5rem', color: healthColor(r.health), fontWeight: 600 }}>
                  {healthLabel(r.health)}
                </td>
                <td style={{ padding: '0.5rem', color: colors.textMuted, fontSize: '0.8rem' }}>
                  {r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem' }}>
          {t('research.noAccess')}
        </p>
      )}
    </div>
  );
});
