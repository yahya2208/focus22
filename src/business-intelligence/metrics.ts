/**
 * KPI Definition Layer — canonical metric definitions.
 * Every screen MUST reference these functions. No inline metric logic anywhere else.
 */

export interface MetricDef {
  id: string;
  label: string;
  labelAr: string;
  formula: string;
  unit: '%' | 'count' | 'currency' | 'ratio' | 'days';
  higherIsBetter: boolean;
  source: 'database' | 'computed' | 'external';
  min?: number;
  max?: number;
  description: string;
}

export interface MetricResult {
  value: number;
  definition: MetricDef;
  confidence: number;
  source: 'live' | 'demo' | 'partial';
}

export const METRICS = {
  tradeConversion: {
    id: 'trade_conversion',
    label: 'Trade Conversion',
    labelAr: 'تحويل الاستبدال',
    formula: 'trade_requests / completed_games',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة الزوار الذين أكملوا اللعبة ثم طلبوا استبدال جهازهم',
  },
  whatsappConversion: {
    id: 'whatsapp_conversion',
    label: 'WhatsApp Conversion',
    labelAr: 'تحويل واتساب',
    formula: 'whatsapp_clicks / trade_requests',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة من طلبوا استبدال ثم تواصلوا عبر واتساب',
  },
  campaignROI: {
    id: 'campaign_roi',
    label: 'Campaign ROI',
    labelAr: 'عائد الاستثمار للحملة',
    formula: '(sales * avg_profit) / campaign_cost',
    unit: 'ratio' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    description: 'كل 1 دينار مصروف على الحملة يولد X دينار ربحًا',
  },
  visitorToGame: {
    id: 'visitor_to_game',
    label: 'Visitor → Game Rate',
    labelAr: 'تحويل الزائر إلى لاعب',
    formula: 'players / visitors',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة الزوار الذين بدؤوا اللعبة',
  },
  gameCompletionRate: {
    id: 'game_completion',
    label: 'Game Completion Rate',
    labelAr: 'نسبة إكمال اللعبة',
    formula: 'completed_games / started_games',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة الذين بدؤوا اللعبة وأكملوها',
  },
  avgRevenuePerVisitor: {
    id: 'arpv',
    label: 'Avg Revenue Per Visitor',
    labelAr: 'متوسط الإيراد لكل زائر',
    formula: 'total_revenue / unique_visitors',
    unit: 'currency' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    description: 'متوسط ما يُحقق من إيرادات لكل زائر يدخل المتجر',
  },
  returnRate: {
    id: 'return_rate',
    label: 'Return Rate',
    labelAr: 'نسبة العودة',
    formula: 'returning_visitors / unique_visitors',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة الزوار الذين عادوا للمتجر مرة أخرى',
  },
  deviceTradeRate: {
    id: 'device_trade_rate',
    label: 'Device Trade Rate',
    labelAr: 'نسبة استبدال الجهاز',
    formula: 'trade_requests_for_device / total_device_visitors',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة زوار جهاز معين الذين طلبوا استبداله',
  },
  staffConversion: {
    id: 'staff_conversion',
    label: 'Staff Conversion',
    labelAr: 'تحويل الموظف',
    formula: 'employee_sales / employee_customers_served',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة العملاء الذين تعاملوا مع الموظف وأتموا عملية شراء',
  },
  profitMargin: {
    id: 'profit_margin',
    label: 'Profit Margin',
    labelAr: 'هامش الربح',
    formula: '(sell_price - buy_price) / sell_price',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'هامش الربح على الأجهزة المباعة',
  },
  stockCoverage: {
    id: 'stock_coverage',
    label: 'Stock Coverage',
    labelAr: 'تغطية المخزون',
    formula: 'current_stock / min_threshold',
    unit: 'ratio' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    description: 'نسبة المخزون الحالي إلى الحد الأدنى المطلوب',
  },
  offerRedemption: {
    id: 'offer_redemption',
    label: 'Offer Redemption Rate',
    labelAr: 'نسبة استرداد العرض',
    formula: 'offer_used / offer_sent',
    unit: '%' as const,
    higherIsBetter: true,
    source: 'computed' as const,
    min: 0,
    max: 100,
    description: 'نسبة العملاء الذين استخدموا العرض بعد استلامه',
  },
} as const;

export type MetricId = keyof typeof METRICS;

export function getMetricDef(id: MetricId): MetricDef {
  return METRICS[id] as unknown as MetricDef;
}

export function computeMetric(
  id: MetricId,
  numerator: number,
  denominator: number,
  options?: { confidence?: number; isDemo?: boolean },
): MetricResult {
  const def = getMetricDef(id);
  const value = denominator === 0 ? 0 : Math.round((numerator / denominator) * (def.unit === '%' ? 100 : 1) * 100) / 100;
  return {
    value,
    definition: def,
    confidence: options?.confidence ?? 100,
    source: options?.isDemo ? 'demo' : value > 0 ? 'live' : 'partial',
  };
}

export function reportMetrics(metrics: MetricResult[]): string {
  const lines = metrics.map(m =>
    `[${m.source.toUpperCase()}] ${m.definition.labelAr}: ${m.value}${m.definition.unit} (ثقة: ${m.confidence}%)`
  );
  return lines.join('\n');
}

export function evaluateMetric(value: number, def: MetricDef): {
  rating: 'excellent' | 'good' | 'average' | 'poor' | 'critical';
  color: 'green' | 'blue' | 'yellow' | 'orange' | 'red';
} {
  if (def.max == null) {
    if (value > 80) return { rating: 'excellent', color: 'green' };
    if (value > 50) return { rating: 'good', color: 'blue' };
    if (value > 20) return { rating: 'average', color: 'yellow' };
    return { rating: 'poor', color: 'orange' };
  }
  const pct = value / def.max;
  if (pct >= 0.8) return { rating: 'excellent', color: 'green' };
  if (pct >= 0.6) return { rating: 'good', color: 'blue' };
  if (pct >= 0.3) return { rating: 'average', color: 'yellow' };
  if (pct >= 0.1) return { rating: 'poor', color: 'orange' };
  return { rating: 'critical', color: 'red' };
}
