import { memo, useState } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import { createListing, createListingForCategory } from '../../../services/listing-service';
import { InventoryService } from '../../../services/inventory-service';
import { PhoneImageUploader } from '../../showroom/PhoneImageUploader';
import { PRODUCE_UNIT_VALUES, UNIT_AR } from '../../../domains/listings';

const GRADE_OPTIONS = ['', 'A', 'B', 'C', 'organic'];

interface ProduceListingFormProps {
  colors: ThemeColors;
  busy?: boolean;
  /** When set, creation is ATOMIC (product + category membership) via 00056. */
  categoryId?: string;
  onDone: (id: string) => void;
}

export const ProduceListingForm = memo(function ProduceListingForm({ colors, busy = false, categoryId, onDone }: ProduceListingFormProps) {
  const [model, setModel] = useState('');
  const [origin, setOrigin] = useState('');
  const [grade, setGrade] = useState('');
  const [unit, setUnit] = useState<string>('kg');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const inputStyle = (): React.CSSProperties => ({
    width: '100%', padding: '9px', borderRadius: '8px',
    border: `1px solid ${colors.border}`, background: colors.bgInput,
    color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box',
  });

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block' }}>
      <span style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>{label}</span>
      {node}
    </label>
  );

  const handleSubmit = async () => {
    setError('');
    if (model.trim() === '') {
      setError('اسم المنتج مطلوب.');
      return;
    }
    const qty = quantity.trim() === '' ? 1 : Number(quantity);
    if (Number.isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
      setError('الكمية يجب أن تكون عدداً صحيحاً موجباً (وحدات كاملة).');
      return;
    }
    if (publish && (price.trim() === '' || city.trim() === '')) {
      setError('النشر يتطلب سعراً ومدينة.');
      return;
    }
    setSaving(true);
    try {
      const listing: Parameters<typeof createListing>[0] = {
        category: 'produce',
        brand: origin.trim(),
        model: model.trim(),
        price: { amount: price.trim() !== '' ? Number(price) : null, period: 'sale' },
        unit: unit as never,
        quantity: qty,
        city: city.trim() || undefined,
        description: description.trim() || undefined,
        publish,
        produce: {
          origin: origin.trim(),
          grade: grade,
        },
      };
      const id = categoryId
        ? await createListingForCategory(categoryId, listing)
        : await createListing(listing);
      // Images ride the EXISTING id-keyed generic image RPCs — no new path.
      if (images.length > 0) await InventoryService.updateImages(id, images);
      onDone(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '16px',
    }}>
      <h3 style={{ color: colors.text, fontSize: '0.95rem', margin: '0 0 12px' }}>🥦 إضافة منتج (خضر/فواكه/…)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        {field('اسم المنتج *', <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle()} />)}
        {field('المنشأ (Origin)', <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={inputStyle()} />)}
        {field(
          'الوحدة',
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle()}>
            {PRODUCE_UNIT_VALUES.map((v) => <option key={v} value={v}>{UNIT_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'الجودة (Grade)',
          <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle()}>
            {GRADE_OPTIONS.map((v) => <option key={v} value={v}>{v === '' ? '—' : v === 'organic' ? 'عضويات' : v}</option>)}
          </select>,
        )}
        {field(`السعر لكل ${UNIT_AR[unit as keyof typeof UNIT_AR] ?? 'وحدة'} (د.ج)`, <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle()} />)}
        {field('الكمية بالمخزون (وحدات كاملة)', <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle()} />)}
        {field('المدينة', <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle()} />)}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <PhoneImageUploader images={images} onImagesChange={setImages} />
      </div>
      {field('الوصف', <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle(), minHeight: '64px', resize: 'vertical' }} />)}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '10px 0', color: colors.textMuted, fontSize: '0.78rem' }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        نشر فوراً
      </label>
      {error !== '' && (
        <div style={{ color: colors.danger, fontSize: '0.75rem', margin: '8px 0' }}>⚠ {error}</div>
      )}
      <button onClick={handleSubmit} disabled={busy || saving} style={{
        width: '100%', padding: '9px', borderRadius: '8px', border: 'none',
        background: colors.accent, color: '#fff', fontSize: '0.85rem',
        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
      }}>{saving ? 'جارٍ الحفظ…' : 'حفظ المنتج'}</button>
    </div>
  );
});
