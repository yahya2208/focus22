import { memo, useState } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';

interface EditInventoryModalProps {
  record: InventoryRecord;
  colors: ThemeColors;
  onSave: (record: InventoryRecord, newQuantity: number) => void;
  onClose: () => void;
}

export const EditInventoryModal = memo(function EditInventoryModal({ record, colors, onSave, onClose }: EditInventoryModalProps) {
  const [quantity, setQuantity] = useState(record.quantity);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '20px', width: '300px',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px' }}>
          تعديل الكمية - {record.brand} {record.model}
        </h3>
        <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '12px' }}>
          {record.variant} · {record.storage} · {record.condition}
        </div>
        <input type="number" value={quantity} onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`,
            background: colors.bgInput, color: colors.text, fontSize: '1.2rem', textAlign: 'center', fontFamily: 'inherit',
            boxSizing: 'border-box', marginBottom: '12px',
          }} autoFocus />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textMuted, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>إلغاء</button>
          <button onClick={() => onSave(record, quantity)} style={{
            flex: 2, padding: '8px', borderRadius: '8px', border: 'none',
            background: colors.accent, color: '#fff', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>حفظ</button>
        </div>
      </div>
    </div>
  );
});
