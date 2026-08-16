import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureAdsLoaded,
  getAd,
  subscribeAds,
  type AdConfig,
  type AdImage,
  type AdPlacement,
} from '../../services/ads-service';
import { AdSpot } from '../ads/AdSpot';
import { AdBanner, type AdBannerStatus } from '../ads/AdBanner';
import { recordIntent } from '../../services/intent-tracking';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { useNavigate, type ScreenName } from '../../store/navigation';
import { resolveDestination, resolveSlideDestination } from '../../services/ad-destination-resolver';
import { openExternalUrl } from '../../services/ad-adapters/external';
import { openWhatsApp } from '../../services/whatsapp-service';

interface AdContactBannerProps {
  placement: AdPlacement;
}

const EMPTY_AD: AdConfig = {
  enabled: false,
  image: '',
  link: '',
  alt: '',
  deviceId: '',
  destinationType: 'phone',
  destination: {},
  title: '',
  images: [],
};

function resolve(placement: AdPlacement): AdConfig | null {
  const ad = getAd(placement);
  if (!ad || !ad.enabled || !ad.image) return null;
  return ad;
}

/**
 * Ad Contact Banner — device-linked ads (Marketplace Mediator model §10, §17):
 * When the configured ad links to a phone (`#/phone-details?device=<id>`), the
 * MAIN IMAGE is a details surface: tapping it opens that device's details page
 * (FOCUS-AD-DETAILS) — it NEVER starts a WhatsApp handoff. The WhatsApp handoff
 * lives exclusively on a small corner "تواصل" button. The corner click records
 * `ad_click` then `whatsapp_handoff_started` (fire-and-forget), builds the
 * ad-click message with the ad's image URL and placement, and sends via
 * `useWhatsApp().send`. It NEVER opens a new tab, and never opens an image
 * viewer/zoom. Any other ad link keeps its normal anchor behaviour.
 *
 * M2 — View counting (§17): a view is recorded when the banner stays inside
 * the viewport at ≥ 0.6 visibility for ≥ 1 s (IntersectionObserver). NOT
 * counted: hidden render, preload, DOM creation, off-screen mount. Click and
 * view tracking are fire-and-forget and can never block the handoff.
 *
 * BATCH 4A fallback: a phone-format link whose device is NOT resolvable in
 * the current inventory renders as a NON-INTERACTIVE banner (never a dead
 * <a>, never a handoff attempt). The repair placement is never part of this
 * path — repair requests originate only from the repair flow.
 */
