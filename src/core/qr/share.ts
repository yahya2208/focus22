export type SharePlatform = 'whatsapp' | 'telegram' | 'x' | 'facebook' | 'email' | 'copy';

export interface SharePayload {
  readonly url: string;
  readonly title?: string;
  readonly message?: string;
  readonly campaignId?: string;
}

export interface ShareResult {
  readonly platform: SharePlatform;
  readonly success: boolean;
  readonly error?: string;
}

export interface ShareConfig {
  readonly baseUrl: string;
  readonly defaultTitle: string;
  readonly defaultMessage: string;
}

const DEFAULT_SHARE_CONFIG: ShareConfig = {
  baseUrl: 'https://focus.app',
  defaultTitle: 'FOCUS - اختبر تركيزك',
  defaultMessage: 'اختبر تركيزك في أقل من دقيقة بدقة علمية!',
};

export function buildShareUrl(
  platform: SharePlatform,
  payload: SharePayload,
  config: ShareConfig = DEFAULT_SHARE_CONFIG,
): string {
  const encodedUrl = encodeURIComponent(payload.url);
  const encodedTitle = encodeURIComponent(payload.title ?? config.defaultTitle);
  const encodedMessage = encodeURIComponent(
    `${payload.message ?? config.defaultMessage} ${payload.url}`,
  );

  switch (platform) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodedMessage}`;
    case 'telegram':
      return `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    case 'email':
      return `mailto:?subject=${encodedTitle}&body=${encodedMessage}`;
    case 'copy':
      return payload.url;
    default:
      return payload.url;
  }
}

export function createShareHandler(config: ShareConfig = DEFAULT_SHARE_CONFIG) {
  return {
    share(platform: SharePlatform, payload: SharePayload): ShareResult {
      const url = buildShareUrl(platform, payload, config);

      if (platform === 'copy') {
        return { platform, success: true };
      }

      if (typeof window !== 'undefined' && platform === 'email') {
        window.location.href = url;
        return { platform, success: true };
      }

      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
        return { platform, success: true };
      }

      return { platform, success: false, error: 'Window not available' };
    },

    getShareUrl(platform: SharePlatform, payload: SharePayload): string {
      return buildShareUrl(platform, payload, config);
    },

    getAvailablePlatforms(): readonly SharePlatform[] {
      return ['whatsapp', 'telegram', 'x', 'facebook', 'email', 'copy'];
    },
  };
}

export const SHARE_PLATFORMS: { readonly platform: SharePlatform; readonly label: string; readonly icon: string }[] = [
  { platform: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { platform: 'telegram', label: 'Telegram', icon: '✈️' },
  { platform: 'x', label: 'X (Twitter)', icon: '𝕏' },
  { platform: 'facebook', label: 'Facebook', icon: '📘' },
  { platform: 'email', label: 'Email', icon: '📧' },
  { platform: 'copy', label: 'Copy Link', icon: '🔗' },
];
