import { memo, useEffect, useState } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import { createListing, createListingForCategory } from '../../../services/listing-service';
import { InventoryService } from '../../../services/inventory-service';
import { PhoneImageUploader } from '../../showroom/PhoneImageUploader';
import { track } from '../../../core/telemetry';
import {
  CAR_BODY_TYPE_VALUES,
  CAR_CONDITION_STATES,
  CAR_FUEL_VALUES,
  CAR_TRANSMISSION_VALUES,
} from '../../../domains/listings';

const FUEL_AR: Record<string, string> = {
  benzin: 'بنزين', diesel: 'ديزل', hybrid: 'هايبرد', electric: 'كهرباء', lpg: 'غاز',
};
const TRANSMISSION_AR: Record<string, string> = { manual: 'عادي', automatic: 'أوتوماتيك' };
const BODY_TYPE_AR: Record<string, string> = {
  sedan: 'سيدان', suv: 'دفع رباعي', hatchback: 'هاتشباك', pickup: 'بيك أب', coupe: 'كوبيه', van: 'فان',
};
const CONDITION_STATE_AR: Record<string, string> = { new: 'جديدة', used: 'مستعملة', damaged: 'متضررة' };

interface CarListingFormProps {
  colors: ThemeColors;
  busy?: boolean;
  /** When set, creation is ATOMIC (product + category membership) via 00056. */
  categoryId?: string;
  onDone: (id: string) => void;
}

export const CarListingForm = memo(function CarListingForm({ colors, busy = false, categoryId, onDone }: CarListingFormProps) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [year, setYear] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [fuel, setFuel] = useState('');
  const [transmission, setTransmission] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [engineCc, setEngineCc] = useState('');
  const [conditionState, setConditionState] = useState('used');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Telemetry (Phase 8D): the create form became active → a create was started.
  useEffect(() => {
    void track({ event: 'listing_create_start', entityType: 'listing', properties: { step: 'form' } });
  }, []);

  const inputStyle = (): React.CSSProperties => ({
    width: '100%', padding: '9px', borderRadius: '8px',
    border: `1px solid ${colors.border}`, background: colors.bgInput,
    color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box',
  });
  const selectStyle = inputStyle;

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block' }}>
      <span style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>{label}</span>
      {node}
    </label>
  );

  const handleSubmit = async () => {
    setError('');
    if (brand.trim() === '' || model.trim() === '') {
      setError('الماركة والموديل مطلوبان.');
      return;
    }
    if (publish && (price.trim() === '' || city.trim() === '')) {
      setError('النشر يتطلب سعراً ومدينة.');
      return;
    }
    // Telemetry (Phase 8D): a real submit once validation passed.
    void track({ event: 'listing_create_submit', entityType: 'listing', properties: {} });
    setSaving(true);
    try {
      const listing: Parameters<typeof createListing>[0] = {
        category: 'car',
        brand: brand.trim(),
        model: model.trim(),
        price: { amount: price.trim() !== '' ? Number(price) : null, period: 'sale' },
        color: color.trim() || undefined,
        city: city.trim() || undefined,
        description: description.trim() || undefined,
        publish,
        car: {
          trim: trim.trim(),
          year: year.trim() !== '' ? Number(year) : null,
          mileageKm: mileageKm.trim() !== '' ? Number(mileageKm) : null,
          fuel: (fuel || null) as never,
          transmission: (transmission || null) as never,
          bodyType: (bodyType || null) as never,
          engineCc: engineCc.trim() !== '' ? Number(engineCc) : null,
          conditionState: conditionState as never,
        },
      };
      let id: string;
      if (categoryId) {
        id = await createListingForCategory(categoryId, listing);
      } else {
        id = await createListing(listing);
      }
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
      <h3 style={{ color: colors.text, fontSize: '0.95rem', margin: '0 0 12px' }}>🚗 إضافة سيارة</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        {field('الماركة (Make) *', <input value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle()} />)}
        {field('الموديل *', <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle()} />)}
        {field('الطراز (Trim)', <input value={trim} onChange={(e) => setTrim(e.target.value)} style={inputStyle()} />)}
        {field('السنة', <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle()} />)}
        {field('الممشى (كم)', <input type="number" value={mileageKm} onChange={(e) => setMileageKm(e.target.value)} style={inputStyle()} />)}
        {field('سعة المحرك (cc)', <input type="number" value={engineCc} onChange={(e) => setEngineCc(e.target.value)} style={inputStyle()} />)}
        {field(
          'الوقود',
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} style={selectStyle()}>
            <option value="">—</option>
            {CAR_FUEL_VALUES.map((v) => <option key={v} value={v}>{FUEL_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'ناقل الحركة',
          <select value={transmission} onChange={(e) => setTransmission(e.target.value)} style={selectStyle()}>
            <option value="">—</option>
            {CAR_TRANSMISSION_VALUES.map((v) => <option key={v} value={v}>{TRANSMISSION_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'الهيكل',
          <select value={bodyType} onChange={(e) => setBodyType(e.target.value)} style={selectStyle()}>
            <option value="">—</option>
            {CAR_BODY_TYPE_VALUES.map((v) => <option key={v} value={v}>{BODY_TYPE_AR[v]}</option>)}
          </select>,
        )}
        {field(
          'الحالة',
          <select value={conditionState} onChange={(e) => setConditionState(e.target.value)} style={selectStyle()}>
            {CAR_CONDITION_STATES.map((v) => <option key={v} value={v}>{CONDITION_STATE_AR[v]}</option>)}
          </select>,
        )}
        {field('سعر البيع (د.ج)', <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle()} />)}
        {field('المدينة', <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle()} />)}
        {field('اللون', <input value={color} onChange={(e) => setColor(e.target.value)} style={inputStyle()} />)}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <PhoneImageUploader images={images} onImagesChange={setImages} />
      </div>
      {field('الوصف', <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle(), minHeight: '64px', resize: 'vertical' }} />)}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '10px 0', color: colors.textMuted, fontSize: '0.78rem' }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        نشر فوراً (يتطلب سنة/ممشى/وقود/ناقل حركة كاملة)
      </label>
      {error !== '' && (
        <div style={{ color: colors.danger, fontSize: '0.75rem', margin: '8px 0' }}>⚠ {error}</div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleSubmit} disabled={busy || saving} style={{
          flex: 2, padding: '9px', borderRadius: '8px', border: 'none',
          background: colors.accent, color: '#fff', fontSize: '0.85rem',
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'جارٍ الحفظ…' : 'حفظ السيارة'}</button>
      </div>
    </div>
  );
});
