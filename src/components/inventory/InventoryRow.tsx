import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';

interface InventoryRowProps {
  record: InventoryRecord;
  colors: ThemeColors;
  busy?: boolean;
  published: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onTogglePublish: () => void;
}

export const InventoryRow = memo(function InventoryRow({ record, colors, busy = false, published, onEdit, onDelete, onToggleVisibility, onTogglePublish }: InventoryRowProps) {
  const statusColor = record.quantity <= 0 ? '#e74c3c' : record.quantity <= 3 ? '#f39c12' : colors.success;
  const isHidden = record.status === 'archived' || record.status === 'discontinued';
  const disabled = { opacity: 0.55, cursor: 'wait' } as const;

  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '8px', padding: '8px 12px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>
          {record.brand} {record.model}
        </div>
        <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>
          {record.variant} · {record.storage}
        </div>
        <div style={{ color: colors.textMuted, fontSize: '0.65rem', marginTop: '2px' }}>
          {record.condition}
        </div>
        {record.sourceLabel && (
          <div style={{ color: colors.accent, fontSize: '0.6rem', marginTop: '2px', fontStyle: 'italic' }}>
            {record.sourceLabel}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: statusColor, fontSize: '1rem', fontWeight: 700 }}>{record.quantity}</div>
          <div style={{ color: colors.textMuted, fontSize: '0.55rem' }}>
            {record.quantity <= 0 ? 'نفد' : record.quantity <= 3 ? 'منخفض' : 'متوفر'}
          </div>
        </div>
        <button onClick={onEdit} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: colors.infoBg, color: colors.info, fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>تعديل</button>
        <button onClick={onTogglePublish} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: published ? colors.successBg : colors.bgInput,
          color: published ? colors.success : colors.textMuted, fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>{published ? 'منشور' : 'نشر'}</button>
        <button onClick={onToggleVisibility} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: colors.bgInput, color: colors.textMuted, fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>{isHidden ? 'إظهار' : 'إخفاء'}</button>
        <button onClick={onDelete} disabled={busy} style={{
          padding: '4px 8px', borderRadius: '4px', border: 'none',
          background: '#e74c3c20', color: '#e74c3c', fontSize: '0.65rem', cursor: 'pointer',
          ...(busy ? disabled : {}),
        }}>حذف</button>
      </div>
    </div>
  );
});
