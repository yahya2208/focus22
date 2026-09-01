import { useState, useEffect } from 'react';
import { createBusinessAPI } from '../api';
import { DemoBadge, DemoNotice } from '../DemoBadge';
import { generateId } from '../data-source';
import type { DataSource } from '../data-source';
import type { Opportunity } from '../types';
import type { SmartOffer } from './types';
import { useThemeColors } from '../../hooks/useThemeColors';
import { loadRuntimeSettings, getRuntimeSetting } from '../../core/config/runtime-settings';

const api = createBusinessAPI();
const OFFERS_KEY = 'bi_smart_offers';
const SOURCE_KEY = 'bi_smart_offers_source';

// Centralized-safe offer defaults (DB source of truth; safe fallback retained).
const DEFAULT_DISCOUNT = () => getRuntimeSetting('offers.default_discount_percent', 5);
const DEFAULT_MAX_USAGE = () => getRuntimeSetting('offers.default_max_usage', 50);

function loadOffers(): { offers: SmartOffer[]; source: DataSource } {
  try {
    const stored = localStorage.getItem(OFFERS_KEY);
    const source = (localStorage.getItem(SOURCE_KEY) as DataSource) ?? 'demo';
    return { offers: stored ? JSON.parse(stored) : [], source: stored ? source : 'demo' };
  } catch { return { offers: [], source: 'demo' }; }
}
function saveOffers(offers: SmartOffer[], source: DataSource) {
  localStorage.setItem(OFFERS_KEY, JSON.stringify(offers));
  localStorage.setItem(SOURCE_KEY, source);
}

