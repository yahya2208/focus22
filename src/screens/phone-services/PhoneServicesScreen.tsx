import { useState, useCallback } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { getBrandNames, getModelsForBrand } from '../../data/phone-database';

type DeviceCondition = 'excellent' | 'good' | 'fair' | 'poor';

export function PhoneServicesScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const brands = getBrandNames();
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [storage, setStorage] = useState('');
  const [condition, setCondition] = useState<DeviceCondition>('good');
  const [batteryHealth, setBatteryHealth] = useState(80);
  const [submitted, setSubmitted] = useState(false);

  const models = selectedBrand ? getModelsForBrand(selectedBrand) : [];

  const handleBrandChange = useCallback((brand: string) => {
    setSelectedBrand(brand);
    setSelectedModel('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedBrand || !selectedModel) return;
    setSubmitted(true);
  }, [selectedBrand, selectedModel]);

  const handleBrowseUsed = useCallback(() => {
    window.open('https://fixpro.pages.dev/used-phones', '_blank', 'noopener,noreferrer');
  }, []);

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: `1px solid ${colors.borderLight}`,
    background: colors.bgInput,
    color: colors.text,
    fontSize: '1rem',
    boxSizing: 'border-box',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='${encodeURIComponent(colors.textMuted)}' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
    paddingRight: '2rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: colors.textSecondary,
    fontSize: '0.85rem',
    marginBottom: '0.25rem',
  };

  return (
    <nav aria-label="Phone Services" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {t('phoneServices.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {t('phoneServices.subtitle')}
      </p>

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1.1rem' }}>
          {t('phoneServices.replacementTitle')}
        </h2>
        <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
          {t('phoneServices.replacementDescription')}
        </p>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: colors.success, fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              {t('phoneServices.requestSent')}
            </p>
            <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('phoneServices.requestSentMessage')}
            </p>
            <Button variant="secondary" onClick={() => { setSubmitted(false); setSelectedBrand(''); setSelectedModel(''); }}>
              {t('phoneServices.newRequest')}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>{t('phoneServices.brand')}</label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                style={selectStyle}
              >
                <option value="">{t('phoneServices.selectBrand')}</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            {selectedBrand && (
              <div>
                <label style={labelStyle}>{t('phoneServices.model')}</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('phoneServices.selectModel')}</option>
                  {models.map((m) => (
                    <option key={m.model} value={m.model}>{m.model} ({m.year})</option>
                  ))}
                </select>
              </div>
            )}

            {selectedModel && (
              <>
                <div>
                  <label style={labelStyle}>{t('phoneServices.storage')}</label>
                  <select
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">{t('phoneServices.selectStorage')}</option>
                    <option value="64GB">64 GB</option>
                    <option value="128GB">128 GB</option>
                    <option value="256GB">256 GB</option>
                    <option value="512GB">512 GB</option>
                    <option value="1TB">1 TB</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>{t('phoneServices.condition')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['excellent', 'good', 'fair', 'poor'] as const).map((c) => (
                      <Button
                        key={c}
                        variant={condition === c ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setCondition(c)}
                      >
                        {t(`phoneServices.condition.${c}`)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    {t('phoneServices.batteryHealth')}: {batteryHealth}%
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={batteryHealth}
                    onChange={(e) => setBatteryHealth(Number(e.target.value))}
                    style={{ width: '100%', accentColor: colors.accent }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: colors.textFaint }}>
                    <span>10%</span>
                    <span>100%</span>
                  </div>
                </div>

                <Button onClick={handleSubmit} style={{ marginTop: '0.5rem' }}>
                  {t('phoneServices.submitRequest')}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: colors.text, marginBottom: '0.5rem', fontSize: '1.1rem' }}>
          {t('phoneServices.usedTitle')}
        </h2>
        <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
          {t('phoneServices.usedDescription')}
        </p>
        <Button variant="secondary" onClick={handleBrowseUsed} style={{ width: '100%' }}>
          {t('phoneServices.browseUsed')}
        </Button>
      </Card>

      <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '1rem' }}>
        {t('phoneServices.back')}
      </Button>
    </nav>
  );
}
