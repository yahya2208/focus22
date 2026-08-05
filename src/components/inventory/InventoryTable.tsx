import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';
import { InventoryRow } from './InventoryRow';

interface InventoryTableProps {
  filtered: InventoryRecord[];
  search: string;
  colors: ThemeColors;
  onEdit: (record: InventoryRecord) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

export const InventoryTable = memo(function InventoryTable({ filtered, search, colors, onEdit, onDelete, onToggleVisibility }: InventoryTableProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {filtered.length === 0 ? (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          {search ? 'لا توجد نتائج' : 'المخزون فارغ. أضف أول جهاز.'}
        </div>
      ) : (
        filtered.map(r => (
          <InventoryRow key={r.id} record={r} colors={colors} onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} onToggleVisibility={() => onToggleVisibility(r.id)} />
        ))
      )}
    </div>
  );
});
