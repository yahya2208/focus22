import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardHeader } from '../../layout/ResearchLayout';
import {
  refreshAds, getAds, saveAd, resetAd, uploadAdImage, replaceAdImages, AD_PLACEMENTS,
  buildAdPhoneLink,
  type AdPlacement, type AdConfig, type AdDestinationType,
} from '../../../services/ads-service';
import { isSafeExternalUrl } from '../../../services/ad-adapters/external';
import { isValidWhatsAppNumber, WHATSAPP_MESSAGE_MAX_LENGTH } from '../../../services/ad-adapters/whatsapp';
import { INTERNAL_AD_ALLOWLIST } from '../../../services/ad-adapters/internal';
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

const DESTINATION_TYPE_LABELS: Record<AdDestinationType, string> = {
  phone: 'هاتف (مخزون)',
  external: 'رابط خارجي (http)',
  whatsapp: 'واتساب',
  internal: 'شاشة داخلية',
};

const INTERNAL_SCREEN_LABELS: Record<string, string> = {
  'phone-details': 'تفاصيل الهاتف (يتطلب هاتفًا)',
  showroom: 'صالة العرض',
  'phone-services': 'خدمات الهاتف',
  'repair-home': 'الصيانة (الرئيسية)',
};

function emptyConfig(): AdConfig {
  return {
    enabled: false, image: '', link: '', alt: '', deviceId: '',
    destinationType: 'phone', destination: {}, title: '', images: [],
  };
}

/**
 * Minimal authoring shape shared by the ad-level and per-slide validators —
 * the same adapter predicates (external/whatsapp/internal) stay the single
 * source of truth. phone is handled by the ad-level authoring only.
 */
type DestinationShape = {
  destinationType?: AdDestinationType | undefined;
  destination?: Record<string, unknown> | undefined;
};

/**
 * Live destination-payload validation — mirrors ads-service.validateAdInput
 * (same adapter predicates, adapter = source of truth) so the save button is
 * disabled before any upload happens. phone keeps the legacy permissive rules
 * (inventory checks happen at save time, as before).
 */
function destinationError(cfg: DestinationShape, validDeviceIds: ReadonlySet<string>): string | null {
  const type = cfg.destinationType ?? 'phone';
  if (type === 'phone') return null;

  if (type === 'external') {
    const ext = cfg.destination?.external as { url?: unknown } | undefined;
    const url = typeof ext?.url === 'string' ? ext.url : '';
    return isSafeExternalUrl(url) ? null : 'الوجهة الخارجية تتطلب رابطًا مطلقًا صالحًا (http/https)';
  }

  if (type === 'whatsapp') {
    const wa = cfg.destination?.whatsapp as { number?: unknown; message?: unknown } | undefined;
    const number = typeof wa?.number === 'string' ? wa.number : '';
    const message = typeof wa?.message === 'string' ? wa.message : '';
    if (!isValidWhatsAppNumber(number)) return 'الوجهة عبر واتساب تتطلب رقمًا صالحًا (8–15 رقمًا)';
    if (message.length > WHATSAPP_MESSAGE_MAX_LENGTH) return `رسالة واتساب تتجاوز الحد الأقصى (${WHATSAPP_MESSAGE_MAX_LENGTH} حرفًا)`;
    return null;
  }

  const internal = cfg.destination?.internal as { screen?: unknown; params?: unknown } | undefined;
  const screen = typeof internal?.screen === 'string' ? internal.screen : '';
  if (!(INTERNAL_AD_ALLOWLIST as readonly string[]).includes(screen)) return 'الوجهة الداخلية تتطلب اختيار شاشة من القائمة';
  if (screen === 'phone-details') {
    const params = internal?.params as Record<string, unknown> | undefined;
    const device = typeof params?.device === 'string' ? params.device.trim() : '';
    if (!device) return 'وجهة تفاصيل الهاتف تتطلب اختيار هاتف مرتبط';
    if (!validDeviceIds.has(device)) return 'الهاتف المحدد غير موجود في المخزون الحالي';
  }
  return null;
}

