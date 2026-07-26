export {
  generateQR, generateQRSvg, generateQRDataUrl, buildQrUrl, buildFocusQrUrl,
  type QRGenerateOptions, type QRResult,
} from './generate';

export {
  parseCampaignParams, parseCampaignFromQueryString, serializeCampaignParams,
  hasCampaign, createCampaignStore,
  type CampaignParams, type CampaignRecord, type CampaignStore, type CampaignStats,
} from './campaign';

export {
  buildShareUrl, createShareHandler, SHARE_PLATFORMS,
  type SharePlatform, type SharePayload, type ShareResult, type ShareConfig,
} from './share';

export {
  parseDeepLink, parseDeepLinkFromCurrentUrl, buildDeepLink, createLandingSession,
  type DeepLink, type LandingSession,
} from './deeplink';

export {
  createReferralEngine,
  type ReferralProfile, type ReferralStats, type ReferralScan, type ReferralEngine,
} from './referral';
