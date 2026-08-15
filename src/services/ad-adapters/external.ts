/**
 * External destination adapter (PHASE 2 STEP 4).
 *
 * A `destination_type='external'` ad opens an absolute http(s) URL in a new
 * tab. This adapter is the SEPARATE external path: it never touches the legacy
 * phone `link`/`device_id`, and never calls `extractAdDeviceId`/`resolveAdDevice`
 * — no phone assumptions leak into the external flow.
 *
 * The URL comes from the Phase-1 destination payload (`destination.external.url`),
 * never from `ads.link`.
 *
 * Safety (never-dead-target):
 *   - Only absolute `http:` / `https:` URLs are accepted.
 *   - Rejected: `javascript:`, `data:`, `file:`, malformed URLs, relative URLs,
 *     unsupported schemes, whitespace-only/empty values.
 *   - An invalid destination is NON-INTERACTIVE: the four operations are no-ops
 *     and `isValid` is false, so no clickable/dead CTA can ever be produced.
 *
 * Valid destinations preserve the existing safe external behavior: new tab,
 * `noopener`, `noreferrer`.
 *
 * The adapter executes NO side effects at creation time; the URL opener is an
 * injected function invoked only from within the operations.
 */

import type { AdImage } from '../ads-service';

export interface ExternalDestinationAdapter {
  readonly type: 'external';
  /** The validated absolute http(s) URL. '' when invalid (non-interactive). */
  readonly url: string;
  /**
   * True only when the destination is a valid absolute http(s) URL. The
   * never-dead-target gate: false → all four operations are no-ops.
   */
  readonly isValid: boolean;
  canOpenDetails(image?: AdImage): boolean;
  openDetails(image?: AdImage): void;
  canCallToAction(image?: AdImage): boolean;
  callToAction(image?: AdImage): void;
}

export interface ExternalDestinationAdapterDeps {
  /** The candidate URL from the Phase-1 destination payload (external.url). */
  url: string;
  /** Opens the URL in a new tab (noopener, noreferrer). Injected for tests. */
  openInNewTab: (url: string) => void;
}

/**
 * Accepts only absolute http(s) URLs. Everything else — javascript:, data:,
 * file:, malformed, relative, other schemes, empty/whitespace — is rejected.
 */
export function isSafeExternalUrl(value: string): boolean {
  if (!value || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Opens an external URL in a new tab with noopener + noreferrer. Guards the URL
 * itself (defense in depth): an unsafe value never reaches window.open.
 */
export function openExternalUrl(url: string): void {
  if (!isSafeExternalUrl(url)) return;
  window.open(url.trim(), '_blank', 'noopener,noreferrer');
}

export function createExternalDestinationAdapter(deps: ExternalDestinationAdapterDeps): ExternalDestinationAdapter {
  const url = deps.url.trim();
  const isValid = isSafeExternalUrl(url);
  const effectiveUrl = isValid ? url : '';

  const canOpenDetails = (_image?: AdImage): boolean => isValid;
  const canCallToAction = (_image?: AdImage): boolean => isValid;

  const openDetails = (_image?: AdImage): void => {
    if (!isValid) return;
    deps.openInNewTab(effectiveUrl);
  };

  const callToAction = (_image?: AdImage): void => {
    if (!isValid) return;
    deps.openInNewTab(effectiveUrl);
  };

  return {
    type: 'external',
    url: effectiveUrl,
    isValid,
    canOpenDetails,
    openDetails,
    canCallToAction,
    callToAction,
  };
}