export const AdContactBanner = memo(function AdContactBanner({ placement }: AdContactBannerProps) {
  const [ad, setAd] = useState<AdConfig | null>(() => resolve(placement));
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const whatsapp = useWhatsApp();
  const navigate = useNavigate();

  // PHASE 2 — resolveDestination(ad) picks the adapter for this ad (phone /
  // external / whatsapp / internal today; destination_type missing → phone).
  // The phone logic lives in the PhoneDestinationAdapter (Step 2), the external
  // logic in the ExternalDestinationAdapter (Step 4), the whatsapp logic in the
  // WhatsAppDestinationAdapter (Step 5) and the internal logic in the
  // InternalDestinationAdapter (Step 6) — all behavior-preserving.
  const deps = useMemo(
    () => ({
      placement,
      navigateToDetails: (deviceId: string) => navigate.push('phone-details', { device: deviceId }),
      whatsappSend: (message: string, context: { action: 'inquiry'; deviceId: string }) =>
        whatsapp.send(message, context),
      openInNewTab: openExternalUrl,
      openChat: openWhatsApp,
      navigateTo: (screen: ScreenName, params?: Record<string, string>) => navigate.push(screen, params),
    }),
    [placement, navigate, whatsapp],
  );

  // PHASE 4E (00024) — single-image destination. An ad with exactly ONE image
  // resolves through the SAME per-image resolver the carousel uses
  // (resolveSlideDestination): a single image carrying its own destination
  // (destination_type + destination) wins; NULL/NULL (or a defensive 'phone')
  // falls back to the ad-level destination — so legacy single-image phone ads
  // behave EXACTLY as before. Multi-image ads keep the ad-level container
  // adapter (4D) — only the slides dispatch.
  const singleImage = useMemo(() => (ad && ad.images.length === 1 ? ad.images[0] : null), [ad]);
  const adapter = useMemo(() => {
    if (singleImage && ad) return resolveSlideDestination(ad, singleImage, deps);
    return resolveDestination(ad ?? EMPTY_AD, deps);
  }, [ad, singleImage, deps]);

  // 00024 — a single-image phone ad is interactive when the single image's
  // device (or the ad-level device fallback) resolves in the inventory.
  const singleImagePhone = adapter.type === 'phone' && singleImage != null && adapter.canOpenDetails(singleImage);

  // PHASE 4B (00024) — per-slide destination dispatch. Each carousel slide
  // resolves its OWN destination adapter:
  //   - the slide carries destination_type ∈ {external, whatsapp, internal} →
  //     the slide's own target (its payload, never the legacy phone link).
  //   - NULL/NULL (or a defensive 'phone') on the slide → inherit the ad-level
  //     destination; the phone adapter still drives per-slide device_id via
  //     ad.images, so inherited slides keep the existing carousel behavior.
  // Each slide resolves to exactly ONE adapter, so a slide never double-tracks
  // and never becomes a dead target.
  const resolveSlide = useCallback(
    (image: AdImage) => resolveSlideDestination(ad ?? EMPTY_AD, image, deps),
    [ad, deps],
  );

  const handleSlideAction = useCallback(
    (image: AdImage) => resolveSlide(image).callToAction(image),
    [resolveSlide],
  );
  const canSlideAction = useCallback(
    (image: AdImage) => resolveSlide(image).canCallToAction(image),
    [resolveSlide],
  );
  const handleSlideDetails = useCallback(
    (image: AdImage) => resolveSlide(image).openDetails(image),
    [resolveSlide],
  );
  const canSlideDetails = useCallback(
    (image: AdImage) => resolveSlide(image).canOpenDetails(image),
    [resolveSlide],
  );

  const deviceId = adapter.type === 'phone' ? (adapter.deviceId ?? undefined) : undefined;

  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setAd(resolve(placement));
      setFailed(false);
    };
    ensureAdsLoaded().then(update).catch(() => {});
    const unsubscribe = subscribeAds(update);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [placement]);

  const handleStateChange = useCallback((status: AdBannerStatus) => {
    if (status === 'failed') setFailed(true);
  }, []);

  useEffect(() => {
    if (!ad || viewedRef.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const node = containerRef.current;
    if (!node) return;

    let visible = false;
    let timer: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (visible) continue;
            visible = true;
            timer = window.setTimeout(() => {
              if (viewedRef.current) return;
              viewedRef.current = true;
              observer.disconnect();
              try {
                recordIntent({ kind: 'view', placement, deviceId });
              } catch {
                // fire-and-forget: tracking must never block anything
              }
            }, 1000);
          } else {
            visible = false;
            if (timer !== undefined) {
              window.clearTimeout(timer);
              timer = undefined;
            }
          }
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ad, placement, deviceId]);

  if (!ad || failed) return null;

  // A phone-linked ad is a single-target click: the banner is rendered
  // non-interactively (no focusable anchor underneath) and the overlay button
  // is the ONLY focusable/actionable target. Clicking navigates to the phone's
  // details page carrying `deviceId` — never to WhatsApp directly, never to an
  // image viewer. Non-phone ads keep their normal AdSpot anchor behaviour.
  //
  // BATCH 4A fallback: a phone-format link whose device is NOT resolvable in
  // the current inventory renders as a NON-INTERACTIVE banner (never a dead
  // <a>, never a navigation attempt). Resolvable → interactive overlay button.
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {adapter.type === 'external' ? (
        // External destination (Step 4): a valid absolute http(s) URL preserves
        // the safe external pattern (new tab, noopener, noreferrer). Invalid
        // destinations render NON-interactively — no anchor, no dead CTA.
        adapter.isValid ? (
          <a
            href={adapter.url}
            target="_blank"
            rel="noopener noreferrer"
            role="banner"
            aria-label={ad.alt || placement}
            style={{ display: 'block' }}
          >
            <AdBanner image={ad.image} images={ad.images} alt={ad.alt || placement} onStateChange={handleStateChange} />
          </a>
        ) : (
          <div role="banner" aria-label={ad.alt || placement}>
            <AdBanner image={ad.image} images={ad.images} alt={ad.alt || placement} onStateChange={handleStateChange} />
          </div>
        )
      ) : adapter.type === 'whatsapp' ? (
        // WhatsApp destination (Step 5): the whole banner is the chat target.
        // Single-frame ads get a full-frame overlay (no dead anchor — the chat
        // opens via the popup+fallback opener). Multi-frame ads let the
        // carousel own the interaction: each slide's corner CTA is bound to the
        // chat (NO full-frame overlay over slides/thumbnails). Invalid numbers
        // render NON-interactively — no button, no handoff attempt.
        adapter.isValid ? (
          <>
            <div role="banner" aria-label={ad.alt || placement}>
              <AdBanner
                image={ad.image}
                images={ad.images}
                alt={ad.alt || placement}
                onStateChange={handleStateChange}
                onSlideAction={handleSlideAction}
                canSlideAction={canSlideAction}
              />
            </div>
            {ad.images.length <= 1 && (
              <button
                type="button"
                data-testid="ad-whatsapp-cta"
                aria-label={`${ad.alt || placement} — فتح المحادثة`}
                onClick={() => adapter.callToAction()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  zIndex: 1,
                }}
              />
            )}
          </>
        ) : (
          <div role="banner" aria-label={ad.alt || placement}>
            <AdBanner image={ad.image} images={ad.images} alt={ad.alt || placement} onStateChange={handleStateChange} />
          </div>
        )
      ) : adapter.type === 'internal' ? (
        // Internal destination (Step 6): the whole banner converts to in-app
        // navigation (screen + params from the allowlisted payload). Single-frame
        // ads get a full-frame overlay (no dead anchor); multi-frame ads let the
        // carousel own the interaction — each slide's corner CTA navigates (NO
        // full-frame overlay over slides/thumbnails). Invalid screens/params/
        // device render NON-interactively — no button, no navigation attempt.
        adapter.isValid ? (
          <>
            <div role="banner" aria-label={ad.alt || placement}>
              <AdBanner
                image={ad.image}
                images={ad.images}
                alt={ad.alt || placement}
                onStateChange={handleStateChange}
                onSlideAction={handleSlideAction}
                canSlideAction={canSlideAction}
              />
            </div>
            {ad.images.length <= 1 && (
              <button
                type="button"
                data-testid="ad-internal-cta"
                aria-label={`${ad.alt || placement} — عرض التفاصيل`}
                onClick={() => adapter.openDetails()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  zIndex: 1,
                }}
              />
            )}
          </>
        ) : (
          <div role="banner" aria-label={ad.alt || placement}>
            <AdBanner image={ad.image} images={ad.images} alt={ad.alt || placement} onStateChange={handleStateChange} />
          </div>
        )
      ) : adapter.type === 'phone' &&
        (adapter.hasSlideDevices || adapter.isContact || adapter.isUnresolvedPhoneLink || singleImagePhone) ? (
        <div role="banner" aria-label={ad.alt || placement}>
          <AdBanner
            image={ad.image}
            images={ad.images}
            alt={ad.alt || placement}
            onStateChange={handleStateChange}
            onSlideAction={handleSlideAction}
            canSlideAction={canSlideAction}
            onSlideDetails={handleSlideDetails}
            canSlideDetails={canSlideDetails}
          />
        </div>
      ) : (
        <AdSpot placement={placement} />
      )}
      {/* FOCUS-AD-DETAILS — single-frame phone-linked ads (no carousel) get the
          two surfaces here: the full-frame overlay opens the device's details
          page, the small corner button is the ONLY WhatsApp surface. Multi-frame
          ads let the carousel own the interaction, so NO full-frame overlay ever
          covers the slides/thumbnails. The main image NEVER converts directly. */}
      {ad.images.length <= 1 && adapter.type === 'phone' && (adapter.isContact || singleImagePhone) ? (
        <>
          <button
            type="button"
            data-testid="ad-contact-details"
            aria-label={`${ad.alt || placement} — عرض التفاصيل`}
            onClick={() => adapter.openDetails(singleImage ?? undefined)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              zIndex: 1,
            }}
          />
          <button
            type="button"
            data-testid="ad-contact-cta"
            aria-label={`${ad.alt || placement} — فتح المحادثة`}
            onClick={() => adapter.callToAction(singleImage ?? undefined)}
            style={{
              position: 'absolute',
              insetInlineEnd: '0.6rem',
              bottom: '0.6rem',
              zIndex: 3,
              padding: '0.45rem 0.85rem',
              borderRadius: '999px',
              border: 'none',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            تواصل
          </button>
        </>
      ) : null}
    </div>
  );
});