export function SmartOfferEngine() {
  const colors = useThemeColors();
  const [{ offers, source }, setState] = useState(loadOffers);
  const [customers, setCustomers] = useState<Opportunity[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newOffer, setNewOffer] = useState<Partial<SmartOffer>>(() => ({
    type: 'discount', title: '', description: '', discountPercent: DEFAULT_DISCOUNT(),
    targetDevice: null, targetVisitorIds: [], maxUsage: DEFAULT_MAX_USAGE(),
  }));

  useEffect(() => {
    loadRuntimeSettings();
    api.getCustomerList().then(setCustomers);
  }, []);

  const createOffer = () => {
    const offer: SmartOffer = {
      id: generateId(),
      type: newOffer.type ?? 'discount',
      title: newOffer.title || 'عرض جديد',
      description: newOffer.description || '',
      discountPercent: newOffer.discountPercent,
      targetDevice: newOffer.targetDevice ?? null,
      targetVisitorIds: newOffer.targetVisitorIds ?? [],
      isActive: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      usageCount: 0,
      maxUsage: newOffer.maxUsage ?? DEFAULT_MAX_USAGE(),
    };
    const updated = [...offers, offer];
    saveOffers(updated, 'live');
    setState({ offers: updated, source: 'live' });
    setShowCreate(false);
    setNewOffer({ type: 'discount', title: '', description: '', discountPercent: DEFAULT_DISCOUNT(), targetDevice: null, targetVisitorIds: [], maxUsage: DEFAULT_MAX_USAGE() });
  };

  const toggleActive = (id: string) => {
    const updated = offers.map(o => o.id === id ? { ...o, isActive: !o.isActive } : o);
    saveOffers(updated, 'live');
    setState({ offers: updated, source: 'live' });
  };

  const qualifiedVisitors = customers.filter(c => c.visitCount >= 2 && !c.tradeRequested);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>Smart Offers</h2>
          <DemoBadge source={source} />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '8px 18px', borderRadius: '8px', border: 'none',
          background: colors.accent, color: '#fff', fontSize: '0.82rem',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}>
          {showCreate ? 'إلغاء' : '+ إنشاء عرض'}
        </button>
      </div>

      {/* Create Offer Form */}
      {showCreate && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '16px',
        }}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>عرض جديد</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input placeholder="عنوان العرض" value={newOffer.title}
              onChange={e => setNewOffer({ ...newOffer, title: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <textarea placeholder="وصف العرض" value={newOffer.description}
              onChange={e => setNewOffer({ ...newOffer, description: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: colors.bgInput, color: colors.text, fontSize: '0.82rem', minHeight: '60px', fontFamily: 'inherit' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>نسبة الخصم</label>
                <input type="number" value={newOffer.discountPercent ?? DEFAULT_DISCOUNT()}
                  onChange={e => setNewOffer({ ...newOffer, discountPercent: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                    background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ color: colors.textMuted, fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>الاستخدام الأقصى</label>
                <input type="number" value={newOffer.maxUsage ?? 50}
                  onChange={e => setNewOffer({ ...newOffer, maxUsage: parseInt(e.target.value) || 1 })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                    background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>الجهاز المستهدف (اختياري)</label>
              <input placeholder="مثال: Samsung A10" value={newOffer.targetDevice ? `${newOffer.targetDevice.brand} ${newOffer.targetDevice.model}` : ''}
                onChange={e => {
                  const parts = e.target.value.split(' ');
                  setNewOffer({ ...newOffer, targetDevice: parts.length >= 2 ? { brand: parts[0]!, model: parts.slice(1).join(' ') } : null });
                }}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`,
                  background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ color: colors.textMuted, fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                الزوار المستهدفون ({newOffer.targetVisitorIds?.length ?? 0} من {qualifiedVisitors.length})
              </label>
              <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {qualifiedVisitors.slice(0, 30).map(v => (
                  <label key={v.userId} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                    borderRadius: '4px', background: colors.bgInput, fontSize: '0.75rem', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={newOffer.targetVisitorIds?.includes(v.userId) ?? false}
                      onChange={() => {
                        const ids = newOffer.targetVisitorIds ?? [];
                        setNewOffer({
                          ...newOffer,
                          targetVisitorIds: ids.includes(v.userId) ? ids.filter((id: string) => id !== v.userId) : [...ids, v.userId],
                        });
                      }}
                      style={{ accentColor: colors.accent }} />
                    <span style={{ color: colors.text }}>{v.displayName}</span>
                    <span style={{ color: colors.textMuted, fontSize: '0.65rem' }}>({v.visitCount} زيارات)</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={createOffer} style={{
              padding: '10px', borderRadius: '8px', border: 'none',
              background: colors.accent, color: '#fff', fontSize: '0.85rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              إنشاء العرض
            </button>
          </div>
        </div>
      )}

      {source !== 'live' && <DemoNotice />}

      {/* Offers List */}
      {offers.length === 0 ? (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          لا توجد عروض بعد. أنشئ أول عرض ذكي الآن.
        </div>
      ) : (
        offers.map(offer => (
          <div key={offer.id} style={{
            background: colors.bgCard, border: `1px solid ${offer.isActive ? colors.accent + '40' : colors.border}`,
            borderRadius: '12px', padding: '14px 16px', opacity: offer.isActive ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600,
                    background: offer.type === 'discount' ? colors.successBg : colors.infoBg,
                    color: offer.type === 'discount' ? colors.success : colors.info,
                  }}>
                    {offer.type === 'discount' ? 'خصم' : offer.type === 'free_accessory' ? 'هدية' : 'عرض'}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.9rem', fontWeight: 600 }}>{offer.title}</span>
                </div>
                <div style={{ color: colors.textSecondary, fontSize: '0.78rem', marginTop: '4px' }}>{offer.description}</div>
                {offer.discountPercent && (
                  <div style={{ color: colors.accent, fontSize: '0.85rem', fontWeight: 700, marginTop: '4px' }}>
                    خصم {offer.discountPercent}%
                  </div>
                )}
                {offer.targetDevice && (
                  <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginTop: '2px' }}>
                    الجهاز: {offer.targetDevice.brand} {offer.targetDevice.model}
                  </div>
                )}
              </div>
              <button onClick={() => toggleActive(offer.id)} style={{
                padding: '4px 12px', borderRadius: '6px', border: 'none',
                background: offer.isActive ? colors.successBg : colors.bgInput,
                color: offer.isActive ? colors.success : colors.textMuted,
                fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {offer.isActive ? 'نشط' : 'متوقف'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.7rem', color: colors.textMuted }}>
              <span>مستخدم: {offer.usageCount}/{offer.maxUsage}</span>
              <span>المستهدفون: {offer.targetVisitorIds.length} زائر</span>
              <span>تاريخ الإنشاء: {new Date(offer.createdAt).toLocaleDateString('ar')}</span>
            </div>
          </div>
        ))
      )}

      {/* Quick Actions: Create offers from visitor segments */}
      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '16px',
      }}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 10px 0' }}>إجراءات سريعة — عروض مقترحة</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: `إنشاء عرض خصم لـ ${qualifiedVisitors.length} زائر عائد`, desc: 'زوار عادوا 2+ مرات ولم يطلبوا استبدال', action: () => {
              setNewOffer({
                type: 'discount', title: 'خصم للزوار العائدين', description: 'نقدر زيارتك المتكررة، إليك خصم خاص',
                discountPercent: getRuntimeSetting('offers.return_discount_percent', 5), targetVisitorIds: qualifiedVisitors.slice(0, 50).map(v => v.userId), maxUsage: DEFAULT_MAX_USAGE(),
              });
              setShowCreate(true);
            }},
            { label: 'عرض للزوار الذين ضغطوا واتساب', desc: `${customers.filter(c => c.whatsappClicked).length} زائر تواصل عبر واتساب` , action: () => {
              const whatsappVisitors = customers.filter(c => c.whatsappClicked);
              setNewOffer({
                type: 'discount', title: 'عرض متابعة واتساب', description: 'شكرًا لتواصلك، خصم إضافي لك',
                discountPercent: getRuntimeSetting('offers.whatsapp_discount_percent', 8), targetVisitorIds: whatsappVisitors.slice(0, 50).map(v => v.userId), maxUsage: getRuntimeSetting('offers.whatsapp_max_usage', 30),
              });
              setShowCreate(true);
            }},
          ].map((action, i) => (
            <button key={i} onClick={action.action} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: '8px', border: `1px solid ${colors.borderLight}`,
              background: colors.bgInput, color: colors.text, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
              fontSize: '0.8rem',
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{action.label}</div>
                <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginTop: '2px' }}>{action.desc}</div>
              </div>
              <span style={{ color: colors.accent, fontSize: '1.2rem' }}>+</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