/**
 * Phase 4C — per-slide destination validation. Reuses the SAME adapter
 * predicates as destinationError (external/whatsapp/internal) so no competing
 * validation logic exists. A slide WITHOUT a destinationType (undefined)
 * INHERITS the ad destination → nothing to validate. 'phone' is never a valid
 * per-slide destination_type (00024 CHECK excludes it) — phone slides stay
 * expressed via ad_images.device_id (00021); a defensive phone value is
 * rejected explicitly.
 */
function slideDestinationError(
  item: { destinationType?: AdDestinationType; destination?: Record<string, unknown> },
  validDeviceIds: ReadonlySet<string>,
): string | null {
  const type = item.destinationType;
  if (type === undefined) return null;
  if (type === 'phone') return 'وجهة الهاتف غير مسموحة لكل شريحة — استخدم اختيار الهاتف (device_id)';
  return destinationError({ destinationType: type, destination: item.destination }, validDeviceIds);
}

function emptyMap(): Record<AdPlacement, AdConfig> {
  const init = {} as Record<AdPlacement, AdConfig>;
  for (const p of AD_PLACEMENTS) init[p] = emptyConfig();
  return init;
}

/**
 * Phase C + 00021 + 00024 — a placement gallery is an ordered list of images.
 * `existing` items are already in `ad_images`; `pending` items are local blob
 * previews uploaded only when the admin hits «حفظ ونشر». Each slide carries its
 * own device (deviceId, '' = none) and — Phase 4C — its own destination
 * override: destinationType ∈ {external, whatsapp, internal}; BOTH
 * destinationType and destination undefined = INHERIT the ad-level destination
 * (NULL/NULL on ad_images). 'phone' is never a per-slide destination_type —
 * phone slides stay expressed via ad_images.device_id (00021).
 */
