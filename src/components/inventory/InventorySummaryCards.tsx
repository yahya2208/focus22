import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';

interface InventorySummaryCardsProps {
  colors: ThemeColors;
  totalItems: number;
  recordsCount: number;
  lowStock: number;
  outOfStock: number;
}

const StatCard = memo(function StatCard({ colors, label, value, color }: {
  colors: ThemeColors; label: string; value: string; color: string;
}) {
  return (
    <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ color: colors.textMuted, fontSize: '0.6rem' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color, marginTop: '2px' }}>{value}</div>
    </div>
  );
});

export const InventorySummaryCards = memo(function InventorySummaryCards({ colors, totalItems, recordsCount, lowStock, outOfStock }: InventorySummaryCardsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
      <StatCard colors={colors} label="إجمالي القطع" value={totalItems.toString()} color={colors.accent} />
      <StatCard colors={colors} label="موديلات" value={recordsCount.toString()} color={colors.info} />
      <StatCard colors={colors} label="سينفد" value={lowStock.toString()} color="#f39c12" />
      <StatCard colors={colors} label="نفد" value={outOfStock.toString()} color="#e74c3c" />
    </div>
  );
});
