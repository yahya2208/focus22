import { memo, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { CatalogAutocomplete } from '../../components/catalog/CatalogAutocomplete';
import type { CatalogSearchResult } from '../../services/catalog-service';
import { VariantSelector } from '../../components/catalog/VariantSelector';
import type { PhoneVariant } from '../../data/phone-variants';
import { ALL_CONDITIONS, type DeviceCondition } from '../../services/price-memory';
import { InventoryService } from '../../services/inventory-service';
import type { InventoryRecord } from '../../services/inventory-service';
import { buildWhatsAppForActionMessage, buildModelNotFoundMessage } from '../../services/whatsapp-service';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';

type FlowStep = 'search' | 'variant' | 'condition' | 'action' | 'whatsapp';
type CustomerAction = 'sell' | 'buy' | 'exchange';

export interface CustomerPhoneFlowProps {
  onBack?: () => void;
}

export const CustomerPhoneFlow = memo(function CustomerPhoneFlow({ onBack }: CustomerPhoneFlowProps) {
  const colors = useThemeColors();
  const whatsapp = useWhatsApp();

  const [step, setStep] = useState<FlowStep>('search');
  const [selectedResult, setSelectedResult] = useState<CatalogSearchResult | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<PhoneVariant | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<DeviceCondition>('New');
  const [action, setAction] = useState<CustomerAction | null>(null);
  const [targetDevice, setTargetDevice] = useState<InventoryRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const invRecords = InventoryService.getExchangeableDevices();
  const inventory: InventoryRecord[] = (action === 'buy' || !searchQuery.trim())
    ? invRecords
    : invRecords.filter(r =>
        r.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.variant.includes(searchQuery.toLowerCase())
      );

  const handleSendWhatsApp = () => {
    if (!selectedResult || !selectedVariant || !action) return;
    const message = buildWhatsAppForActionMessage(action, {
      brand: selectedResult.brand,
      model: selectedResult.model,
      variant: selectedVariant.label,
      condition: selectedCondition,
      targetDevice: action !== 'sell' && targetDevice ? { brand: targetDevice.brand, model: targetDevice.model, variant: targetDevice.variant } : undefined,
    });
    whatsapp.send(message);
  };

  const handleSearchSelect = (result: CatalogSearchResult) => {
    setSelectedResult(result);
    setStep('variant');
  };

  const handleVariantSelect = (variant: PhoneVariant) => {
    setSelectedVariant(variant);
    setStep('condition');
  };

  const handleConditionSelect = (cond: DeviceCondition) => {
    setSelectedCondition(cond);
    setStep('action');
  };

  const handleActionSelect = (chosen: CustomerAction) => {
    setAction(chosen);
    setTargetDevice(null);
    setSearchQuery('');
    setStep('whatsapp');
  };

  const handleTargetSelect = (device: InventoryRecord) => {
    setTargetDevice(device);
  };

  const handleReset = () => {
    setStep('search');
    setSelectedResult(null);
    setSelectedVariant(null);
    setAction(null);
    setTargetDevice(null);
    setSearchQuery('');
  };

  const handleBack = () => {
    if (step === 'search') {
      onBack?.();
      return;
    }
    if (step === 'variant') {
      setSelectedResult(null);
      setStep('search');
      return;
    }
    if (step === 'condition') {
      setSelectedVariant(null);
      setStep('variant');
      return;
    }
    if (step === 'action') {
      setSelectedCondition('New');
      setStep('condition');
      return;
    }
    if (step === 'whatsapp') {
      if (targetDevice && action !== 'sell') {
        setTargetDevice(null);
        return;
      }
      setAction(null);
      setTargetDevice(null);
      setSearchQuery('');
      setStep('action');
    }
  };

  const baseStyle: React.CSSProperties = {
    padding: '1.5rem 1.25rem',
    maxWidth: '480px',
    margin: '0 auto',
    direction: 'rtl',
  };

  const backBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0.5rem 0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  };

  const renderBack = () => (
    <button onClick={handleBack} style={backBtnStyle}>→ رجوع</button>
  );

  const actionCardStyle = (): React.CSSProperties => ({
    width: '100%',
    padding: '1.25rem',
    borderRadius: '20px',
    border: `1px solid ${colors.glassBorder}`,
    background: colors.glass,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'right',
    transition: 'all 0.15s ease',
    color: colors.text,
    fontSize: '1.1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  const stepHeader = (title: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '12px',
        background: `${colors.accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', flexShrink: 0,
      }}>
        {step === 'search' ? '1' : step === 'variant' ? '2' : step === 'condition' ? '3' : step === 'action' ? '4' : '5'}
      </div>
      <div>
        <h2 style={{ color: colors.text, fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
          {title}
        </h2>
        <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: '0.15rem 0 0' }}>
          {step === 'search' ? 'ابحث عن هاتفك للبدء' :
           step === 'variant' ? 'اختر المواصفات المناسبة' :
           step === 'condition' ? 'اختر حالة الجهاز' :
           step === 'action' ? 'ماذا تريد أن تفعل؟' :
           'راجع رسالتك وأرسلها'}
        </p>
      </div>
    </div>
  );

  const renderSearch = () => (
    <div style={baseStyle}>
      <button onClick={handleBack} style={backBtnStyle}>→ رجوع</button>
      {stepHeader('اختر هاتفك')}
      <div style={{
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: '20px',
        padding: '1.5rem',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <CatalogAutocomplete
          onSelect={handleSearchSelect}
          placeholder="ابحث عن هاتف..."
          autoFocus
          label="اسم الموديل أو العلامة"
          onModelNotFound={(brand, model) => whatsapp.send(buildModelNotFoundMessage(brand, model))}
        />
      </div>
    </div>
  );

  const renderVariant = () => {
    if (!selectedResult) return null;
    return (
      <div style={baseStyle}>
        {renderBack()}
        {stepHeader(`${selectedResult.brand} ${selectedResult.model}`)}
        <div style={{
          background: colors.glass,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: '20px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <p style={{
            color: colors.textSecondary, fontSize: '0.8rem',
            marginBottom: '0.75rem', fontWeight: 600,
          }}>
            اختر المساحة والتخزين
          </p>
          <VariantSelector
            modelName={selectedResult.model}
            brand={selectedResult.brand}
            onSelect={handleVariantSelect}
          />
        </div>
      </div>
    );
  };

  const renderCondition = () => {
    if (!selectedResult || !selectedVariant) return null;
    return (
      <div style={baseStyle}>
        {renderBack()}
        {stepHeader('حالة الجهاز')}
        <div style={{
          background: colors.glass,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: '20px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '0.75rem', fontWeight: 600 }}>
            {selectedResult.brand} {selectedResult.model} — {selectedVariant.label}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '6px' }}>
            {ALL_CONDITIONS.map(cond => (
              <button key={cond} onClick={() => handleConditionSelect(cond)} style={{
                padding: '8px 10px', borderRadius: '10px',
                border: selectedCondition === cond ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
                background: selectedCondition === cond ? colors.accent + '20' : colors.bgInput,
                color: selectedCondition === cond ? colors.accent : colors.text,
                cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
                fontWeight: selectedCondition === cond ? 700 : 400,
              }}>
                {cond}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAction = () => (
    <div style={baseStyle}>
      {renderBack()}
      {stepHeader('اختر الخدمة')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          onClick={() => handleActionSelect('sell')}
          style={actionCardStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = colors.warning + '44'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = colors.glassBorder; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <span>بيع هاتفي</span>
          <span style={{ fontSize: '1.4rem', opacity: 0.7 }}>💰</span>
        </button>
        <button
          onClick={() => handleActionSelect('exchange')}
          style={actionCardStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = colors.info + '44'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = colors.glassBorder; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <span>استبدال</span>
          <span style={{ fontSize: '1.4rem', opacity: 0.7 }}>🔄</span>
        </button>
        <button
          onClick={() => handleActionSelect('buy')}
          style={actionCardStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = colors.success + '44'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = colors.glassBorder; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <span>شراء فقط</span>
          <span style={{ fontSize: '1.4rem', opacity: 0.7 }}>🛒</span>
        </button>
      </div>
    </div>
  );

  const renderWhatsApp = () => {
    if (!selectedResult || !selectedVariant) return null;

    const showInventory = (action === 'exchange' || action === 'buy') && !targetDevice;
    const showPreview = action === 'sell' || targetDevice;

    return (
      <div style={baseStyle}>
        {renderBack()}
        {stepHeader(
          action === 'sell' ? 'بيع هاتفي' :
          action === 'exchange' ? 'استبدال' :
          'شراء فقط'
        )}

        {action === 'exchange' && <AdContactBanner placement="exchange" />}

        {showInventory && (
          <div>
            {action === 'exchange' && (
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث في المخزون..."
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: '10px',
                  border: `1px solid ${colors.border}`,
                  background: colors.bgInput, color: colors.text,
                  fontSize: '0.85rem', fontFamily: 'inherit',
                  boxSizing: 'border-box', marginBottom: '1rem',
                }}
              />
            )}
            {inventory.length === 0 ? (
              <div style={{
                textAlign: 'center', color: colors.textMuted,
                padding: '2rem 0', fontSize: '0.85rem',
              }}>
                لا توجد أجهزة متوفرة حالياً
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem', maxHeight: '400px', overflowY: 'auto',
              }}>
                {(inventory as InventoryRecord[]).map((item: InventoryRecord, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleTargetSelect(item)}
                    style={{
                      padding: '0.75rem', borderRadius: '14px',
                      border: `1px solid ${colors.glassBorder}`,
                      background: colors.glass,
                      cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'right',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ color: colors.accent, fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.15rem' }}>
                      {item.brand}
                    </div>
                    <div style={{ color: colors.text, fontWeight: 600, fontSize: '0.75rem' }}>
                      {item.model}
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: '0.65rem', marginTop: '0.1rem' }}>
                      {item.variant}
                    </div>
                    {item.sellPrice && (
                      <div style={{ color: colors.success, fontWeight: 700, fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {item.sellPrice.toLocaleString()} د.ج
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showPreview && (
          <div>
            <button
              onClick={handleSendWhatsApp}
              style={{
                width: '100%', padding: '1rem', borderRadius: '14px',
                border: 'none', background: colors.success,
                color: '#000', fontSize: '1rem', fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.5rem',
              }}
            >
              إرسال عبر واتساب
            </button>
            <button
              onClick={handleReset}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: '14px',
                border: `1px solid ${colors.borderLight}`,
                background: 'transparent', color: colors.textMuted,
                fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                marginTop: '0.5rem',
              }}
            >
              طلب جديد
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ direction: 'rtl' }}>
      {step === 'search' && renderSearch()}
      {step === 'variant' && renderVariant()}
      {step === 'condition' && renderCondition()}
      {step === 'action' && renderAction()}
      {step === 'whatsapp' && renderWhatsApp()}
    </div>
  );
});
