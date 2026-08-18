import { memo, useEffect, useState } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';
import { InventoryService } from '../../services/inventory-service';
import { PhoneImageUploader } from '../showroom/PhoneImageUploader';
import { useInventoryImages } from '../../hooks/useInventoryImages';

interface EditInventoryModalProps {
  record: InventoryRecord;
  colors: ThemeColors;
  busy?: boolean;
  onSave: (record: InventoryRecord, newQuantity: number) => void | Promise<void>;
  onClose: () => void;
}

export const EditInventoryModal = memo(function EditInventoryModal({ record, colors, busy = false, onSave, onClose }: EditInventoryModalProps) {
  const [quantity, setQuantity] = useState(record.quantity);
  const [buyPrice, setBuyPrice] = useState(record.buyPrice != null ? String(record.buyPrice) : '');
  const [sellPrice, setSellPrice] = useState(record.sellPrice != null ? String(record.sellPrice) : '');
  const [images, setImages] = useState<string[]>(record.images ?? []);
  const persistedImages = useInventoryImages(record.id, record.images ?? []);

  useEffect(() => {
    setImages((prev) => (prev.length > 0 ? prev : persistedImages));
  }, [persistedImages]);
  const [color, setColor] = useState(record.color ?? '');
  const [batteryHealth, setBatteryHealth] = useState(record.batteryHealth != null ? String(record.batteryHealth) : '');
  const [warranty, setWarranty] = useState(record.warranty ?? '');
  const [city, setCity] = useState(record.city ?? '');
  const [description, setDescription] = useState(record.description ?? '');
  const [code, setCode] = useState(record.code ?? '');
  const [sourceLabel, setSourceLabel] = useState(record.sourceLabel ?? '');

  const handleSave = async () => {
    if (busy) return;
    await InventoryService.updateImages(record.id, images);
    await InventoryService.updatePrices(
      record.id,
      buyPrice ? parseInt(buyPrice) || undefined : undefined,
      sellPrice ? parseInt(sellPrice) || undefined : undefined,
    );
    await InventoryService.updateDetails(record.id, {
      color: color.trim(),
      batteryHealth: batteryHealth ? Math.max(0, Math.min(100, parseInt(batteryHealth) || 0)) : undefined,
      warranty: warranty.trim(),
      city: city.trim(),
      description: description.trim(),
      code: code.trim(),
      sourceLabel: sourceLabel.trim() || undefined,
    });
    await onSave(record, quantity);
  };

  const inputStyle = (multiline = false): React.CSSProperties => ({
    width: '100%',
    padding: '9px',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    background: colors.bgInput,
    color: colors.text,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: multiline ? 'vertical' : undefined,
    minHeight: multiline ? '64px' : undefined,
  });

  const field = (label: string, node: React.ReactNode) => (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>{label}</label>
      {node}
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '20px', width: '320px', maxHeight: '90vh', overflowY: 'auto',
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
        <div style={{ marginBottom: '12px' }}>
          <PhoneImageUploader images={images} onImagesChange={setImages} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div>
            <label style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>سعر الشراء (د.ج)</label>
            <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
              style={{
                width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }} />
          </div>
          <div>
            <label style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>سعر البيع (د.ج)</label>
            <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
              style={{
                width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {field('اللون', <input type="text" value={color} onChange={e => setColor(e.target.value)} style={inputStyle()} />)}
          {field('البطارية (%)', <input type="number" min={0} max={100} value={batteryHealth} onChange={e => setBatteryHealth(e.target.value)} style={inputStyle()} />)}
          {field('الضمان', <input type="text" value={warranty} onChange={e => setWarranty(e.target.value)} style={inputStyle()} />)}
          {field('المدينة', <input type="text" value={city} onChange={e => setCity(e.target.value)} style={inputStyle()} />)}
        </div>
        {field('رمز الإعلان (يظهر في واتساب)', <input type="text" value={code} onChange={e => setCode(e.target.value)} style={inputStyle()} />)}
        {field('الوصف', <textarea value={description} onChange={e => setDescription(e.target.value)} style={inputStyle(true)} />)}
        {field('مصدر الهاتف (اختياري)', <input type="text" value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} placeholder="مثال: أحمد، وهران، المتجر..." style={inputStyle()} />)}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textMuted, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>إلغاء</button>
          <button onClick={handleSave} disabled={busy} style={{
            flex: 2, padding: '8px', borderRadius: '8px', border: 'none',
            background: colors.accent, color: '#fff', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1,
          }}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </div>
    </div>
  );
});
