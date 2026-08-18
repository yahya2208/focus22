import { memo, useState } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import { CatalogAutocomplete } from '../catalog/CatalogAutocomplete';
import { VariantSelector } from '../catalog/VariantSelector';
import { getDisplayVariants, isAppleBrand, type StorageOnlyVariant } from '../../data/phone-variants';
import { InventoryService } from '../../services/inventory-service';
import { ALL_CONDITIONS, type DeviceCondition } from '../../services/price-memory';
import type { CatalogSearchResult, PhoneVariant } from '../../services/catalog-service';
import { PhoneImageUploader } from '../showroom/PhoneImageUploader';

interface AddInventoryModalProps {
  colors: ThemeColors;
  onDone: () => void;
}

export const AddInventoryModal = memo(function AddInventoryModal({ colors, onDone }: AddInventoryModalProps) {
  const [step, setStep] = useState<'brand' | 'variant' | 'condition' | 'quantity'>('brand');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<PhoneVariant | StorageOnlyVariant | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<DeviceCondition>('New');
  const [quantity, setQuantity] = useState(1);
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('');
  const [batteryError, setBatteryError] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleModelSelect = (result: CatalogSearchResult) => {
    setSelectedBrand(result.brand);
    setSelectedModel(result.model);
    setStep('variant');
  };

  const handleVariantSelect = (v: PhoneVariant | StorageOnlyVariant) => {
    setSelectedVariant(v);
    setStep('condition');
  };

  const handleSkipVariant = () => {
    setSelectedVariant(null);
    setStep('condition');
  };

  const handleConditionSelect = (cond: DeviceCondition) => {
    setSelectedCondition(cond);
    setStep('quantity');
  };

  const handleSave = async () => {
    if (!selectedBrand || !selectedModel || saving) return;

    // Battery Health is Apple-only, optional, and validated client-side to 0..100
    // (the DB CHECK would reject anything outside that range).
    const batteryValue = batteryHealth === '' ? undefined : parseInt(batteryHealth, 10);
    if (batteryValue !== undefined && (Number.isNaN(batteryValue) || batteryValue < 0 || batteryValue > 100)) {
      setBatteryError('أدخل نسبة البطارية بين 0 و 100');
      return;
    }
    setBatteryError('');

    setSaving(true);
    try {
      // Apple storage-only variants are sent as their label string ('128GB') →
      // resolveVariantParams maps them to ram:null + storage:'128GB'. Real
      // PhoneVariant objects keep the object path (legacy contract).
      const variantArg: string | PhoneVariant =
        !selectedVariant ? '' : 'ram' in selectedVariant ? selectedVariant : selectedVariant.label;
      // No fabricated variant: when the user continued without one we pass ''
      // (the schema's native empty). inventory_items.variant and .storage are
      // TEXT NOT NULL DEFAULT '' → they keep ''; ram is nullable → resolveVariantParams('')
      // sends real NULL, never ''.
      const record = await InventoryService.addStock(
        selectedBrand,
        selectedModel,
        variantArg,
        quantity,
        buyPrice ? parseInt(buyPrice) || undefined : undefined,
        sellPrice ? parseInt(sellPrice) || undefined : undefined,
        'purchase',
        undefined,
        undefined,
        undefined,
        selectedCondition,
        batteryValue,
        sourceLabel.trim() || undefined,
      );
      if (record && images.length > 0) {
        await InventoryService.updateImages(record.id, images);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const hasNoVariants = selectedModel
    ? getDisplayVariants(selectedModel, selectedBrand || undefined).length === 0
    : false;

  const isApple = isAppleBrand(selectedBrand);

  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '16px',
    }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['اختيار الموديل', 'النسخة', 'الحالة', 'الكمية'].map((label, i) => {
          const steps = ['brand', 'variant', 'condition', 'quantity'] as const;
          const active = steps.indexOf(step) >= i;
          return (
            <div key={label} style={{
              flex: 1, padding: '6px', borderRadius: '6px',
              background: active ? colors.accent + '20' : colors.bgInput,
              color: active ? colors.accent : colors.textMuted,
              fontSize: '0.7rem', textAlign: 'center', fontWeight: active ? 600 : 400,
            }}>
              {i + 1}. {label}
            </div>
          );
        })}
      </div>

      {step === 'brand' && (
        <CatalogAutocomplete onSelect={handleModelSelect} placeholder="ابدأ بكتابة اسم الموديل..." autoFocus label="اختر هاتف" />
      )}

      {step === 'variant' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: 0 }}>
              {selectedBrand} {selectedModel}
            </h3>
            <button onClick={() => setStep('brand')} style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none',
              background: colors.bgInput, color: colors.textMuted, fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>تغيير</button>
          </div>
          <VariantSelector modelName={selectedModel} brand={selectedBrand || undefined} onSelect={handleVariantSelect} />
          {hasNoVariants && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button onClick={handleSkipVariant} style={{
                padding: '10px 18px', borderRadius: '10px',
                border: `1px solid ${colors.accent}66`, background: 'transparent',
                color: colors.accent, cursor: 'pointer', fontSize: '0.82rem',
                fontWeight: 600, fontFamily: 'inherit',
              }}>
                متابعة بدون تحديد إصدار
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'condition' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.78rem', fontWeight: 600 }}>اختر الحالة</span>
            <button onClick={() => setStep('variant')} style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none',
              background: colors.bgInput, color: colors.textMuted, fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>تغيير</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '6px', marginBottom: '12px' }}>
            {ALL_CONDITIONS.map(cond => (
              <button key={cond} onClick={() => handleConditionSelect(cond)} style={{
                padding: '8px 10px', borderRadius: '8px',
                border: selectedCondition === cond ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
                background: selectedCondition === cond ? colors.accentLight : colors.bgInput,
                color: selectedCondition === cond ? colors.accent : colors.text,
                cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
                fontWeight: selectedCondition === cond ? 700 : 400,
              }}>
                {cond}
              </button>
            ))}
          </div>
          <button onClick={() => setStep('variant')} style={{
            padding: '6px 12px', borderRadius: '6px',
            border: 'none', background: 'transparent', color: colors.textMuted,
            cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
          }}>← رجوع</button>
        </div>
      )}

      {step === 'quantity' && (
        <div>
          <div style={{
            padding: '12px', borderRadius: '8px',
            background: colors.accent + '10', border: `1px solid ${colors.accent}30`,
            marginBottom: '12px',
          }}>
            <div style={{ color: colors.text, fontSize: '0.9rem', fontWeight: 600 }}>
              {selectedBrand} {selectedModel}
            </div>
            <div style={{ color: colors.textMuted, fontSize: '0.78rem' }}>
              النسخة: {selectedVariant
                ? ('ram' in selectedVariant && selectedVariant.ram
                    ? `${selectedVariant.label} (${selectedVariant.ram} / ${selectedVariant.storage})`
                    : selectedVariant.label)
                : 'دون تحديد إصدار'}
            </div>
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '2px' }}>
              الحالة: {selectedCondition}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: colors.textMuted, fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>الكمية</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{
                padding: '10px 16px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '1.1rem', cursor: 'pointer',
              }}>−</button>
              <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                  background: colors.bgInput, color: colors.text, fontSize: '1.2rem', textAlign: 'center', fontFamily: 'inherit',
                }} />
              <button onClick={() => setQuantity(quantity + 1)} style={{
                padding: '10px 16px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '1.1rem', cursor: 'pointer',
              }}>+</button>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <PhoneImageUploader images={images} onImagesChange={setImages} maxImages={6} />
          </div>

          {isApple && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ color: colors.textMuted, fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                Battery Health (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={batteryHealth}
                onChange={e => { setBatteryHealth(e.target.value); setBatteryError(''); }}
                placeholder="بين 0 و 100"
                aria-label="Battery Health"
                style={{
                  width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${batteryError ? colors.danger : colors.border}`,
                  background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              {batteryError && <div style={{ color: colors.danger, fontSize: '0.7rem', marginTop: '4px' }}>{batteryError}</div>}
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: colors.textMuted, fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
              مصدر الهاتف (اختياري)
            </label>
            <input
              type="text"
              value={sourceLabel}
              onChange={e => setSourceLabel(e.target.value)}
              placeholder="مثال: أحمد، وهران، المتجر..."
              aria-label="Source Label"
              style={{
                width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div>
              <label style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>سعر الشراء (د.ج)</label>
              <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="اختياري"
                style={{
                  width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                  background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }} />
            </div>
            <div>
              <label style={{ color: colors.textMuted, fontSize: '0.72rem', display: 'block', marginBottom: '4px' }}>سعر البيع (د.ج)</label>
              <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="اختياري"
                style={{
                  width: '100%', padding: '9px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                  background: colors.bgInput, color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep('condition')} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textMuted, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>رجوع</button>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 2, padding: '10px', borderRadius: '8px', border: 'none',
              background: colors.accent, color: '#fff', fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'جارٍ الحفظ…' : `حفظ (${quantity} قطعة, ${selectedCondition})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
