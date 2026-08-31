import { memo, useState } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import { createListing, createListingForCategory } from '../../../services/listing-service';
import { InventoryService } from '../../../services/inventory-service';
import { PhoneImageUploader } from '../../showroom/PhoneImageUploader';
import {
  PROPERTY_CONDITION_STATES,
  PROPERTY_TRANSACTION_AR,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_TYPE_AR,
  PROPERTY_TYPE_VALUES,
} from '../../../domains/listings';

const CONDITION_STATE_AR: Record<string, string> = {
  new: 'جديد', good: 'جيد', needs_renovation: 'يحتاج ترميم',
};

interface PropertyListingFormProps {
  colors: ThemeColors;
  busy?: boolean;
  /** When set, creation is ATOMIC (product + category membership) via 00056. */
  categoryId?: string;
  onDone: (id: string) => void;
}

export const PropertyListingForm = memo(function PropertyListingForm({ colors, busy = false, categoryId, onDone }: PropertyListingFormProps) {
  const [title, setTitle] = useState('');
  const [developer, setDeveloper] = useState('');
  const [propertyType, setPropertyType] = useState('apartment');
  // transaction_type and price_period are SEPARATE fields with a fixed
  // server-enforced pairing (rent↔monthly, sale↔sale) — never conflated.
  const [transactionType, setTransactionType] = useState('sale');
  const [pricePeriod, setPricePeriod] = useState('sale');
  const [price, setPrice] = useState('');
  const [district, setDistrict] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [floor, setFloor] = useState('');
  const [furnished, setFurnished] = useState('');
  const [conditionState, setConditionState] = useState('good');
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

  const handleTransactionChange = (next: string) => {
    setTransactionType(next);
    setPricePeriod(next === 'rent' ? 'monthly' : 'sale');
  };

  const handleSubmit = async () => {
    setError('');
    if (title.trim() === '') {
      setError('عنوان العقار مطلوب.');
      return;
    }
    if ((transactionType === 'rent') !== (pricePeriod === 'monthly')) {
      setError('الإيجار يقترن بـ"شهري" والبيع بـ"بيع" — تعارض في الفترة.');
      return;
    }
    if (publish && (price.trim() === '' || city.trim() === '')) {
      setError('النشر يتطلب سعراً ومدينة.');
      return;
    }
    setSaving(true);
    try {
      const listing: Parameters<typeof createListing>[0] = {
        category: 'property',
        brand: developer.trim(),
        model: title.trim(),
        price: { amount: price.trim() !== '' ? Number(price) : null, period: pricePeriod as 'sale' | 'monthly' },
        city: city.trim() || undefined,
        description: description.trim() || undefined,
        publish,
        propertyDetails: {
          propertyType: propertyType as never,
          transactionType: transactionType as never,
          district: district.trim(),
          areaM2: areaM2.trim() !== '' ? Number(areaM2) : null,
          bedrooms: bedrooms.trim() !== '' ? Number(bedrooms) : null,
          bathrooms: bathrooms.trim() !== '' ? Number(bathrooms) : null,
          floor: floor.trim() !== '' ? Number(floor) : null,
          furnished: furnished === '' ? null : furnished === 'yes',
          conditionState: conditionState as never,
        },
      };
      let id: string;
      if (categoryId) {
        id = await createListingForCategory(categoryId, listing);
      } else {
        id = await createListing(listing);
      }
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
      <h3 style={{ color: colors.text, fontSize: '0.95rem', margin: '0 0 12px' }}>🏠 إضافة عقار</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        {field('العنوان *', <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle()} />)}
        {field('المطوّر / الجهة (اختياري)', <input value={developer} onChange={(e) => setDeveloper(e.target.value)} style={inputStyle()} />)}
        {field(
          'نوع العقار',
          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={inputStyle()}>
            {PROPERTY_TYPE_VALUES.map((v) => <option key={v} value={v}>{PROPERTY_TYPE_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'نوع المعاملة',
          <select value={transactionType} onChange={(e) => handleTransactionChange(e.target.value)} style={inputStyle()}>
            {PROPERTY_TRANSACTION_TYPES.map((v) => <option key={v} value={v}>{PROPERTY_TRANSACTION_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'فترة السعر',
          <select
            value={pricePeriod}
            onChange={(e) => setPricePeriod(e.target.value)}
            disabled={transactionType === 'rent'}
            style={{ ...inputStyle(), opacity: transactionType === 'rent' ? 0.7 : 1 }}
          >
            <option value="sale">بيع (دفعة واحدة)</option>
            <option value="monthly">شهري</option>
          </select>,
        )}
        {field(transactionType === 'rent' ? 'السعر الشهري (د.ج)' : 'سعر البيع (د.ج)', <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle()} />)}
        {field('الحي', <input value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle()} />)}
        {field('المساحة (م²)', <input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} style={inputStyle()} />)}
        {field('الغرف', <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} style={inputStyle()} />)}
        {field('الحمامات', <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} style={inputStyle()} />)}
        {field('الطابق', <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} style={inputStyle()} />)}
        {field(
          'الأثاث',
          <select value={furnished} onChange={(e) => setFurnished(e.target.value)} style={inputStyle()}>
            <option value="">—</option>
            <option value="yes">مفروشة</option>
            <option value="no">غير مفروشة</option>
          </select>,
        )}
        {field(
          'الحالة',
          <select value={conditionState} onChange={(e) => setConditionState(e.target.value)} style={inputStyle()}>
            {PROPERTY_CONDITION_STATES.map((v) => <option key={v} value={v}>{CONDITION_STATE_AR[v]}</option>)}
          </select>,
        )}
        {field('المدينة', <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle()} />)}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <PhoneImageUploader images={images} onImagesChange={setImages} />
      </div>
      {field('الوصف', <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle(), minHeight: '64px', resize: 'vertical' }} />)}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '10px 0', color: colors.textMuted, fontSize: '0.78rem' }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        نشر فوراً (يتطلب مساحة + غرف ما لم تكن أرضاً)
      </label>
      {error !== '' && (
        <div style={{ color: colors.danger, fontSize: '0.75rem', margin: '8px 0' }}>⚠ {error}</div>
      )}
      <button onClick={handleSubmit} disabled={busy || saving} style={{
        width: '100%', padding: '9px', borderRadius: '8px', border: 'none',
        background: colors.accent, color: '#fff', fontSize: '0.85rem',
        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
      }}>{saving ? 'جارٍ الحفظ…' : 'حفظ العقار'}</button>
    </div>
  );
});
