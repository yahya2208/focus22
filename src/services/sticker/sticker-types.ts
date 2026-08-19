import type { WisdomCategory } from '../../data/wisdom-database';

export type StickerType =
  | 'focus_game'
  | 'repair'
  | 'buy_phone'
  | 'sell_phone'
  | 'exchange'
  | 'phone_evaluation'
  | 'best_offers'
  | 'used_phones'
  | 'new_phones'
  | 'store_services';

export type ContentType = 'wisdom' | 'question';
export type QuoteMode = 'single' | 'category' | 'random';
export type StickerMode = 'same' | 'different' | 'mixed';
export type LayoutMode = '3x3' | '2x3' | '3x4';

export type StickerTheme =
  | 'classic'
  | 'modern'
  | 'minimal'
  | 'dark'
  | 'gold'
  | 'glass'
  | 'kids'
  | 'business'
  | 'elegant'
  | 'neon';

export type StickerCTA =
  | 'play_game'
  | 'repair_phone'
  | 'exchange_phone'
  | 'evaluate_phone'
  | 'request_price'
  | 'view_offers'
  | 'buy_phone'
  | 'sell_phone'
  | 'recover_data'
  | 'join_challenge';

export interface StickerConfig {
  type: StickerType;
  contentType: ContentType;
  quoteMode: QuoteMode;
  stickerMode: StickerMode;
  quoteId?: string;
  quoteCategory?: WisdomCategory;
  copies: number;
  layout: LayoutMode;
  colorScheme: 'dark' | 'light' | 'amoled' | 'highcontrast';
  theme: StickerTheme;
  showCropMarks: boolean;
  showContact: boolean;
  showQR: boolean;
  customMessage?: string;
}

export interface StickerContent {
  type: StickerType;
  contentType: ContentType;
  title: string;
  message: string;
  wisdom: string;
  wisdomSource: string;
  icon: string;
  accentColor: string;
  qrUrl: string;
  serialNumber: string;
  campaign: string;
  cta: StickerCTA;
  printDate: string;
}

export interface StickerPage {
  stickers: StickerContent[];
  pageNumber: number;
}

export interface StickerPrintBatch {
  id: string;
  serialStart: number;
  serialEnd: number;
  count: number;
  campaign: string;
  stickerType: StickerType;
  contentType: ContentType;
  theme: StickerTheme;
  cta: StickerCTA;
  location?: string;
  printedAt: string;
}

export interface StickerScanEvent {
  id: string;
  serialNumber: string;
  campaign: string;
  scannedAt: string;
  location?: string;
  cta: StickerCTA;
}

export interface StickerAnalyticsRow {
  serialNumber: string;
  scans: number;
  gameStarted: number;
  gameCompleted: number;
  whatsapp: number;
  repair: number;
  purchase: number;
  exchange: number;
}

export interface CampaignHeatMapEntry {
  location: string;
  scans: number;
  rating: number;
}

export interface WisdomAnalytics {
  wisdomId: string;
  text: string;
  scans: number;
}

export interface AISuggestion {
  type: 'insight' | 'recommendation' | 'tip';
  messageKey: string;
  confidence: number;
}

export const STICKER_CTA_LABEL_KEYS: Record<StickerCTA, string> = {
  play_game: 'sticker.cta.playGame',
  repair_phone: 'sticker.cta.repairPhone',
  exchange_phone: 'sticker.cta.exchangePhone',
  evaluate_phone: 'sticker.cta.evaluatePhone',
  request_price: 'sticker.cta.requestPrice',
  view_offers: 'sticker.cta.viewOffers',
  buy_phone: 'sticker.cta.buyPhone',
  sell_phone: 'sticker.cta.sellPhone',
  recover_data: 'sticker.cta.recoverData',
  join_challenge: 'sticker.cta.joinChallenge',
};

export const STICKER_CTA_URLS: Record<StickerCTA, (base: string, serial: string) => string> = {
  play_game: (b, s) => `${b}/game?ref=sticker&s=${s}`,
  repair_phone: (b, s) => `${b}/repair?ref=sticker&s=${s}`,
  exchange_phone: (b, s) => `${b}/phones?action=exchange&ref=sticker&s=${s}`,
  evaluate_phone: (b, s) => `${b}/evaluate?ref=sticker&s=${s}`,
  request_price: (b, s) => `${b}/quote?ref=sticker&s=${s}`,
  view_offers: (b, s) => `${b}/offers?ref=sticker&s=${s}`,
  buy_phone: (b, s) => `${b}/phones?action=buy&ref=sticker&s=${s}`,
  sell_phone: (b, s) => `${b}/phones?action=sell&ref=sticker&s=${s}`,
  recover_data: (b, s) => `${b}/data-recovery?ref=sticker&s=${s}`,
  join_challenge: (b, s) => `${b}/game?ref=sticker&s=${s}`,
};

