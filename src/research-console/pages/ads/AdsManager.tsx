import { useEffect, useState } from 'react';
import { DashboardHeader } from '../../layout/ResearchLayout';
import {
  refreshAds, getAds, saveAd, resetAd, uploadAdImage, AD_PLACEMENTS,
  type AdPlacement, type AdConfig,
} from '../../../services/ads-service';
import { compressImageToBlob } from '../../../services/image-service';
import { AdBanner } from '../../../components/ads/AdBanner';

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

function emptyMap(): Record<AdPlacement, AdConfig> {
  const init = {} as Record<AdPlacement, AdConfig>;
  for (const p of AD_PLACEMENTS) init[p] = emptyConfig();
  return init;
}

export function AdsManager() {
  const [edits, setEdits] = useState<Record<AdPlacement, AdConfig>>(emptyMap);
  const [pendingUploads, setPendingUploads] = useState<Record<AdPlacement, Blob>>({} as Record<AdPlacement, Blob>);
  const [pendingPreviews, setPendingPreviews] = useState<Record<AdPlacement, string>>({} as Record<AdPlacement, string>);
  const [status, setStatus] = useState<Record<AdPlacement, string>>({} as Record<AdPlacement, string>);
  const [busy, setBusy] = useState<AdPlacement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    refreshAds().then(() => {
      if (cancelled) return;
      const next = emptyMap();
      const ads = getAds();
      for (const p of AD_PLACEMENTS) next[p] = ads?.[p] ?? emptyConfig();
      setEdits(next);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      for (const url of Object.values(pendingPreviews)) URL.revokeObjectURL(url);
    };
  }, [pendingPreviews]);

  const patch = (placement: AdPlacement, partial: Partial<AdConfig>) => {
    setEdits((prev) => ({ ...prev, [placement]: { ...prev[placement], ...partial } }));
  };

  const handleUpload = async (placement: AdPlacement, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(placement);
    try {
      const blob = await compressImageToBlob(file, { maxDimension: 1280, quality: 0.8 });
      setPendingPreviews((prev) => {
        if (prev[placement]) URL.revokeObjectURL(prev[placement]);
        return { ...prev, [placement]: URL.createObjectURL(blob) };
      });
      setPendingUploads((prev) => ({ ...prev, [placement]: blob }));
    } finally {
      setBusy(null);
    }
  };

  const save = async (placement: AdPlacement) => {
    setBusy(placement);
    setStatus((prev) => ({ ...prev, [placement]: '' }));
    try {
      const cfg = edits[placement];
      const pending = pendingUploads[placement];
      let image_path = '';
      let image_url = cfg.image;
      if (pending) {
        const uploaded = await uploadAdImage(placement, pending);
        image_path = uploaded.path;
        image_url = uploaded.url;
      }
      await saveAd({ placement, enabled: cfg.enabled, image_path, image_url, link: cfg.link, alt: cfg.alt });
      setPendingUploads((prev) => {
        const next = { ...prev };
        delete next[placement];
        return next;
      });
      setPendingPreviews((prev) => {
        if (prev[placement]) URL.revokeObjectURL(prev[placement]);
        const next = { ...prev };
        delete next[placement];
        return next;
      });
      patch(placement, { image: image_url });
      const live = cfg.enabled && Boolean(image_url);
      setStatus((prev) => ({
        ...prev,
        [placement]: live
          ? '✓ تم الحفظ ونشره للجميع'
          : cfg.enabled
            ? '✓ تم الحفظ — لا توجد صورة، لن يظهر للزوار'
            : '✓ تم الحفظ — الإعلان غير مفعّل، لن يظهر للزوار',
      }));
    } catch (err) {
      setStatus((prev) => ({ ...prev, [placement]: err instanceof Error ? err.message : 'فشل الحفظ' }));
    } finally {
      setBusy(null);
    }
  };

  const reset = async (placement: AdPlacement) => {
    setBusy(placement);
    setStatus((prev) => ({ ...prev, [placement]: '' }));
    try {
      await resetAd(placement);
      setPendingUploads((prev) => {
        const next = { ...prev };
        delete next[placement];
        return next;
      });
      setPendingPreviews((prev) => {
        if (prev[placement]) URL.revokeObjectURL(prev[placement]);
        const next = { ...prev };
        delete next[placement];
        return next;
      });
      patch(placement, emptyConfig());
      setStatus((prev) => ({ ...prev, [placement]: '✓ تمت الإزالة' }));
    } catch (err) {
      setStatus((prev) => ({ ...prev, [placement]: err instanceof Error ? err.message : 'فشل الإزالة' }));
    } finally {
      setBusy(null);
    }
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
        subtitle="إدارة الإعلانات الداخلية — تُحفظ في قاعدة البيانات وتظهر لكل الزوار فورًا"
      />

      <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        كل موضع يعرض صورة واحدة فقط (JPEG مضغوط). الإطار يتكيف تلقائياً مع أبعاد الصورة لتظهر كاملة دون قصّ — ارفع الصورة وحدّد الرابط وفعّل، ثم احفظ.
      </p>

      {!loaded && <p style={{ color: '#888', fontSize: '0.8rem' }}>جارِ التحميل...</p>}

      {AD_PLACEMENTS.map((placement) => {
        const cfg = edits[placement];
        const previewImage = pendingPreviews[placement] || cfg.image;
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
                <div style={{ width: '100%', overflow: 'hidden', borderRadius: '8px', border: '1px solid #333', background: '#0a0a0f' }}>
                  {previewImage ? (
                    <AdBanner image={previewImage} alt={cfg.alt || 'preview'} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444', fontSize: '0.75rem', padding: '2.5rem 0' }}>
                      لا صورة — الإعلان مخفي
                    </div>
                  )}
                </div>
                {busy === placement && (
                  <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '6px' }}>جارِ المعالجة...</div>
                )}
                {status[placement] && (
                  <div style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '6px' }}>{status[placement]}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
              <button style={btnStyle(true)} disabled={busy !== null} onClick={() => save(placement)}>💾 حفظ ونشر</button>
              <button style={btnStyle(false)} disabled={busy !== null} onClick={() => reset(placement)}>🗑 إزالة</button>
            </div>
          </div>
        );
      })}

      <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
        ملاحظة: التغييرات تُحفظ في قاعدة البيانات (جدول ads) وتنتشر فورًا لكل الزوار — لا حاجة لإعادة البناء.
      </div>
    </div>
  );
}
