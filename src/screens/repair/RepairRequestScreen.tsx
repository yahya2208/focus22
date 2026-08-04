import { useState, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, VStack } from '../../design-system/layout';
import { CatalogCascadeSelector } from '../../components/catalog/CatalogCascadeSelector';
import type { PhoneIdentity } from '../../components/catalog/CatalogIdentity';
import { RepairPhotoUpload } from '../../components/repair/RepairPhotoUpload';
import { REPAIR_ISSUES, type RepairRequest } from '../../services/repair/repair-types';
import { getRepairRepository } from '../../services/repair/repair-repository';
import { openWhatsApp, WHATSAPP_PHONE, openModelNotFoundRequest } from '../../services/whatsapp-service';
import { AlgerianPhoneInput, normalizePhone, toInternationalFormat } from '../../components/forms/AlgerianPhoneInput';
import { devError } from '../../core/logging';

const INPUT_STYLE: Record<string, string | number> = {
  width: '100%',
  padding: '0.85rem',
  borderRadius: '14px',
  border: 'none',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export const RepairRequestScreen = memo(function RepairRequestScreen() {
  const dispatch = useAppDispatch();
  const { t: translate, dir } = useTranslation();
  const t = translate as (key: string) => string;
  const colors = useThemeColors();
  const isRtl = dir === 'rtl';

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneIdentity, setPhoneIdentity] = useState<Partial<PhoneIdentity>>({});
  const [selectedIssue, setSelectedIssue] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; request: RepairRequest } | null>(null);
  const [copied, setCopied] = useState(false);

  const normalizedPhone = normalizePhone(customerPhone);
  const canSubmit = normalizedPhone.length > 0 && !!phoneIdentity.brandName && !!phoneIdentity.modelName && !!selectedIssue && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const repo = getRepairRepository();
      const res = await repo.createRequest({
        customerName: customerName.trim() || 'Ø¹Ù…ÙŠÙ„',
        customerPhone: normalizedPhone,
        brandName: phoneIdentity.brandName!,
        modelName: phoneIdentity.modelName!,
        condition: phoneIdentity.condition ?? undefined,
        issue: selectedIssue,
        description,
        latitude: null, longitude: null,
        locationAccuracy: null, googleMapsLink: null,
        photoPaths: photos,
        customerId: null,
      });
      setResult({ code: res.code, request: res.request });
    } catch (e) {
      devError('Failed to create repair request', e);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, customerName, customerPhone, phoneIdentity, selectedIssue, description, photos]);

  const handleOpenWhatsApp = useCallback(() => {
    if (!result) return;
    const message = [
      'Ø§Ù„Ø³Ù„Ø§Ù… Ø¹Ù„ÙŠÙƒÙ…',
      '',
      'Ø£Ø±ØºØ¨ ÙÙŠ Ø¥ØµÙ„Ø§Ø­ Ø§Ù„Ù‡Ø§ØªÙ Ø§Ù„ØªØ§Ù„ÙŠ',
      '',
      `Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨: ${result.code}`,
      `Ø§Ù„Ù‡Ø§ØªÙ: ${result.request.brandName} ${result.request.modelName}`,
      result.request.condition ? `Ø§Ù„Ø­Ø§Ù„Ø©: ${result.request.condition}` : '',
      '',
      `Ø§Ù„Ù…Ø´ÙƒÙ„Ø©: ${result.request.issue}`,
      description ? `${description}` : '',
      '',
      `Ø±Ù‚Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„: ${toInternationalFormat(normalizedPhone)}`,
      '',
      'Ø´ÙƒØ±Ø§Ù‹.',
    ].filter(Boolean).join('\n');
    openWhatsApp(WHATSAPP_PHONE, message, 'repair_requested');
  }, [result, description, normalizedPhone]);

  const handleCopyCode = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const inputStyle = { ...INPUT_STYLE, background: colors.bgInput, color: colors.text };
  const labelStyle: Record<string, string | number> = { color: colors.textMuted, fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' };

  if (result) {
    return (
      <Screen>
        <VStack gap="lg" style={{ alignItems: 'center', textAlign: 'center', paddingTop: '2rem' }}>
          <div style={{ fontSize: '3rem' }}>âœ…</div>
          <h2 style={{ color: '#22c55e', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            {t('repair.requestSubmitted') || 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ø¥ØµÙ„Ø§Ø­'}
          </h2>

          <div style={{
            background: colors.glass, borderRadius: '16px', padding: '1.5rem 2rem',
            border: `1px solid ${colors.glassBorder}`, width: '100%', maxWidth: '320px',
          }}>
            <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: '0 0 0.3rem' }}>
              {t('repair.repairCode') || 'Ø±Ù‚Ù… Ø§Ù„Ø·Ù„Ø¨'}
            </p>
            <p style={{ color: colors.accent, fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {result.code}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={handleCopyCode} style={{
              padding: '0.75rem 1.5rem', borderRadius: '14px', border: 'none',
              background: colors.accent, color: '#fff', fontSize: '0.9rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {copied ? 'âœ“ ' + (t('common.copied') || 'ØªÙ… Ø§Ù„Ù†Ø³Ø®') : (t('common.copy') || 'Ù†Ø³Ø® Ø§Ù„Ø±Ù‚Ù…')}
            </button>

            <button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-tracking' })} style={{
              padding: '0.75rem 1.5rem', borderRadius: '14px',
              border: `1px solid ${colors.borderLight}`, background: 'none',
              color: colors.text, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t('repair.track') || 'ØªØªØ¨Ø¹ Ø§Ù„Ø·Ù„Ø¨'}
            </button>
          </div>

          <button onClick={handleOpenWhatsApp} style={{
            width: '100%', maxWidth: '320px', padding: '1rem', borderRadius: '14px',
            border: 'none', background: '#25D366', color: '#fff', fontSize: '1rem',
            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
            <span>ðŸ’¬</span> {t('repair.sendToWhatsApp') || 'Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨'}
          </button>

          <button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })} style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
            textDecoration: 'underline',
          }}>
            {isRtl ? 'â† Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„ÙˆØ­Ø© Ø§Ù„ØµÙŠØ§Ù†Ø©' : 'â† Back to Repair'}
          </button>
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen>
      <VStack gap="md" style={{ padding: '1rem 0' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          ðŸ”§ {t('repair.requestRepair') || 'Ø·Ù„Ø¨ Ø¥ØµÙ„Ø§Ø­'}
        </h2>

        {/* Customer info */}
        <AlgerianPhoneInput
          value={customerPhone}
          onChange={setCustomerPhone}
          label={(t('repair.customerPhone') || 'Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ') + ' *'}
          placeholder={t('repair.customerPhonePlaceholder') || '05XX XX XX XX'}
        />
        <div>
          <label style={{ ...labelStyle, color: colors.textMuted + '99' }}>
            {t('repair.customerName') || 'Ø§Ù„Ø§Ø³Ù…'} ({t('repair.optional') || 'Ø§Ø®ØªÙŠØ§Ø±ÙŠ'})
          </label>
          <input
            type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
            placeholder={t('repair.customerNamePlaceholder') || 'Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„'}
            style={inputStyle}
          />
        </div>

        {/* Phone selection */}
        <div>
          <label style={labelStyle}>{t('repair.selectPhone') || 'Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù‡Ø§ØªÙ'} *</label>
          <CatalogCascadeSelector
            value={phoneIdentity}
            onChange={setPhoneIdentity}
            allowVariant
            allowCondition
            showSearch
            showFavorites
            onModelNotFound={(brand, model) => openModelNotFoundRequest(brand, model)}
          />
        </div>

        {/* Issue */}
        <div>
          <label style={labelStyle}>{t('repair.selectIssue') || 'Ø§Ù„Ù…Ø´ÙƒÙ„Ø©'} *</label>
          <select
            value={selectedIssue} onChange={e => setSelectedIssue(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          >
            <option value="">{(t('repair.selectIssue') || 'Ø§Ø®ØªØ± Ø§Ù„Ù…Ø´ÙƒÙ„Ø©...')}</option>
            {REPAIR_ISSUES.map(i => (
              <option key={i} value={i}>{i === 'Other' ? (t('repair.other') || 'Ø£Ø®Ø±Ù‰') : i}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>{t('repair.description') || 'ÙˆØµÙ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©'}</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t('repair.descriptionPlaceholder') || 'ØµÙ Ø§Ù„Ù…Ø´ÙƒÙ„Ø©...'}
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          />
        </div>

        {/* Photos */}
        <div>
          <RepairPhotoUpload photos={photos} onPhotosChange={setPhotos} />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit} disabled={!canSubmit}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px',
            border: 'none', background: canSubmit ? '#25D366' : colors.border,
            color: canSubmit ? '#fff' : colors.textMuted,
            fontSize: '1rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', marginTop: '0.5rem',
          }}
        >
          {submitting
            ? (t('repair.submitting') || 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„...')
            : (t('repair.submit') || 'ðŸ”§ Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ø¥ØµÙ„Ø§Ø­')}
        </button>

        <button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })} style={{
          background: 'none', border: 'none', color: colors.textMuted,
          fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
          textDecoration: 'underline', padding: '0.5rem',
        }}>
          {isRtl ? 'â† Ø§Ù„Ø¹ÙˆØ¯Ø©' : 'â† Back'}
        </button>
      </VStack>
    </Screen>
  );
});
