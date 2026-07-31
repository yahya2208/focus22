export interface SmartOffer {
  id: string;
  type: 'discount' | 'free_accessory' | 'bonus_device' | 'trade_boost';
  title: string;
  description: string;
  discountPercent?: number;
  discountAmount?: number;
  targetDevice: { brand: string; model: string } | null;
  targetVisitorIds: string[];
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
  usageCount: number;
  maxUsage: number;
}

export interface TradePrice {
  brand: string;
  model: string;
  storage: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  buyPrice: number;
  sellPrice: number;
  profitMargin: number;
  suggestedSellPrice: number;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  brand: string;
  model: string;
  storage: string;
  sku: string;
  quantity: number;
  minThreshold: number;
  buyPrice: number;
  sellPrice: number;
  location: string;
  lastRestocked: string;
}

export interface StoreNotification {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  category: 'conversion' | 'inventory' | 'visitor' | 'campaign' | 'device';
  severity?: string;
  actionable?: boolean;
  actionLabel?: string;
  actionScreen?: string;
  actionPayload?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  joinDate: string;
  totalSales: number;
  totalRevenue: number;
  conversionRate: number;
  avgTicket: number;
  customersServed: number;
  rating: number;
  monthlyTrend: number[];
}

export interface BranchData {
  id: string;
  name: string;
  location: string;
  totalVisitors?: number;
  totalSales?: number;
  conversionRate?: number;
  revenue?: number;
  totalTransactions?: number;
  totalRevenue?: number;
  avgConversion?: number;
  topDevices?: Array<{ model: string; count: number }>;
  performance?: Array<{ date: string; transactions: number; revenue: number }>;
}

export interface AIQueryResult {
  query: string;
  answer: string;
  confidence: number;
  data?: Record<string, unknown>;
  chartType?: 'bar' | 'line' | 'funnel' | 'table';
  chartData?: Array<Record<string, unknown>>;
}

export interface VisitorScore {
  userId: string;
  displayName: string;
  score: number;
  stars: number;
  purchaseProbability: number;
  deviceInfo: string;
  lastCampaign: string | null;
  lastVisit: string;
  visitCount: number;
  gameCount: number;
  keyFactor: string;
}