export const STICKER_THEME_CONFIG: Record<StickerTheme, {
  labelKey: string;
  bg: string;
  text: string;
  accent: string;
  border: string;
  fontFamily: string;
  badgeBg: string;
  badgeText: string;
}> = {
  classic: {
    labelKey: 'sticker.theme.classic',
    bg: '#ffffff', text: '#1e293b', accent: '#6366f1',
    border: '#e2e8f0', fontFamily: 'serif',
    badgeBg: '#6366f1', badgeText: '#ffffff',
  },
  modern: {
    labelKey: 'sticker.theme.modern',
    bg: '#f8fafc', text: '#0f172a', accent: '#3b82f6',
    border: '#cbd5e1', fontFamily: 'sans-serif',
    badgeBg: '#3b82f6', badgeText: '#ffffff',
  },
  minimal: {
    labelKey: 'sticker.theme.minimal',
    bg: '#ffffff', text: '#334155', accent: '#000000',
    border: '#f1f5f9', fontFamily: 'sans-serif',
    badgeBg: '#000000', badgeText: '#ffffff',
  },
  dark: {
    labelKey: 'sticker.theme.dark',
    bg: '#0f172a', text: '#e2e8f0', accent: '#38bdf8',
    border: '#1e293b', fontFamily: 'sans-serif',
    badgeBg: '#38bdf8', badgeText: '#0f172a',
  },
  gold: {
    labelKey: 'sticker.theme.gold',
    bg: '#fffbeb', text: '#78350f', accent: '#f59e0b',
    border: '#fde68a', fontFamily: 'serif',
    badgeBg: '#f59e0b', badgeText: '#ffffff',
  },
  glass: {
    labelKey: 'sticker.theme.glass',
    bg: 'rgba(255,255,255,0.85)', text: '#1e293b', accent: '#8b5cf6',
    border: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif',
    badgeBg: 'rgba(139,92,246,0.8)', badgeText: '#ffffff',
  },
  kids: {
    labelKey: 'sticker.theme.kids',
    bg: '#fef9c3', text: '#713f12', accent: '#ec4899',
    border: '#fde68a', fontFamily: 'sans-serif',
    badgeBg: '#ec4899', badgeText: '#ffffff',
  },
  business: {
    labelKey: 'sticker.theme.business',
    bg: '#f1f5f9', text: '#0f172a', accent: '#2563eb',
    border: '#cbd5e1', fontFamily: 'sans-serif',
    badgeBg: '#2563eb', badgeText: '#ffffff',
  },
  elegant: {
    labelKey: 'sticker.theme.elegant',
    bg: '#faf5ff', text: '#3b0764', accent: '#a855f7',
    border: '#e9d5ff', fontFamily: 'serif',
    badgeBg: '#a855f7', badgeText: '#ffffff',
  },
  neon: {
    labelKey: 'sticker.theme.neon',
    bg: '#020617', text: '#f8fafc', accent: '#22d3ee',
    border: '#1e293b', fontFamily: 'sans-serif',
    badgeBg: '#22d3ee', badgeText: '#020617',
  },
};

export const STICKER_TYPES_CONFIG: Record<StickerType, {
  icon: string;
  accentColor: string;
  labelKey: string;
  defaultMessageKey: string;
  defaultCTA: StickerCTA;
}> = {
  focus_game: {
    icon: '🎯', accentColor: '#6366f1',
    labelKey: 'sticker.type.focusGame',
    defaultMessageKey: 'sticker.msg.focusChallenge',
    defaultCTA: 'play_game',
  },
  repair: {
    icon: '🔧', accentColor: '#f59e0b',
    labelKey: 'sticker.type.repair',
    defaultMessageKey: 'sticker.msg.repair',
    defaultCTA: 'repair_phone',
  },
  buy_phone: {
    icon: '📱', accentColor: '#10b981',
    labelKey: 'sticker.type.buyPhone',
    defaultMessageKey: 'sticker.msg.buyPhone',
    defaultCTA: 'buy_phone',
  },
  sell_phone: {
    icon: '💰', accentColor: '#8b5cf6',
    labelKey: 'sticker.type.sellPhone',
    defaultMessageKey: 'sticker.msg.sellPhone',
    defaultCTA: 'sell_phone',
  },
  exchange: {
    icon: '🔄', accentColor: '#ec4899',
    labelKey: 'sticker.type.exchange',
    defaultMessageKey: 'sticker.msg.exchange',
    defaultCTA: 'exchange_phone',
  },
  phone_evaluation: {
    icon: '📊', accentColor: '#14b8a6',
    labelKey: 'sticker.type.evaluation',
    defaultMessageKey: 'sticker.msg.evaluation',
    defaultCTA: 'evaluate_phone',
  },
  best_offers: {
    icon: '🏆', accentColor: '#f97316',
    labelKey: 'sticker.type.bestOffers',
    defaultMessageKey: 'sticker.msg.bestOffers',
    defaultCTA: 'view_offers',
  },
  used_phones: {
    icon: '♻️', accentColor: '#64748b',
    labelKey: 'sticker.type.usedPhones',
    defaultMessageKey: 'sticker.msg.usedPhones',
    defaultCTA: 'request_price',
  },
  new_phones: {
    icon: '🆕', accentColor: '#22c55e',
    labelKey: 'sticker.type.newPhones',
    defaultMessageKey: 'sticker.msg.newPhones',
    defaultCTA: 'buy_phone',
  },
  store_services: {
    icon: '🏪', accentColor: '#3b82f6',
    labelKey: 'sticker.type.storeServices',
    defaultMessageKey: 'sticker.msg.storeServices',
    defaultCTA: 'view_offers',
  },
};

export const LAYOUT_CONFIG: Record<LayoutMode, { cols: number; rows: number }> = {
  '3x3': { cols: 3, rows: 3 },
  '2x3': { cols: 2, rows: 3 },
  '3x4': { cols: 3, rows: 4 },
};
