import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryTransaction } from '../../services/inventory-service';

interface InventoryTransactionRowProps {
  tx: InventoryTransaction;
  colors: ThemeColors;
}

export const InventoryTransactionRow = memo(function InventoryTransactionRow({ tx, colors }: InventoryTransactionRowProps) {
  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '8px', padding: '8px 12px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '0.75rem',
    }}>
      <div>
        <span style={{
          color: tx.type === 'add' ? colors.success : tx.type === 'remove' ? '#e74c3c' : colors.warning,
          fontWeight: 600,
        }}>
          {tx.type === 'add' ? 'إضافة' : tx.type === 'remove' ? 'بيع' : 'تعديل'}
        </span>
        <span style={{ color: colors.textMuted, marginRight: '8px' }}>
          {tx.quantityBefore} ← {tx.quantityAfter}
        </span>
        {tx.note && <span style={{ color: colors.textMuted, marginRight: '8px' }}>({tx.note})</span>}
      </div>
      <span style={{ color: colors.textMuted, fontSize: '0.65rem' }}>
        {new Date(tx.createdAt).toLocaleString('ar')}
      </span>
    </div>
  );
});
