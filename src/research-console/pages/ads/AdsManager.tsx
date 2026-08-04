import { useEffect, useState } from 'react';
import { DashboardHeader } from '../../layout/ResearchLayout';
import { getAdsFile, getAdOverride, saveAdOverride, resetAdOverride, resolveAd, AD_PLACEMENTS, type AdPlacement, type AdConfig } from '../../../services/ads-service';
import { compressImage } from '../../../services/image-service';

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  home: 'الصفحة الرئيسية',
  phones: 'صفحة الهواتف',
  repair: 'صفحة الصيانة',
  results: 'نتائج لعبة FOCUS',
  exchange: 'صفحة الاستبدال',
  'phone-details': 'صفحة تفاصيل الهاتف',
};

function emptyConfig(): AdConfig {
  return { enabled: false, image: '', link: '', alt: '' };
}

export function AdsManager() {
  const [edits, setEdits] = useState<Record<AdPlacement, AdConfig>>(() => {
    const init = {} as Record<AdPlacement, AdConfig>;
    for (const p of AD_PLACEMENTS) init[p] = emptyConfig();
    return init;
  });
  const [savedTick, setSavedTick] = useState(0);
  const [busy, setBusy] = useState<AdPlacement | null>(null);

  useEffect(() => {
    getAdsFile().then((file) => {
      const override = getAdOverride();
      const next = { ...edits };
      for (const p of AD_PLACEMENTS) {
        const base = file.placements?.[p] ?? emptyConfig();
        const ov = override[p];
        next[p] = { ...base, ...(ov ?? {}) };
      }
      setEdits(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTick]);

  const patch = (placement: AdPlacement, partial: Partial<AdConfig>) => {
    setEdits((prev) => ({ ...prev, [placement]: { ...prev[placement], ...partial } }));
  };

  const handleUpload = async (placement: AdPlacement, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(placement);
    try {
      const dataUrl = await compressImage(file, { maxDimension: 1280, quality: 0.8 });
      patch(placement, { image: dataUrl });
    } finally {
      setBusy(null);
    }
  };

  const save = (placement: AdPlacement) => {
    saveAdOverride(placement, edits[placement]);
    setSavedTick((v) => v + 1);
  };

  const reset = (placement: AdPlacement) => {
    resetAdOverride(placement);
    setSavedTick((v) => v + 1);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '1px solid #333', background: '#1e1e2e', color: '#f0f0f0',
    fontSize: '0.85rem', boxSizing: 'border-box', marginTop: '4px',
  };

  const btnStyle = (primary: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
    border: primary ? 'none' : '1px solid #333',
    background: primary ? '#6366f1' : 'transparent',
    color: primary ? '#fff' : '#888',
  });

  return (
    <div>
      <DashboardHeader
        title="Ads Manager"
        subtitle="إدارة الإعلانات الداخلية — تُحفظ على هذا الجهاز وتُدمج مع public/ads.json"
      />

      <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        كل موضع يعرض صورة واحدة فقط (PNG/WebP) بحركة Ken Burns. ارفع الصورة وحدّد الرابط وفعّل.
      </p>

      {AD_PLACEMENTS.map((placement) => {
        const cfg = edits[placement];
        const preview = resolveAd(placement, null, { [placement]: cfg });
        return (
          <div
            key={placement}
            style={{
              background: '#12121a', border: '1px solid #1e1e2e',
              borderRadius: '10px', padding: '1rem', marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <strong style={{ color: '#f0f0f0', fontSize: '0.9rem' }}>
                📍 {PLACEMENT_LABELS[placement]}
              </strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#888', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => patch(placement, { enabled: e.target.checked })}
                />
                مفعّل
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>الصورة</div>
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  onChange={(e) => handleUpload(placement, e.target.files)}
                  style={{ color: '#888', fontSize: '0.8rem', width: '100%' }}
                />
                <input
                  type="text"
                  placeholder="رابط الوجهة (اختياري)"
                  value={cfg.link}
                  onChange={(e) => patch(placement, { link: e.target.value })}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="نص بديل / وصف"
                  value={cfg.alt}
                  onChange={(e) => patch(placement, { alt: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>المعاينة</div>
                <div style={{
                  position: 'relative', width: '100%', aspectRatio: '16 / 5',
                  overflow: 'hidden', borderRadius: '8px', border: '1px solid #333',
                  background: '#0a0a0f',
                }}>
                  {preview?.image ? (
                    <img
                      src={preview.image}
                      alt={preview.alt || 'preview'}
                      style={{
                        position: 'absolute', inset: '-8%',
                        width: '116%', height: '116%', objectFit: 'cover',
                        animation: 'kenburns 22s ease-in-out infinite alternate',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444', fontSize: '0.75rem' }}>
                      لا صورة — الإعلان مخفي
                    </div>
                  )}
                </div>
                {busy === placement && (
                  <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '6px' }}>جارِ الضغط...</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
              <button style={btnStyle(true)} onClick={() => save(placement)}>💾 حفظ</button>
              <button style={btnStyle(false)} onClick={() => reset(placement)}>↩ إعادة لملف الإعدادات</button>
            </div>
          </div>
        );
      })}

      <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
        ملاحظة: التغييرات تُحفظ في localStorage لهذا المتصفح. لنشرها لكل الزوار عدّل ملف <code>public/ads.json</code> ثم أعد البناء.
      </div>
    </div>
  );
}
