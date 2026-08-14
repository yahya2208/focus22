import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardHeader } from '../../layout/ResearchLayout';
import {
  refreshAds, getAds, saveAd, resetAd, uploadAdImage, replaceAdImages, AD_PLACEMENTS,
  buildAdPhoneLink,
  type AdPlacement, type AdConfig,
} from '../../../services/ads-service';
import { compressImageToBlob } from '../../../services/image-service';
import { AdBanner } from '../../../components/ads/AdBanner';
import { InventoryService, type InventoryRecord } from '../../../services/inventory-service';

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  home: 'الصفحة الرئيسية',
  phones: 'صفحة الهواتف',
  repair: 'صفحة الصيانة',
  results: 'نتائج لعبة FOCUS',
  exchange: 'صفحة الاستبدال',
  'phone-details': 'صفحة تفاصيل الهاتف',
  showroom: 'صفحة العرض (المعرض)',
};

function emptyConfig(): AdConfig {
  return { enabled: false, image: '', link: '', alt: '', deviceId: '', images: [] };
}

function emptyMap(): Record<AdPlacement, AdConfig> {
  const init = {} as Record<AdPlacement, AdConfig>;
  for (const p of AD_PLACEMENTS) init[p] = emptyConfig();
  return init;
}

/**
 * Phase C + 00021 — a placement gallery is an ordered list of images. `existing`
 * items are already in `ad_images`; `pending` items are local blob previews that
 * are uploaded only when the admin hits «حفظ ونشر». Each slide carries its own
 * device (deviceId, '' = none) so every carousel slide can drive its own
 * phone-details/WhatsApp handoff (supabase/ads-slide-devices, migration 00021).
 */
type GalleryItem =
  | { kind: 'existing'; key: string; path: string; url: string; isCover: boolean; deviceId: string }
  | { kind: 'pending'; key: string; url: string; isCover: boolean; deviceId: string; blob: Blob };

function emptyGalleryMap(): Record<AdPlacement, GalleryItem[]> {
  const init = {} as Record<AdPlacement, GalleryItem[]>;
  for (const p of AD_PLACEMENTS) init[p] = [];
  return init;
}

