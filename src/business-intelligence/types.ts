export interface CommandCenterData {
  today: TodaySummary;
  topTradeInDevice: { brand: string; model: string; count: number } | null;
  bestCampaign: { name: string; score: number } | null;
  worstCampaign: { name: string; score: number } | null;
  opportunities: Opportunity[];
  hourlyDistribution: { hour: number; visitors: number; players: number; trades: number }[];
}

export interface TodaySummary {
  visitors: number;
  players: number;
  tradeRequests: number;
  whatsappClicks: number;
  customers: number;
  conversionRate: number;
}

export interface Opportunity {
  userId: string;
  displayName: string;
  visitCount: number;
  gameCount: number;
  lastVisit: string;
  deviceInfo: string;
  tradeRequested: boolean;
  whatsappClicked: boolean;
  bestFocusScore: number;
  campaignSource: string | null;
  lastDevice?: string;
  timeSinceLastVisit?: string;
}

export interface CustomerProfile {
  userId: string;
  displayName: string;
  role: string;
  firstVisit: string;
  lastVisit: string;
  totalVisits: number;
  totalGames: number;
  bestFocusScore: number;
  avgFocusScore: number;
  worstFocusScore: number;
  avgReactionTime: number;
  deviceInfo: string;
  deviceBrand: string;
  deviceModel: string;
  os: string;
  browser: string;
  whatsappClickCount: number;
  tradeOfferViewCount: number;
  tradeRequested: boolean;
  returnedAfterWeek: boolean;
  lastCampaign: string | null;
  timeline: TimelineEntry[];
  sessions: CustomerSession[];
}

export interface TimelineEntry {
  timestamp: string;
  eventType: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerSession {
  id: string;
  createdAt: string;
  status: string;
  avgRt: number;
  bestRt: number;
  focusScore: number;
  grade: string;
  consistencyRating: string;
  deviceInfo: string;
  campaignSource: string | null;
}

export interface DeviceInsight {
  os: string;
  totalCount: number;
  brands: DeviceBrandInsight[];
}

export interface DeviceBrandInsight {
  brand: string;
  count: number;
  models: DeviceModelInsight[];
}

export interface DeviceModelInsight {
  model: string;
  marketingName: string;
  count: number;
  specs: {
    ram: string;
    cpuCores: number | null;
    refreshRate: number | null;
    resolution: string;
    browser: string;
  };
  avgFocusScore: number;
  avgReactionTime: number;
  tradeRequests: number;
  whatsappClicks: number;
  campaigns: string[];
  lastSeen: string;
  weeklyTrend: { date: string; count: number }[];
  tradeRate: number;
}

export interface CommerceFunnel {
  stages: FunnelStage[];
  totalDropOff: number;
  criticalDropOff: { from: string; to: string; dropRate: number } | null;
}

export interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
  dropFromPrevious: number;
}

/** QR scan count from the campaign QR funnel. `available:false` = read error,
 *  must NOT be rendered as a zero (Error ≠ Zero). */
export interface QrScanCount {
  available: boolean;
  scans: number;
}

export interface AIInsight {
  type: 'opportunity' | 'problem' | 'alert' | 'recommendation';
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  metric?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface Prediction {
  visitorId: string;
  purchaseProbability: number;
  whatsappProbability: number;
  returnProbability: number;
  needsDiscount: boolean;
}

export interface HotDevice {
  brand: string;
  model: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  weeklyChange: number;
}

export interface TreasureModeData {
  opportunities: Opportunity[];
  problems: AIInsight[];
  alerts: AIInsight[];
  recommendations: AIInsight[];
  hotDevices: HotDevice[];
  todaySummary: TodaySummary;
}

export type BIDashboardId = 'treasure' | 'command' | 'customers' | 'devices' | 'campaigns' | 'commerce'
  | 'actions' | 'smart-offers' | 'trade-prices' | 'inventory' | 'notifications' | 'ai-assistant' | 'staff' | 'opportunities' | 'competitive'
  | 'ceo' | 'recommendations' | 'feedback' | 'rules' | 'quality' | 'phone-intelligence' | 'telemetry' | 'settings';

// ── Phone Intelligence types ────────────────────────────────────────────────

export interface PhoneDeviceView {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  total_views: number;
  unique_views: number;
  card_views: number;
  detail_views: number;
  last_viewed_at: string | null;
}

export interface PhoneLowDemandItem {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  total_views: number;
  unique_views: number;
  detail_views: number;
  reason: 'zero_views' | 'low_views' | 'high_views_zero_detail' | 'ok';
}

export interface PhoneSearchAnalyticsRow {
  query: string;
  search_count: number;
  avg_results_count: number;
  selection_count: number;
  search_to_selection_rate: number;
}

export interface PhoneSearchWithoutSelection {
  query: string;
  search_count: number;
}

export interface PhoneSearchToPhone {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  selection_count: number;
  associated_search_count: number;
  search_to_selection_rate: number;
}

export interface PhoneDetailEngagement {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  card_views: number;
  detail_views: number;
  unique_viewers: number;
  unique_detail_viewers: number;
  detail_card_ratio: number;
}

export interface PhoneWhatsAppIntent {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  whatsapp_intents: number;
  clicks: number;
  ad_views: number;
}

export interface PhoneBrandAggregation {
  brand: string;
  model: string;
  variants: string;
  total_views: number;
  unique_views: number;
  detail_views: number;
  selections: number;
  whatsapp_intents: number;
  demand_score: number;
}

export interface PhoneDemandOverview {
  device_id: string;
  brand: string;
  model: string;
  variant: string;
  total_views: number;
  unique_views: number;
  detail_views: number;
  selections: number;
  whatsapp_intents: number;
  demand_score: number;
}

export interface PhoneIntelligenceData {
  time_range: string;
  brand_filter: string;
  top_viewed: PhoneDeviceView[];
  low_demand: PhoneLowDemandItem[];
  search_analytics: PhoneSearchAnalyticsRow[];
  search_without_selection: PhoneSearchWithoutSelection[];
  search_to_phone: PhoneSearchToPhone[];
  detail_engagement: PhoneDetailEngagement[];
  whatsapp_intent: PhoneWhatsAppIntent[];
  brand_aggregation: PhoneBrandAggregation[];
  demand_overview: PhoneDemandOverview[];
}
