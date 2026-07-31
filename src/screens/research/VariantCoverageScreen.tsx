import { useState, useMemo, useEffect, memo } from 'react';
import { verifyAllModels, getCoverageStats } from '../../services/variant-verification';
import type { VariantReport, CoverageStats } from '../../services/variant-verification';
import { DashboardHeader } from '../../research-console/layout/ResearchLayout';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

export const VariantCoverageScreen = memo(function VariantCoverageScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const [reports, setReports] = useState<VariantReport[]>([]);
  const [stats, setStats] = useState<CoverageStats | null>(null);
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'full' | 'partial' | 'none'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setReports(verifyAllModels());
    setStats(getCoverageStats());
  }, []);

  const brands = useMemo(() => {
    const set = new Set(reports.map(r => r.brand));
    return Array.from(set).sort();
  }, [reports]);

  const filtered = useMemo(() => {
    let result = reports;

    if (brandFilter) {
      result = result.filter(r => r.brand === brandFilter);
    }

    if (statusFilter === 'full') {
      result = result.filter(r => r.coverage >= 1);
    } else if (statusFilter === 'partial') {
      result = result.filter(r => r.coverage > 0 && r.coverage < 1);
    } else if (statusFilter === 'none') {
      result = result.filter(r => r.coverage <= 0);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.model.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q)
      );
    }

    return result;
  }, [reports, brandFilter, statusFilter, searchQuery]);

  return (
    <div>
      <DashboardHeader title={t('research.variantCoverage.title' as any)} />

      {stats && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
          <span style={{ color: colors.success, fontWeight: 600 }}>
            {t('research.variantCoverage.summary.full' as any)}: {stats.fullCoverage}
          </span>
          <span style={{ color: colors.warning, fontWeight: 600 }}>
            {t('research.variantCoverage.summary.partial' as any)}: {stats.partialCoverage}
          </span>
          <span style={{ color: colors.danger, fontWeight: 600 }}>
            {t('research.variantCoverage.summary.none' as any)}: {stats.noCoverage}
          </span>
          <span style={{ color: colors.accent, fontWeight: 600 }}>
            {t('research.variantCoverage.summary.avg' as any)}: {(stats.averageCoverage * 100).toFixed(1)}%
          </span>
        </div>
      )}

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
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: `1px solid ${colors.border}`, background: '#12121a', color: colors.text, fontSize: '0.85rem' }}
        >
          <option value="all">{t('research.variantCoverage.filter.all' as any)}</option>
          <option value="full">{t('research.variantCoverage.filter.full' as any)}</option>
          <option value="partial">{t('research.variantCoverage.filter.partial' as any)}</option>
          <option value="none">{t('research.variantCoverage.filter.none' as any)}</option>
        </select>

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('research.variantCoverage.table.model' as any)}
          style={{ padding: '0.4rem 0.75rem', borderRadius: '4px', border: `1px solid ${colors.border}`, background: '#12121a', color: colors.text, fontSize: '0.85rem', flex: 1, minWidth: '180px' }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.variantCoverage.table.brand' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.variantCoverage.table.model' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.variantCoverage.table.coverage' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.variantCoverage.table.missing' as any)}</th>
              <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.variantCoverage.table.extra' as any)}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const pct = r.coverage * 100;
              const color = pct >= 90 ? colors.success : pct >= 50 ? colors.warning : colors.danger;
              return (
                <tr key={`${r.brand}-${r.model}`} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: '0.5rem', color: colors.text }}>{r.brand}</td>
                  <td style={{ padding: '0.5rem', color: colors.textSecondary }}>{r.model}</td>
                  <td style={{ padding: '0.5rem', color, fontWeight: 600 }}>{pct.toFixed(1)}%</td>
                  <td style={{ padding: '0.5rem', color: r.missing.length > 0 ? colors.danger : colors.textMuted, fontSize: '0.8rem' }}>
                    {r.missing.length > 0 ? r.missing.join(', ') : '—'}
                  </td>
                  <td style={{ padding: '0.5rem', color: r.extra.length > 0 ? colors.warning : colors.textMuted, fontSize: '0.8rem' }}>
                    {r.extra.length > 0 ? r.extra.join(', ') : '—'}
                  </td>
                </tr>
              );
            })}
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