function nextItemKey(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function AdsManager() {
  const [edits, setEdits] = useState<Record<AdPlacement, AdConfig>>(emptyMap);
  const [galleries, setGalleries] = useState<Record<AdPlacement, GalleryItem[]>>(emptyGalleryMap);
  const [status, setStatus] = useState<Record<AdPlacement, string>>({} as Record<AdPlacement, string>);
  const [busy, setBusy] = useState<AdPlacement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pendingObjectUrls = useRef<Set<string>>(new Set());

  // Phone picker source — the same availability contract the phone-details
  // page uses (useProductDetails), so any selectable phone resolves at runtime.
  const devices: InventoryRecord[] = InventoryService.getExchangeableDevices();

  const applyAds = useCallback((ads: Record<AdPlacement, AdConfig> | null) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of AD_PLACEMENTS) next[p] = ads?.[p] ?? emptyConfig();
      return next;
    });
    setGalleries((prev) => {
      const next = { ...prev };
      for (const p of AD_PLACEMENTS) {
        next[p] = (ads?.[p]?.images ?? []).map((img) => ({
          kind: 'existing' as const,
          key: img.id,
          path: img.path,
          url: img.url,
          isCover: img.isCover,
          deviceId: img.deviceId ?? '',
        }));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshAds().then(() => {
      if (cancelled) return;
      applyAds(getAds());
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [applyAds]);

  useEffect(() => {
    return () => {
      for (const url of pendingObjectUrls.current) URL.revokeObjectURL(url);
      pendingObjectUrls.current.clear();
    };
  }, []);

  const patch = (placement: AdPlacement, partial: Partial<AdConfig>) => {
    setEdits((prev) => ({ ...prev, [placement]: { ...prev[placement], ...partial } }));
  };

  const handleUpload = async (placement: AdPlacement, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(placement);
    try {
      const added: GalleryItem[] = [];
      for (const file of Array.from(files)) {
        const blob = await compressImageToBlob(file, { maxDimension: 1280, quality: 0.8 });
        const url = URL.createObjectURL(blob);
        pendingObjectUrls.current.add(url);
        added.push({ kind: 'pending', key: nextItemKey(), url, isCover: false, deviceId: '', blob });
      }
      if (added.length === 0) return;
      setGalleries((prev) => {
        const existing = prev[placement] ?? [];
        const hasCover = existing.some((it) => it.isCover);
        const next = added.map((it, i) => (hasCover || i > 0 ? it : { ...it, isCover: true }));
        return { ...prev, [placement]: [...existing, ...next] };
      });
    } finally {
      setBusy(null);
    }
  };

  const setCover = (placement: AdPlacement, key: string) => {
    setGalleries((prev) => ({
      ...prev,
      [placement]: (prev[placement] ?? []).map((it) => ({ ...it, isCover: it.key === key })),
    }));
  };

  const setSlideDevice = (placement: AdPlacement, key: string, deviceId: string) => {
    setGalleries((prev) => ({
      ...prev,
      [placement]: (prev[placement] ?? []).map((it) => ({ ...it, deviceId: it.key === key ? deviceId : it.deviceId })),
    }));
  };

  const moveItem = (placement: AdPlacement, index: number, dir: -1 | 1) => {
    setGalleries((prev) => {
      const list = [...(prev[placement] ?? [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return prev;
      const [item] = list.splice(index, 1);
      if (!item) return prev;
      list.splice(target, 0, item);
      return { ...prev, [placement]: list };
    });
  };

  const removeItem = (placement: AdPlacement, index: number) => {
    setGalleries((prev) => {
      const list = [...(prev[placement] ?? [])];
      if (list.length <= 1) return prev; // a gallery never drops below one image
      const [removed] = list.splice(index, 1);
      if (!removed) return prev;
      if (removed.kind === 'pending' && pendingObjectUrls.current.has(removed.url)) {
        URL.revokeObjectURL(removed.url);
        pendingObjectUrls.current.delete(removed.url);
      }
      let next = list;
      if (removed.isCover && !next.some((it) => it.isCover)) {
        next = next.map((it, i) => ({ ...it, isCover: i === 0 }));
      }
      return { ...prev, [placement]: next };
    });
  };

  const save = async (placement: AdPlacement) => {
    setBusy(placement);
    setStatus((prev) => ({ ...prev, [placement]: '' }));
    try {
      const cfg = edits[placement];
      if (cfg.deviceId && !devices.some((d) => d.id === cfg.deviceId)) {
        setStatus((prev) => ({ ...prev, [placement]: 'الهاتف المحدد غير موجود في المخزون الحالي — أعد اختياره' }));
        setBusy(null);
        return;
      }
      const items = galleries[placement] ?? [];
      const slideDeviceIds = items.map((it) => it.deviceId ?? '');
      const missingDevice = slideDeviceIds.find((id) => id !== '' && !devices.some((d) => d.id === id));
      if (missingDevice) {
        setStatus((prev) => ({ ...prev, [placement]: 'هاتف إحدى الصور غير موجود في المخزون الحالي — أعد اختياره' }));
        setBusy(null);
        return;
      }
      const pathByKey = new Map<string, string>();
      for (const item of items) {
        if (item.kind === 'pending') {
          const uploaded = await uploadAdImage(placement, item.blob);
          pathByKey.set(item.key, uploaded.path);
        } else {
          pathByKey.set(item.key, item.path);
        }
      }
      await saveAd({ placement, enabled: cfg.enabled, link: cfg.link, alt: cfg.alt, deviceId: cfg.deviceId });
      if (items.length > 0) {
        await replaceAdImages(
          placement,
          items.map((it) => pathByKey.get(it.key) ?? ''),
          items.map((it) => it.isCover),
          slideDeviceIds,
        );
      }
      for (const url of pendingObjectUrls.current) URL.revokeObjectURL(url);
      pendingObjectUrls.current.clear();
      applyAds(getAds());
      const live = cfg.enabled && Boolean(getAds()?.[placement]?.image);
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
      for (const item of galleries[placement] ?? []) {
        if (item.kind === 'pending' && pendingObjectUrls.current.has(item.url)) {
          URL.revokeObjectURL(item.url);
          pendingObjectUrls.current.delete(item.url);
        }
      }
      patch(placement, emptyConfig());
      setGalleries((prev) => ({ ...prev, [placement]: [] }));
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

  const thumbBtnStyle: React.CSSProperties = {
    padding: '2px 5px', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer',
    border: '1px solid #333', background: 'transparent', color: '#aaa',
  };

  return (
    <div>
      <DashboardHeader
        title="Ads Manager"
        subtitle="إدارة الإعلانات الداخلية — تُحفظ في قاعدة البيانات وتظهر لكل الزوار فورًا"
      />

      <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 1rem' }}>
        كل موضع يحمل معرض صور مرتب (JPEG مضغوط) — الصورة المميزة بـ«الغلاف» هي ما يظهر للزوار في البانر.
        ارفع عدة صور، رتّبها بالأسهم، حدّد الغلاف والرابط، ثم احفظ. يمكن ربط كل شريحة بهاتف مستقل (اختياري)
        فيُشتق رابطها وقت العرض. التغييرات لا تنشر قبل الضغط على «حفظ ونشر».
      </p>

      {!loaded && <p style={{ color: '#888', fontSize: '0.8rem' }}>جارِ التحميل...</p>}

      {AD_PLACEMENTS.map((placement) => {
        const cfg = edits[placement];
        const items = galleries[placement] ?? [];
        const previewImage = cfg.image;
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
                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>معرض الصور</div>
                {items.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {items.map((item, idx) => (
                      <div
                        key={item.key}
                        style={{
                          width: 68, border: item.isCover ? '2px solid #6366f1' : '1px solid #333',
                          borderRadius: '8px', padding: 2,
                        }}
                      >
                        <img
                          src={item.url}
                          alt=""
                          data-gallery-thumb
                          style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: '5px', display: 'block' }}
                        />
                        {item.isCover && (
                          <div style={{ textAlign: 'center', color: '#6366f1', fontSize: '0.62rem', marginTop: 2 }}>الغلاف</div>
                        )}
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                          <button type="button" aria-label={`رفع صورة ${idx}`} disabled={idx === 0} onClick={() => moveItem(placement, idx, -1)} style={thumbBtnStyle}>↑</button>
                          <button type="button" aria-label={`خفض صورة ${idx}`} disabled={idx === items.length - 1} onClick={() => moveItem(placement, idx, 1)} style={thumbBtnStyle}>↓</button>
                          <button type="button" aria-label={`تعيين كغلاف ${idx}`} disabled={item.isCover} onClick={() => setCover(placement, item.key)} style={thumbBtnStyle}>غلاف</button>
                          <button type="button" aria-label={`حذف صورة ${idx}`} onClick={() => removeItem(placement, idx)} style={{ ...thumbBtnStyle, color: '#ef4444' }}>✕</button>
                        </div>
                        <select
                          aria-label={`هاتف شريحة ${idx + 1}`}
                          data-testid={`ad-slide-device-${idx}`}
                          value={item.deviceId}
                          onChange={(e) => setSlideDevice(placement, item.key, e.target.value)}
                          style={{
                            width: '100%', fontSize: '0.6rem', marginTop: 2, padding: '2px', boxSizing: 'border-box',
                            background: '#1e1e2e', color: '#f0f0f0', border: '1px solid #333', borderRadius: 4,
                          }}
                        >
                          <option value="">لا هاتف</option>
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {`${d.brand} ${d.model} ${d.variant ?? ''}`.trim()}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '8px' }}>
                    لا توجد صور بعد — ارفع صورة واحدة على الأقل.
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  multiple
                  onChange={(e) => handleUpload(placement, e.target.files)}
                  style={{ color: '#888', fontSize: '0.8rem', width: '100%' }}
                />
                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px', marginTop: '8px' }}>هاتف مرتبط (اختياري)</div>
                <select
                  aria-label={`هاتف مرتبط لـ ${PLACEMENT_LABELS[placement]}`}
                  value={cfg.deviceId}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    patch(placement, { deviceId, link: deviceId ? buildAdPhoneLink(deviceId) : '' });
                  }}
                  style={{ ...inputStyle, marginBottom: '8px' }}
                >
                  <option value="">لا يوجد هاتف — رابط خارجي</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {`${d.brand} ${d.model} ${d.variant ?? ''}`.trim()}
                    </option>
                  ))}
                </select>
                {cfg.deviceId ? (
                  <div>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>رابط الهاتف (يُشتق تلقائيًا)</div>
                    <input
                      type="text"
                      readOnly
                      value={cfg.link}
                      data-testid="ad-phone-link"
                      style={inputStyle}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="رابط الوجهة (اختياري) — مثال https://..."
                    value={cfg.link}
                    onChange={(e) => patch(placement, { link: e.target.value })}
                    style={inputStyle}
                  />
                )}
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
        ملاحظة: التغييرات تُحفظ في قاعدة البيانات (جدولا ads و ad_images) وتنتشر فورًا لكل الزوار — لا حاجة لإعادة البناء.
      </div>
    </div>
  );
}
