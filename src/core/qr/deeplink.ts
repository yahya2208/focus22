import { parseCampaignParams, type CampaignParams } from './campaign';

export interface DeepLink {
  readonly raw: string;
  readonly baseUrl: string;
  readonly path: string;
  readonly campaign: CampaignParams;
  readonly referralCode: string | null;
  readonly isValid: boolean;
  readonly error: string | null;
}

export function parseDeepLink(url: string): DeepLink {
  try {
    const parsed = new URL(url);
    const campaign = parseCampaignParams(url);
    const referralCode = parsed.searchParams.get('ref') ?? null;
    return {
      raw: url,
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      path: parsed.pathname,
      campaign,
      referralCode,
      isValid: true,
      error: null,
    };
  } catch {
    return {
      raw: url,
      baseUrl: '',
      path: '',
      campaign: {
        campaign: null, location: null, school: null, company: null,
        event: null, version: null, language: null, source: null, referrer: null,
      },
      referralCode: null,
      isValid: false,
      error: 'Invalid URL format',
    };
  }
}

export function parseDeepLinkFromCurrentUrl(): DeepLink {
  if (typeof window !== 'undefined' && window.location) {
    return parseDeepLink(window.location.href);
  }
  return parseDeepLink('https://focus.app');
}

export function createLandingSession(deepLink: DeepLink): LandingSession {
  return {
    deepLink,
    campaignDetected: deepLink.campaign.campaign !== null,
    referralDetected: deepLink.referralCode !== null,
    startedAt: Date.now(),
    source: deepLink.campaign.source ?? deepLink.campaign.campaign ?? 'direct',
  };
}

export interface LandingSession {
  readonly deepLink: DeepLink;
  readonly campaignDetected: boolean;
  readonly referralDetected: boolean;
  readonly startedAt: number;
  readonly source: string;
}

export function buildDeepLink(
  baseUrl: string,
  options: {
    campaign?: string;
    referrer?: string;
    source?: string;
    language?: string;
    location?: string;
  } = {},
): string {
  const url = new URL(baseUrl);
  if (options.campaign) url.searchParams.set('campaign', options.campaign);
  if (options.referrer) url.searchParams.set('referrer', options.referrer);
  if (options.source) url.searchParams.set('source', options.source);
  if (options.language) url.searchParams.set('language', options.language);
  if (options.location) url.searchParams.set('location', options.location);
  return url.toString();
}
