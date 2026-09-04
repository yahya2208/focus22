import { memo, useEffect, useRef, useState } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import {
  CAR_BODY_TYPE_VALUES,
  CAR_CONDITION_STATES,
  CAR_FUEL_VALUES,
  CAR_TRANSMISSION_VALUES,
  PROPERTY_CONDITION_STATES,
  PROPERTY_TRANSACTION_AR,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_TYPE_AR,
  PROPERTY_TYPE_VALUES,
  PRODUCE_UNIT_VALUES,
  UNIT_AR,
  isCarListing,
  isProduceListing,
} from '../../../domains/listings';
import type { ListingRecord, ProduceDetails, ProduceUnit } from '../../../domains/listings';
import { updateListingCore, updateListingDetails } from '../../../services/listing-service';
import { track } from '../../../core/telemetry';

const CAR_FUEL_AR: Record<string, string> = {
  benzin: 'بنزين', diesel: 'ديزل', hybrid: 'هايبرد', electric: 'كهرباء', lpg: 'غاز',
};
const CAR_TRANS_AR: Record<string, string> = { manual: 'عادي', automatic: 'أوتوماتيك' };
const CAR_BODY_AR: Record<string, string> = {
  sedan: 'سيدان', suv: 'دفع رباعي', hatchback: 'هاتشباك', pickup: 'بيك أب', coupe: 'كوبيه', van: 'فان',
};
const CAR_COND_AR: Record<string, string> = { new: 'جديدة', used: 'مستعملة', damaged: 'متضررة' };
const PROP_COND_AR: Record<string, string> = { new: 'جديد', good: 'جيد', needs_renovation: 'يحتاج ترميم' };

interface EditListingModalProps {
  record: ListingRecord;
  colors: ThemeColors;
  busy?: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export const EditListingModal = memo(function EditListingModal({ record, colors, busy = false, onSaved, onClose }: EditListingModalProps) {
  const isCar = isCarListing(record);
  const isProduce = isProduceListing(record);
  const pd = record.propertyDetails;
  const car = record.car;
  const produce = record.produce;

  const [brand, setBrand] = useState(record.brand);
  const [model, setModel] = useState(record.model);
  const [price, setPrice] = useState(record.price.amount != null ? String(record.price.amount) : '');
  const [pricePeriod, setPricePeriod] = useState(record.price.period);
  const [city, setCity] = useState(record.city);
  const [description, setDescription] = useState(record.description);

  // Produce patches (merge contract: empty stays unchanged).
  const [unit, setUnit] = useState('');
  const [origin, setOrigin] = useState('');
  const [grade, setGrade] = useState('');

  // Details patches start EMPTY — omitted keys keep stored values (merge contract).
  const [trim, setTrim] = useState('');
  const [year, setYear] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [fuel, setFuel] = useState('');
  const [transmission, setTransmission] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [engineCc, setEngineCc] = useState('');
  const [carCondition, setCarCondition] = useState('');

  const [propertyType, setPropertyType] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [district, setDistrict] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [floor, setFloor] = useState('');
  const [furnished, setFurnished] = useState('');
  const [propCondition, setPropCondition] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The modal is opened by its parent via conditional mount ({editingListing && …}),
  // so mounting == starting an edit session. Report `listing_edit_start` exactly once
  // per open; the ref guards against the dev-mode double-mount.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void track({ event: 'listing_edit_start', entityType: 'listing', properties: {} });
  }, []);

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

