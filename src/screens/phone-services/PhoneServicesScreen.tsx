import { useState, useMemo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { getBrandNames, getModelsForBrand, type PhoneModel } from '../../data/phone-database';
import type { TranslationKey } from '../../i18n';

type Flow = 'menu' | 'buy-new' | 'buy-used' | 'sell' | 'exchange';
type DeviceCondition = 'excellent' | 'good' | 'fair' | 'poor';

const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
const COLOR_OPTIONS = ['black', 'white', 'silver', 'gold', 'blue', 'green', 'red', 'purple', 'pink', 'graphite', 'titanium', 'natural'];

function StepperHeader({ step, total, title, colors }: { step: number; total: number; title: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: '3px', borderRadius: '2px',
            background: i < step ? colors.accent : colors.borderLight,
            transition: 'background 0.3s ease',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: colors.text, fontSize: '1rem', fontWeight: 700, margin: 0 }}>{title}</p>
        <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
          {step}/{total}
        </span>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange, colors, getLabel }: {
  label: string; value: string; options: readonly string[];
  onChange: (v: string) => void; colors: ReturnType<typeof useThemeColors>;
  getLabel?: (v: string) => string;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>
        {label}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '12px',
              border: `1px solid ${value === opt ? colors.accent : colors.borderLight}`,
              background: value === opt ? `${colors.accent}18` : colors.glass,
              color: value === opt ? colors.accent : colors.text,
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            {getLabel ? getLabel(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuccessView({ title, message, onReset, colors }: { title: string; message: string; onReset: () => void; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: `${colors.success}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1rem', fontSize: '1.5rem',
      }}>✓</div>
      <h2 style={{ color: colors.text, fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h2>
      <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1.5rem' }}>{message}</p>
      <Button variant="secondary" onClick={onReset} style={{ width: '100%' }}>
        New Request
      </Button>
    </div>
  );
}

function BuyNewFlow({ t, colors, brands, getModelsForBrand }: { t: (k: TranslationKey) => string; colors: ReturnType<typeof useThemeColors>; brands: readonly string[]; getModelsForBrand: (b: string) => readonly PhoneModel[] }) {
  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [color, setColor] = useState('');
  const [done, setDone] = useState(false);

  const models = useMemo(() => brand ? getModelsForBrand(brand).map((m) => m.model) : [], [brand, getModelsForBrand]);

  const canNext = (step === 1 && brand) || (step === 2 && model) || (step === 3 && storage) || (step === 4 && color);

  if (done) {
    return <SuccessView title={t('phoneServices.requestSent')} message={`${brand} ${model} ${storage} ${t('phoneServices.requestSentMessage')}`} onReset={() => { setStep(1); setBrand(''); setModel(''); setStorage(''); setColor(''); setDone(false); }} colors={colors} />;
  }

  return (
    <>
      <StepperHeader step={step} total={4} title={t('phoneServices.buyNew')} colors={colors} />
      {step === 1 && <SelectField label={t('phoneServices.brand')} value={brand} options={brands} onChange={(v) => { setBrand(v); setModel(''); }} colors={colors} />}
      {step === 2 && <SelectField label={t('phoneServices.model')} value={model} options={models} onChange={setModel} colors={colors} />}
      {step === 3 && <SelectField label={t('phoneServices.storage')} value={storage} options={STORAGE_OPTIONS} onChange={setStorage} colors={colors} />}
      {step === 4 && <SelectField label={t('phoneServices.color')} value={color} options={COLOR_OPTIONS} onChange={setColor} colors={colors} getLabel={(v) => t(`phoneServices.colors.${v}` as TranslationKey)} />}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t('phoneServices.backBtn')}</Button>}
        <Button onClick={() => step < 4 ? setStep(step + 1) : setDone(true)} disabled={!canNext} style={{ flex: 1 }}>
          {step < 4 ? t('phoneServices.next') : t('phoneServices.buyNow')}
        </Button>
      </div>
    </>
  );
}

function SellFlow({ t, colors, brands, getModelsForBrand }: { t: (k: TranslationKey) => string; colors: ReturnType<typeof useThemeColors>; brands: readonly string[]; getModelsForBrand: (b: string) => readonly PhoneModel[] }) {
  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [condition, setCondition] = useState<DeviceCondition>('good');
  const [batteryHealth, setBatteryHealth] = useState(80);
  const [done, setDone] = useState(false);

  const models = useMemo(() => brand ? getModelsForBrand(brand).map((m) => m.model) : [], [brand, getModelsForBrand]);
  const totalSteps = 5;

  const estimatedPrice = useMemo(() => {
    if (!brand || !model) return null;
    const base = 200 + Math.random() * 600;
    const conditionMult = condition === 'excellent' ? 0.9 : condition === 'good' ? 0.7 : condition === 'fair' ? 0.5 : 0.3;
    const batteryMult = batteryHealth / 100;
    return Math.round(base * conditionMult * batteryMult);
  }, [brand, model, condition, batteryHealth]);

  const canNext = (step === 1 && brand) || (step === 2 && model) || (step === 3 && storage);

  if (done) {
    return <SuccessView title={t('phoneServices.requestSent')} message={`${t('phoneServices.requestSentMessage')} ${estimatedPrice ? `Est: $${estimatedPrice}` : ''}`} onReset={() => { setStep(1); setBrand(''); setModel(''); setStorage(''); setCondition('good'); setBatteryHealth(80); setDone(false); }} colors={colors} />;
  }

  return (
    <>
      <StepperHeader step={step} total={totalSteps} title={t('phoneServices.sellPhone')} colors={colors} />
      {step === 1 && <SelectField label={t('phoneServices.brand')} value={brand} options={brands} onChange={(v) => { setBrand(v); setModel(''); }} colors={colors} />}
      {step === 2 && <SelectField label={t('phoneServices.model')} value={model} options={models} onChange={setModel} colors={colors} />}
      {step === 3 && <SelectField label={t('phoneServices.storage')} value={storage} options={STORAGE_OPTIONS} onChange={setStorage} colors={colors} />}
      {step === 4 && (
        <>
          <SelectField label={t('phoneServices.condition')} value={condition} options={['excellent', 'good', 'fair', 'poor']} onChange={(v) => setCondition(v as DeviceCondition)} colors={colors} getLabel={(v) => t(`phoneServices.condition.${v}` as TranslationKey)} />
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>
              {t('phoneServices.batteryHealth')}: {batteryHealth}%
            </label>
            <input type="range" min={10} max={100} value={batteryHealth} onChange={(e) => setBatteryHealth(Number(e.target.value))} style={{ width: '100%', accentColor: colors.accent }} />
          </div>
        </>
      )}
      {step === 5 && estimatedPrice !== null && (
        <div style={{
          background: `${colors.accent}0a`,
          border: `1px solid ${colors.accent}33`,
          borderRadius: '20px',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '1rem',
        }}>
          <p style={{ color: colors.textMuted, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            {t('phoneServices.suggestedPrice')}
          </p>
          <p style={{ color: colors.accent, fontSize: '2.5rem', fontWeight: 800, margin: 0 }}>
            ${estimatedPrice}
          </p>
          <p style={{ color: colors.textMuted, fontSize: '0.7rem', marginTop: '0.5rem' }}>
            {brand} {model} · {storage} · {t(`phoneServices.condition.${condition}`)}
          </p>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t('phoneServices.backBtn')}</Button>}
        <Button onClick={() => step < totalSteps ? setStep(step + 1) : setDone(true)} disabled={step < 5 ? !canNext : false} style={{ flex: 1 }}>
          {step < totalSteps ? t('phoneServices.next') : t('phoneServices.sellNow')}
        </Button>
      </div>
    </>
  );
}

function ExchangeFlow({ t, colors, brands, getModelsForBrand }: { t: (k: TranslationKey) => string; colors: ReturnType<typeof useThemeColors>; brands: readonly string[]; getModelsForBrand: (b: string) => readonly PhoneModel[] }) {
  const [step, setStep] = useState(1);
  const [yourBrand, setYourBrand] = useState('');
  const [yourModel, setYourModel] = useState('');
  const [yourStorage, setYourStorage] = useState('');
  const [wantBrand, setWantBrand] = useState('');
  const [wantModel, setWantModel] = useState('');
  const [wantStorage, setWantStorage] = useState('');
  const [done, setDone] = useState(false);

  const yourModels = useMemo(() => yourBrand ? getModelsForBrand(yourBrand).map((m) => m.model) : [], [yourBrand, getModelsForBrand]);
  const wantModels = useMemo(() => wantBrand ? getModelsForBrand(wantBrand).map((m) => m.model) : [], [wantBrand, getModelsForBrand]);
  const totalSteps = 6;

  const priceDiff = useMemo(() => {
    if (!wantBrand || !wantModel) return null;
    const wantPrice = 400 + Math.random() * 800;
    const yourPrice = yourBrand ? 150 + Math.random() * 500 : 0;
    return Math.round(wantPrice - yourPrice);
  }, [wantBrand, wantModel, yourBrand]);

  const canNext = (step === 1 && yourBrand) || (step === 2 && yourModel) || (step === 3 && yourStorage) || (step === 4 && wantBrand) || (step === 5 && wantModel);

  if (done) {
    return <SuccessView title={t('phoneServices.requestSent')} message={t('phoneServices.requestSentMessage')} onReset={() => { setStep(1); setYourBrand(''); setYourModel(''); setYourStorage(''); setWantBrand(''); setWantModel(''); setWantStorage(''); setDone(false); }} colors={colors} />;
  }

  return (
    <>
      <StepperHeader step={step} total={totalSteps} title={t('phoneServices.exchangePhone')} colors={colors} />

      {step <= 3 && (
        <p style={{ color: colors.accent, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          {t('phoneServices.yourPhone')}
        </p>
      )}
      {step > 3 && (
        <p style={{ color: colors.accent, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          {t('phoneServices.desiredPhone')}
        </p>
      )}

      {step === 1 && <SelectField label={t('phoneServices.brand')} value={yourBrand} options={brands} onChange={(v) => { setYourBrand(v); setYourModel(''); }} colors={colors} />}
      {step === 2 && <SelectField label={t('phoneServices.model')} value={yourModel} options={yourModels} onChange={setYourModel} colors={colors} />}
      {step === 3 && <SelectField label={t('phoneServices.storage')} value={yourStorage} options={STORAGE_OPTIONS} onChange={setYourStorage} colors={colors} />}
      {step === 4 && <SelectField label={t('phoneServices.brand')} value={wantBrand} options={brands} onChange={(v) => { setWantBrand(v); setWantModel(''); }} colors={colors} />}
      {step === 5 && <SelectField label={t('phoneServices.model')} value={wantModel} options={wantModels} onChange={setWantModel} colors={colors} />}
      {step === 6 && (
        <>
          <SelectField label={t('phoneServices.storage')} value={wantStorage} options={STORAGE_OPTIONS} onChange={setWantStorage} colors={colors} />
          {priceDiff !== null && (
            <div style={{
              background: `${colors.accent}0a`,
              border: `1px solid ${colors.accent}33`,
              borderRadius: '20px',
              padding: '1.25rem',
              textAlign: 'center',
              marginTop: '0.5rem',
            }}>
              <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
                {t('phoneServices.priceDifference')}
              </p>
              <p style={{ color: priceDiff > 0 ? colors.warning : colors.success, fontSize: '2rem', fontWeight: 800, margin: 0 }}>
                {priceDiff > 0 ? `+$${priceDiff}` : `-$${Math.abs(priceDiff)}`}
              </p>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
        {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)} style={{ flex: 1 }}>{t('phoneServices.backBtn')}</Button>}
        <Button onClick={() => step < totalSteps ? setStep(step + 1) : setDone(true)} disabled={step < totalSteps ? !canNext : false} style={{ flex: 1 }}>
          {step < totalSteps ? t('phoneServices.next') : t('phoneServices.exchangeNow')}
        </Button>
      </div>
    </>
  );
}

export function PhoneServicesScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const brands = getBrandNames();
  const [flow, setFlow] = useState<Flow>('menu');

  if (flow !== 'menu') {
    return (
      <nav aria-label="Phone Services" style={{ padding: '1.5rem 1.25rem', maxWidth: '480px', margin: '0 auto' }}>
        <button
          onClick={() => setFlow('menu')}
          style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1rem',
            fontFamily: 'inherit', padding: 0,
          }}
        >
          ← {t('phoneServices.back')}
        </button>
        {flow === 'buy-new' && <BuyNewFlow t={t} colors={colors} brands={brands} getModelsForBrand={getModelsForBrand} />}
        {flow === 'buy-used' && <BuyNewFlow t={t} colors={colors} brands={brands} getModelsForBrand={getModelsForBrand} />}
        {flow === 'sell' && <SellFlow t={t} colors={colors} brands={brands} getModelsForBrand={getModelsForBrand} />}
        {flow === 'exchange' && <ExchangeFlow t={t} colors={colors} brands={brands} getModelsForBrand={getModelsForBrand} />}
      </nav>
    );
  }

  const cards = [
    { id: 'buy-new' as Flow, emoji: '🟢', title: t('phoneServices.buyNew'), desc: t('phoneServices.buyNewDesc'), color: '#22c55e' },
    { id: 'buy-used' as Flow, emoji: '🔵', title: t('phoneServices.buyUsed'), desc: t('phoneServices.buyUsedDesc'), color: '#3b82f6' },
    { id: 'sell' as Flow, emoji: '🟠', title: t('phoneServices.sellPhone'), desc: t('phoneServices.sellPhoneDesc'), color: '#f97316' },
    { id: 'exchange' as Flow, emoji: '🟣', title: t('phoneServices.exchangePhone'), desc: t('phoneServices.exchangePhoneDesc'), color: '#a855f7' },
  ];

  return (
    <nav aria-label="Phone Services" style={{ padding: '1.5rem 1.25rem', maxWidth: '480px', margin: '0 auto' }}>
      <button
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
        style={{
          background: 'none', border: 'none', color: colors.textMuted,
          fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1rem',
          fontFamily: 'inherit', padding: 0,
        }}
      >
        ← {t('phoneServices.back')}
      </button>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, marginBottom: '0.25rem' }}>
        {t('phoneServices.title')}
      </h1>
      <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        {t('phoneServices.subtitle')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => setFlow(card.id)}
            style={{
              background: colors.glass,
              border: `1px solid ${colors.glassBorder}`,
              borderRadius: '20px',
              padding: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              textAlign: 'left',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              transition: 'all 0.2s ease',
              fontFamily: 'inherit',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = card.color + '44';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = colors.glassBorder;
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: `${card.color}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', flexShrink: 0,
            }}>
              {card.emoji}
            </div>
            <div>
              <p style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{card.title}</p>
              <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: '0.15rem 0 0' }}>{card.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </nav>
  );
}
