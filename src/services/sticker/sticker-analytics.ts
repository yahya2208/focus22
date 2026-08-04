import type { StickerScanEvent, CampaignHeatMapEntry, AISuggestion } from './sticker-types';

export type { AISuggestion } from './sticker-types';

export interface AnalyticsSummary {
  totalScans: number;
  uniqueSerials: number;
  topCampaigns: { campaign: string; scans: number }[];
  topLocations: CampaignHeatMapEntry[];
  bestStickerToday: { serialNumber: string; scans: number } | null;
  scansByHour: number[];
  ctaBreakdown: Record<string, number>;
}

export function computeSummary(scans: StickerScanEvent[]): AnalyticsSummary {
  const serialSet = new Set<string>();
  const campaignMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  const hourBuckets = new Array(24).fill(0);
  const ctaMap = new Map<string, number>();

  for (const scan of scans) {
    serialSet.add(scan.serialNumber);
    campaignMap.set(scan.campaign, (campaignMap.get(scan.campaign) || 0) + 1);
    const loc = scan.location || 'unknown';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
    try {
      const hour = new Date(scan.scannedAt).getHours();
      hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
    } catch { /* Intentionally ignored. */ }
    ctaMap.set(scan.cta, (ctaMap.get(scan.cta) || 0) + 1);
  }

  const topCampaigns = Array.from(campaignMap.entries())
    .map(([campaign, scans]) => ({ campaign, scans }))
    .sort((a, b) => b.scans - a.scans);

  const topLocations: CampaignHeatMapEntry[] = Array.from(locationMap.entries())
    .map(([location, scans]) => ({
      location,
      scans,
      rating: scans >= 400 ? 5 : scans >= 200 ? 4 : scans >= 80 ? 3 : scans >= 30 ? 2 : 1,
    }))
    .sort((a, b) => b.scans - a.scans);

  const today = new Date().toISOString().slice(0, 10);
  const todayScans = scans.filter(e => e.scannedAt.slice(0, 10) === today);
  const todayMap = new Map<string, number>();
  for (const scan of todayScans) {
    todayMap.set(scan.serialNumber, (todayMap.get(scan.serialNumber) || 0) + 1);
  }
  let bestStickerToday: { serialNumber: string; scans: number } | null = null;
  for (const [serialNumber, count] of todayMap) {
    if (!bestStickerToday || count > bestStickerToday.scans) {
      bestStickerToday = { serialNumber, scans: count };
    }
  }

  const ctaKeys = ['play_game', 'repair_phone', 'exchange_phone', 'evaluate_phone',
    'request_price', 'view_offers', 'buy_phone', 'sell_phone', 'recover_data', 'join_challenge'];
  const ctaBreakdown: Record<string, number> = {};
  for (const key of ctaKeys) ctaBreakdown[key] = ctaMap.get(key) || 0;

  return {
    totalScans: scans.length,
    uniqueSerials: serialSet.size,
    topCampaigns,
    topLocations,
    bestStickerToday,
    scansByHour: hourBuckets,
    ctaBreakdown,
  };
}

export function getAISuggestions(summary: AnalyticsSummary): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  const { totalScans, scansByHour, topLocations, ctaBreakdown } = summary;

  if (totalScans < 10) {
    suggestions.push({
      type: 'tip',
      messageKey: 'sticker.suggestion.printMore',
      confidence: 0.6,
    });
  }

  const morningScans = scansByHour.slice(6, 12).reduce((a, b) => a + b, 0);
  const eveningScans = scansByHour.slice(17, 23).reduce((a, b) => a + b, 0);
  const totalDayScans = scansByHour.reduce((a, b) => a + b, 0);
  if (totalDayScans > 0 && morningScans > eveningScans) {
    suggestions.push({
      type: 'insight',
      messageKey: 'sticker.suggestion.morningPeak',
      confidence: 0.7,
    });
  } else if (totalDayScans > 0 && eveningScans > morningScans) {
    suggestions.push({
      type: 'insight',
      messageKey: 'sticker.suggestion.eveningPeak',
      confidence: 0.7,
    });
  }

  const topCta = Object.entries(ctaBreakdown).sort(([, a], [, b]) => b - a);
  const bestCta = topCta[0];
  if (bestCta && bestCta[1] > 0) {
    suggestions.push({
      type: 'recommendation',
      messageKey: 'sticker.suggestion.bestCTA',
      confidence: 0.75,
    });
  }

  const bestLocation = topLocations[0];
  if (bestLocation && bestLocation.scans > 10) {
    suggestions.push({
      type: 'recommendation',
      messageKey: 'sticker.suggestion.bestLocation',
      confidence: 0.8,
    });
  }

  suggestions.push({
    type: 'insight',
    messageKey: 'sticker.suggestion.shortQuotes',
    confidence: 0.65,
  });

  suggestions.push({
    type: 'recommendation',
    messageKey: 'sticker.suggestion.universityAudience',
    confidence: 0.7,
  });

  suggestions.push({
    type: 'recommendation',
    messageKey: 'sticker.suggestion.marketExchange',
    confidence: 0.75,
  });

  return suggestions;
}