  const numOrNull = (v: string): number | null | undefined => {
    if (v.trim() === '') return undefined; // omitted → keep current
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = async () => {
    setError('');
    if ((isCar && brand.trim() === '') || model.trim() === '') {
      setError(isCar ? 'الماركة والموديل مطلوبان.' : 'عنوان العقار مطلوب.');
      return;
    }
    if (record.category === 'property' && transactionType !== '') {
      const expected = transactionType === 'rent' ? 'monthly' : 'sale';
      if (pricePeriod !== expected) {
        setError('الإيجار يقترن بـ"شهري" والبيع بـ"بيع".');
        return;
      }
    }
    setSaving(true);
    try {
      await updateListingCore(record.id, {
        brand: brand.trim(),
        model: model.trim(),
        priceAmount: price.trim() !== '' ? Number(price) : null,
        pricePeriod,
        city: city.trim(),
        description: description.trim(),
      });

      if (isCar) {
        const details: Record<string, unknown> = {};
        if (trim.trim() !== '') details.trim = trim.trim();
        const y = numOrNull(year);
        if (y !== undefined) details.year = y;
        const m = numOrNull(mileageKm);
        if (m !== undefined) details.mileageKm = m;
        if (fuel !== '') details.fuel = fuel;
        if (transmission !== '') details.transmission = transmission;
        if (bodyType !== '') details.bodyType = bodyType;
        const cc = numOrNull(engineCc);
        if (cc !== undefined) details.engineCc = cc;
        if (carCondition !== '') details.conditionState = carCondition;
        if (Object.keys(details).length > 0) await updateListingDetails(record.id, details);
      } else if (pd) {
        const details: Record<string, unknown> = {};
        if (propertyType !== '') details.propertyType = propertyType;
        if (transactionType !== '') details.transactionType = transactionType;
        if (district.trim() !== '') details.district = district.trim();
        const a = numOrNull(areaM2);
        if (a !== undefined) details.areaM2 = a;
        const b = numOrNull(bedrooms);
        if (b !== undefined) details.bedrooms = b;
        const ba = numOrNull(bathrooms);
        if (ba !== undefined) details.bathrooms = ba;
        const f = numOrNull(floor);
        if (f !== undefined) details.floor = f;
        if (furnished === 'yes' || furnished === 'no') details.furnished = furnished === 'yes';
        if (propCondition !== '') details.conditionState = propCondition;
        if (Object.keys(details).length > 0) await updateListingDetails(record.id, details);
      } else if (isProduce) {
        const details: Record<string, unknown> = {};
        if (unit !== '') details.unit = unit as ProduceUnit;
        if (origin.trim() !== '') details.origin = origin.trim();
        if (grade !== '') details.grade = grade;
        if (typeof details.unit === 'string') {
          await updateListingCore(record.id, { unit: details.unit as ProduceUnit });
        }
        const producePatch: Partial<ProduceDetails> = {};
        if (typeof details.origin === 'string') producePatch.origin = details.origin;
        if (typeof details.grade === 'string') producePatch.grade = details.grade;
        if (Object.keys(producePatch).length > 0) await updateListingDetails(record.id, producePatch);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '20px', width: '360px', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 4px' }}>
          تعديل {isCar ? 'السيارة' : isProduce ? 'المنتج' : 'العقار'} — {record.model}
        </h3>
        <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginBottom: '12px' }}>
          الحقول المعبأة فقط تُحدَّث؛ الفراغات تبقى كما هي.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {field(isCar ? 'الماركة' : isProduce ? 'المنشأ' : 'المطوّر', <input value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle()} />)}
          {field(isCar ? 'الموديل' : isProduce ? 'اسم المنتج' : 'العنوان', <input value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle()} />)}
          {field('السعر (د.ج)', <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle()} />)}
          {field(
            'فترة السعر',
            <select
              value={pricePeriod}
              onChange={(e) => setPricePeriod(e.target.value as 'sale' | 'monthly')}
              disabled={record.category === 'property' && transactionType !== ''}
              style={inputStyle()}
            >
              <option value="sale">بيع</option>
              <option value="monthly">شهري</option>
            </select>,
          )}
          {field('المدينة', <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle()} />)}
          {isCar ? (
            <>
              {field('طراز جديد', <input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder={car?.trim || ''} style={inputStyle()} />)}
              {field('سنة جديدة', <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder={car?.year != null ? String(car.year) : ''} style={inputStyle()} />)}
              {field('ممشى جديد (كم)', <input type="number" value={mileageKm} onChange={(e) => setMileageKm(e.target.value)} placeholder={car?.mileageKm != null ? String(car.mileageKm) : ''} style={inputStyle()} />)}
              {field('وقود', (
                <select value={fuel} onChange={(e) => setFuel(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {CAR_FUEL_VALUES.map((v) => <option key={v} value={v}>{CAR_FUEL_AR[v]}</option>)}
                </select>
              ))}
              {field('ناقل الحركة', (
                <select value={transmission} onChange={(e) => setTransmission(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {CAR_TRANSMISSION_VALUES.map((v) => <option key={v} value={v}>{CAR_TRANS_AR[v]}</option>)}
                </select>
              ))}
              {field('الهيكل', (
                <select value={bodyType} onChange={(e) => setBodyType(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {CAR_BODY_TYPE_VALUES.map((v) => <option key={v} value={v}>{CAR_BODY_AR[v]}</option>)}
                </select>
              ))}
              {field('سعة المحرك', <input type="number" value={engineCc} onChange={(e) => setEngineCc(e.target.value)} placeholder={car?.engineCc != null ? String(car.engineCc) : ''} style={inputStyle()} />)}
              {field('الحالة', (
                <select value={carCondition} onChange={(e) => setCarCondition(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {CAR_CONDITION_STATES.map((v) => <option key={v} value={v}>{CAR_COND_AR[v]}</option>)}
                </select>
              ))}
            </>
          ) : isProduce ? (
            <>
              {field('الوحدة', (
                <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {PRODUCE_UNIT_VALUES.map((v) => <option key={v} value={v}>{UNIT_AR[v]}</option>)}
                </select>
              ))}
              {field('المنشأ الجديد', <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={produce?.origin || ''} style={inputStyle()} />)}
              {field('الجودة الجديدة', <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder={produce?.grade || ''} style={inputStyle()} />)}
            </>
          ) : (
            <>
              {field('نوع العقار', (
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {PROPERTY_TYPE_VALUES.map((v) => <option key={v} value={v}>{PROPERTY_TYPE_AR[v]}</option>)}
                </select>
              ))}
              {field('نوع المعاملة', (
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  style={inputStyle()}
                >
                  <option value="">(إبقاء)</option>
                  {PROPERTY_TRANSACTION_TYPES.map((v) => <option key={v} value={v}>{PROPERTY_TRANSACTION_AR[v]}</option>)}
                </select>
              ))}
              {field('حي جديد', <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={pd?.district || ''} style={inputStyle()} />)}
              {field('مساحة (م²)', <input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} placeholder={pd?.areaM2 != null ? String(pd.areaM2) : ''} style={inputStyle()} />)}
              {field('غرف', <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder={pd?.bedrooms != null ? String(pd.bedrooms) : ''} style={inputStyle()} />)}
              {field('حمامات', <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} placeholder={pd?.bathrooms != null ? String(pd.bathrooms) : ''} style={inputStyle()} />)}
              {field('طابق', <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={pd?.floor != null ? String(pd.floor) : ''} style={inputStyle()} />)}
              {field('الأثاث', (
                <select value={furnished} onChange={(e) => setFurnished(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  <option value="yes">مفروشة</option>
                  <option value="no">غير مفروشة</option>
                </select>
              ))}
              {field('الحالة', (
                <select value={propCondition} onChange={(e) => setPropCondition(e.target.value)} style={inputStyle()}>
                  <option value="">(إبقاء)</option>
                  {PROPERTY_CONDITION_STATES.map((v) => <option key={v} value={v}>{PROP_COND_AR[v]}</option>)}
                </select>
              ))}
            </>
          )}
        </div>
        {field('وصف جديد', <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle(), minHeight: '56px', resize: 'vertical', marginTop: '10px' }} />)}
        {error !== '' && (
          <div style={{ color: colors.danger, fontSize: '0.75rem', margin: '8px 0' }}>⚠ {error}</div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textMuted, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>إلغاء</button>
          <button onClick={handleSave} disabled={busy || saving} style={{
            flex: 2, padding: '8px', borderRadius: '8px', border: 'none',
            background: colors.accent, color: '#fff', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </div>
    </div>
  );
});