type GalleryItem =
  | {
      kind: 'existing'; key: string; path: string; url: string; isCover: boolean; deviceId: string;
      destinationType?: AdDestinationType; destination?: Record<string, unknown>;
    }
  | {
      kind: 'pending'; key: string; url: string; isCover: boolean; deviceId: string; blob: Blob;
      destinationType?: AdDestinationType; destination?: Record<string, unknown>;
    };

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
          destinationType: img.destinationType,
          destination: img.destination,
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

  const patchSlide = (placement: AdPlacement, key: string, partial: Partial<GalleryItem>) => {
    setGalleries((prev) => ({
      ...prev,
      [placement]: (prev[placement] ?? []).map((it) => (it.key === key ? { ...it, ...partial } : it)),
    }));
  };

  /**
   * Phase 4C — per-slide destination type. '' resets the slide to INHERIT the
   * ad-level destination (NULL/NULL on ad_images → destinationType undefined).
   * Choosing a type starts with an EMPTY payload ({} → non-interactive adapter
   * until filled), mirroring the ad-level authoring.
   */
  const setSlideDestinationType = (placement: AdPlacement, key: string, type: string) => {
    if (type === '') {
      patchSlide(placement, key, { destinationType: undefined, destination: undefined });
      return;
    }
    const value = type as AdDestinationType;
    patchSlide(placement, key, { destinationType: value, destination: {} });
  };

  /**
   * Phase 4C — per-slide destination payload (external/whatsapp/internal).
   * Functional update merges into the slide's `destination` so editing one
   * field never drops the sibling fields of the same type.
   */
  const setSlideDestinationPayload = (
    placement: AdPlacement,
    key: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setGalleries((prev) => ({
      ...prev,
      [placement]: (prev[placement] ?? []).map((it) =>
        it.key === key ? { ...it, destination: updater(it.destination ?? {}) } : it,
      ),
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
      const validDeviceIds = new Set(devices.map((d) => d.id));
      const destError = destinationError(cfg, validDeviceIds);
      if (destError) {
        setStatus((prev) => ({ ...prev, [placement]: destError }));
        setBusy(null);
        return;
      }
      if (cfg.deviceId && !validDeviceIds.has(cfg.deviceId)) {
        setStatus((prev) => ({ ...prev, [placement]: 'الهاتف المحدد غير موجود في المخزون الحالي — أعد اختياره' }));
        setBusy(null);
        return;
      }
      const items = galleries[placement] ?? [];
      const slideDeviceIds = items.map((it) => it.deviceId ?? '');
      const missingDevice = slideDeviceIds.find((id) => id !== '' && !validDeviceIds.has(id));
      if (missingDevice) {
        setStatus((prev) => ({ ...prev, [placement]: 'هاتف إحدى الصور غير موجود في المخزون الحالي — أعد اختياره' }));
        setBusy(null);
        return;
      }
      const slideDestError = items
        .map((it) => slideDestinationError(it, validDeviceIds))
        .find((msg) => msg !== null);
      if (slideDestError) {
        setStatus((prev) => ({ ...prev, [placement]: slideDestError }));
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
      const destinationType = cfg.destinationType ?? 'phone';
      const input: Parameters<typeof saveAd>[0] = destinationType === 'phone'
        ? { placement, enabled: cfg.enabled, link: cfg.link, alt: cfg.alt, deviceId: cfg.deviceId, title: cfg.title ?? '' }
        : { placement, enabled: cfg.enabled, alt: cfg.alt, destinationType, destination: cfg.destination ?? {}, title: cfg.title ?? '' };
      await saveAd(input);
      if (items.length > 0) {
        // Phase 4C — per-slide destination arrays (''/undefined type + null
        // payload = INHERIT the ad destination, i.e. NULL/NULL). The service
        // picks the 00024 superset RPC only when at least one slide overrides;
        // legacy (00020/00021) calls stay unchanged otherwise.
        await replaceAdImages(
          placement,
          items.map((it) => pathByKey.get(it.key) ?? ''),
          items.map((it) => it.isCover),
          slideDeviceIds,
          items.map((it) => it.destinationType ?? ('')),
          items.map((it) => it.destination ?? null),
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

  const slideFieldStyle: React.CSSProperties = {
    width: '100%', fontSize: '0.62rem', marginTop: 2, padding: '2px', boxSizing: 'border-box',
    background: '#1e1e2e', color: '#f0f0f0', border: '1px solid #333', borderRadius: 4,
  };

  const slideCaptionStyle: React.CSSProperties = {
    color: '#666', fontSize: '0.6rem', marginTop: 3, textAlign: 'center',
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
        فيُشتق رابطها وقت العرض، أو منحها وجهة مستقلة (رابط خارجي / واتساب / شاشة داخلية) مع خيار
        «ترث من الإعلان» كافتراضي. التغييرات لا تنشر قبل الضغط على «حفظ ونشر».
      </p>

      {!loaded && <p style={{ color: '#888', fontSize: '0.8rem' }}>جارِ التحميل...</p>}

      {AD_PLACEMENTS.map((placement) => {
        const cfg = edits[placement];
        const items = galleries[placement] ?? [];
        const previewImage = cfg.image;
        const destType = cfg.destinationType ?? 'phone';
        const destExternalUrl = (cfg.destination?.external as { url?: string } | undefined)?.url ?? '';
        const destWhatsapp = cfg.destination?.whatsapp as { number?: string; message?: string } | undefined;
        const destWhatsappNumber = destWhatsapp?.number ?? '';
        const destWhatsappMessage = destWhatsapp?.message ?? '';
        const destInternal = cfg.destination?.internal as { screen?: string; params?: Record<string, string> } | undefined;
        const destInternalScreen = destInternal?.screen ?? '';
        const destInternalDevice = destInternal?.params?.device ?? '';
        const validDeviceIds = new Set(devices.map((d) => d.id));
        // Combined live validation: ad-level destination error OR any per-slide
        // destination error → disables «حفظ ونشر» before any upload happens.
        const liveError =
          destinationError(cfg, validDeviceIds)
          ?? items.map((it) => slideDestinationError(it, validDeviceIds)).find((msg) => msg !== null) ?? null;
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
                    {items.map((item, idx) => {
                      const slideDestType = item.destinationType;
                      const slideExtUrl = (item.destination?.external as { url?: string } | undefined)?.url ?? '';
                      const slideWa = item.destination?.whatsapp as { number?: string; message?: string } | undefined;
                      const slideWaNumber = slideWa?.number ?? '';
                      const slideWaMessage = slideWa?.message ?? '';
                      const slideInternal = item.destination?.internal as { screen?: string; params?: Record<string, string> } | undefined;
                      const slideInternalScreen = slideInternal?.screen ?? '';
                      const slideInternalDevice = slideInternal?.params?.device ?? '';
                      return (
                        <div
                          key={item.key}
                          style={{
                            width: slideDestType ? 210 : 72, border: item.isCover ? '2px solid #6366f1' : '1px solid #333',
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
                        <div style={slideCaptionStyle}>وجهة الشريحة</div>
                        <select
                          aria-label={`وجهة شريحة ${idx + 1}`}
                          data-testid={`ad-slide-dest-type-${idx}`}
                          value={slideDestType ?? ''}
                          onChange={(e) => setSlideDestinationType(placement, item.key, e.target.value)}
                          style={slideFieldStyle}
                        >
                          <option value="">ترث من الإعلان</option>
                          <option value="external">رابط خارجي</option>
                          <option value="whatsapp">واتساب</option>
                          <option value="internal">شاشة داخلية</option>
                        </select>
                        {slideDestType === 'external' && (
                          <input
                            type="text"
                            placeholder="https://..."
                            value={slideExtUrl}
                            onChange={(e) => setSlideDestinationPayload(placement, item.key, () => ({ external: { url: e.target.value } }))}
                            data-testid={`ad-slide-dest-url-${idx}`}
                            style={slideFieldStyle}
                          />
                        )}
                        {slideDestType === 'whatsapp' && (
                          <>
                            <input
                              type="text"
                              placeholder="رقم واتساب"
                              value={slideWaNumber}
                              onChange={(e) => setSlideDestinationPayload(placement, item.key, (d) => ({
                                whatsapp: { number: e.target.value, message: (d.whatsapp as { message?: string } | undefined)?.message ?? '' },
                              }))}
                              data-testid={`ad-slide-dest-wa-number-${idx}`}
                              style={slideFieldStyle}
                            />
                            <input
                              type="text"
                              placeholder="رسالة مبدئية (اختياري)"
                              value={slideWaMessage}
                              onChange={(e) => setSlideDestinationPayload(placement, item.key, (d) => ({
                                whatsapp: { number: (d.whatsapp as { number?: string } | undefined)?.number ?? '', message: e.target.value },
                              }))}
                              data-testid={`ad-slide-dest-wa-message-${idx}`}
                              style={slideFieldStyle}
                            />
                          </>
                        )}
                        {slideDestType === 'internal' && (
                          <>
                            <select
                              aria-label={`الشاشة الداخلية للشريحة ${idx + 1}`}
                              value={slideInternalScreen}
                              onChange={(e) => {
                                const screen = e.target.value;
                                setSlideDestinationPayload(placement, item.key, (d) => ({
                                  internal: {
                                    screen,
                                    params: screen === 'phone-details' ? { device: (d.internal as { params?: Record<string, string> } | undefined)?.params?.device ?? '' } : {},
                                  },
                                }));
                              }}
                              data-testid={`ad-slide-dest-screen-${idx}`}
                              style={slideFieldStyle}
                            >
                              <option value="">— الشاشة —</option>
                              {INTERNAL_AD_ALLOWLIST.map((screen) => (
                                <option key={screen} value={screen}>{INTERNAL_SCREEN_LABELS[screen]}</option>
                              ))}
                            </select>
                            {slideInternalScreen === 'phone-details' && (
                              <select
                                aria-label={`هاتف وجهة الشريحة ${idx + 1}`}
                                value={slideInternalDevice}
                                onChange={(e) => setSlideDestinationPayload(placement, item.key, (d) => ({
                                  internal: {
                                    screen: (d.internal as { screen?: string } | undefined)?.screen ?? 'phone-details',
                                    params: { device: e.target.value },
                                  },
                                }))}
                                data-testid={`ad-slide-dest-device-${idx}`}
                                style={slideFieldStyle}
                              >
                                <option value="">— اختر الهاتف —</option>
                                {devices.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {`${d.brand} ${d.model} ${d.variant ?? ''}`.trim()}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </div>
                      );
                    })}
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
                <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px', marginTop: '8px' }}>وجهة الإعلان</div>
                <div role="radiogroup" aria-label={`نوع الوجهة لـ ${PLACEMENT_LABELS[placement]}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {(Object.keys(DESTINATION_TYPE_LABELS) as AdDestinationType[]).map((type) => (
                    <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: type === destType ? '#f0f0f0' : '#888', fontSize: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`dest-type-${placement}`}
                        value={type}
                        checked={destType === type}
                        onChange={() => patch(placement, { destinationType: type, destination: {}, link: '', deviceId: '' })}
                      />
                      {DESTINATION_TYPE_LABELS[type]}
                    </label>
                  ))}
                </div>

                {destType === 'phone' && (
                  <>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>هاتف مرتبط (اختياري)</div>
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
                  </>
                )}

                {destType === 'external' && (
                  <div>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>رابط الوجهة الخارجية (http/https)</div>
                    <input
                      type="text"
                      placeholder="https://example.com/offer"
                      value={destExternalUrl}
                      onChange={(e) => patch(placement, { destination: { external: { url: e.target.value } } })}
                      data-testid="ad-external-url"
                      style={inputStyle}
                    />
                  </div>
                )}

                {destType === 'whatsapp' && (
                  <div>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>رقم واتساب (8–15 رقمًا)</div>
                    <input
                      type="text"
                      placeholder="+9665xxxxxxx"
                      value={destWhatsappNumber}
                      onChange={(e) => patch(placement, { destination: { whatsapp: { number: e.target.value, message: destWhatsappMessage } } })}
                      data-testid="ad-wa-number"
                      style={{ ...inputStyle, marginBottom: '8px' }}
                    />
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>رسالة مبدئية (اختياري، ≤1000 حرف)</div>
                    <input
                      type="text"
                      placeholder="مرحبًا، أستفسر عن..."
                      value={destWhatsappMessage}
                      onChange={(e) => patch(placement, { destination: { whatsapp: { number: destWhatsappNumber, message: e.target.value } } })}
                      data-testid="ad-wa-message"
                      style={inputStyle}
                    />
                  </div>
                )}

                {destType === 'internal' && (
                  <div>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>الشاشة الداخلية</div>
                    <select
                      aria-label={`الشاشة الداخلية لـ ${PLACEMENT_LABELS[placement]}`}
                      value={destInternalScreen}
                      onChange={(e) => {
                        const screen = e.target.value;
                        patch(placement, {
                          destination: {
                            internal: { screen, params: screen === 'phone-details' ? { device: '' } : {} },
                          },
                        });
                      }}
                      data-testid="ad-internal-screen"
                      style={{ ...inputStyle, marginBottom: '8px' }}
                    >
                      <option value="">— اختر الشاشة —</option>
                      {INTERNAL_AD_ALLOWLIST.map((screen) => (
                        <option key={screen} value={screen}>{INTERNAL_SCREEN_LABELS[screen]}</option>
                      ))}
                    </select>
                    {destInternalScreen === 'phone-details' && (
                      <div>
                        <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '4px' }}>هاتف مرتبط (مطلوب لشاشة تفاصيل الهاتف)</div>
                        <select
                          aria-label={`هاتف وجهة داخلي لـ ${PLACEMENT_LABELS[placement]}`}
                          value={destInternalDevice}
                          onChange={(e) => patch(placement, {
                            destination: { internal: { screen: destInternalScreen, params: { device: e.target.value } } },
                          })}
                          data-testid="ad-internal-device"
                          style={inputStyle}
                        >
                          <option value="">— اختر الهاتف —</option>
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {`${d.brand} ${d.model} ${d.variant ?? ''}`.trim()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <input
                  type="text"
                  placeholder="عنوان الإعلان (اختياري)"
                  value={cfg.title ?? ''}
                  onChange={(e) => patch(placement, { title: e.target.value })}
                  data-testid="ad-title"
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="نص بديل / وصف"
                  value={cfg.alt}
                  onChange={(e) => patch(placement, { alt: e.target.value })}
                  style={inputStyle}
                />
                {liveError && (
                  <div style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '6px' }}>{liveError}</div>
                )}
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
              <button style={btnStyle(true)} disabled={busy !== null || liveError !== null} onClick={() => save(placement)}>💾 حفظ ونشر</button>
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
