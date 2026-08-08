export const REPAIR_ISSUES = [
  'Screen', 'Battery', 'Charging', 'Camera', 'Speaker',
  'Microphone', 'Network', 'Software', 'Water Damage',
  'No Power', 'Boot Loop', 'Other',
] as const;
export type RepairIssue = (typeof REPAIR_ISSUES)[number];

export type RepairRequestStatus =
  | 'Pending' | 'Received' | 'Diagnosing'
  | 'Waiting Parts' | 'Repairing' | 'Ready'
  | 'Delivered' | 'Archived' | 'Cancelled';

export interface Courier {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  vehicle: string;
  status: 'active' | 'inactive';
  notes: string;
  createdAt: string;
}

export interface Technician {
  id: string;
  name: string;
  phone: string;
  specialty: string;
  status: 'active' | 'inactive';
  notes: string;
  createdAt: string;
}

export interface DashboardData {
  pending: number;
  received: number;
  diagnosing: number;
  waitingParts: number;
  repairing: number;
  ready: number;
  delivered: number;
  archived: number;
  deliveredToday: number;
  totalRepairs: number;
  topTechnicians: { id: string; name: string; count: number }[];
  topCouriers: { id: string; name: string; count: number }[];
  averageRepairTimeHours: number;
  mostRepairedBrands: { brand: string; count: number }[];
  revenue: number;
  quotesAccepted: number;
}

export type SearchFilter = 'all' | 'active' | 'archived' | 'delivered' | 'pending';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export type CourierJobStatus =
  | 'Pending' | 'Trip Started' | 'Arrived'
  | 'Collected' | 'Heading To Store' | 'Delivered To Store'
  | 'Returning' | 'Returned';

export interface RepairRequest {
  id: string;
  repairCode: string;
  customerName: string;
  customerPhone: string;
  brandName: string;
  modelName: string;
  condition: string;
  issue: RepairIssue;
  description: string;
  deviceWorking?: string | null;
  lockScreen?: string | null;
  previouslyRepaired?: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  googleMapsLink: string | null;
  photoPaths: string[];
  status: RepairRequestStatus;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
  customerId: string | null;
  assignedCourierId: string | null;
  assignedTechnicianId: string | null;
}

export interface RepairQuote {
  id: string;
  repairId: string;
  estimatedPrice: number | null;
  estimatedDays: number | null;
  adminNotes: string;
  recommendedAction: 'repair' | 'replace' | 'exchange_offer' | null;
  recommendationReason: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

export interface RepairTimelineEvent {
  id: string;
  repairId: string;
  status: RepairRequestStatus | 'Quote Requested' | 'Quote Sent';
  note: string;
  createdAt: string;
  actor: 'customer' | 'admin' | 'courier' | 'technician' | 'system';
}

export interface CourierJob {
  id: string;
  repairId: string;
  courierId: string;
  courierName: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsLink: string | null;
  distance: number | null;
  status: CourierJobStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairNotification {
  id: string;
  repairId: string;
  type: 'whatsapp' | 'push' | 'in_app';
  recipient: 'customer' | 'admin' | 'courier';
  title: string;
  message: string;
  sentAt: string;
  readAt: string | null;
}

export interface RepairPhoto {
  id: string;
  repairId: string;
  path: string;
  uploadedAt: string;
}

export interface RepairCustomerProfile {
  customerPhone: string;
  customerName: string;
  totalRepairs: number;
  completedRepairs: number;
  failedRepairs: number;
  totalPaid: number;
  averageRepairCost: number;
  mostRepairedPhone: { brand: string; model: string; count: number } | null;
  mostCommonIssue: RepairIssue | null;
  lastRepair: { repairCode: string; status: RepairRequestStatus; createdAt: string } | null;
  repairSuccessRate: number;
  repairIds: string[];
}

export interface RepairBI {
  averageRepairTimeHours: number;
  repairSuccessRate: number;
  averageProfit: number;
  topIssues: { issue: RepairIssue; count: number }[];
  topBrands: { brand: string; count: number }[];
  repeatCustomers: number;
  courierPerformance: { courierId: string; courierName: string; totalJobs: number; completedJobs: number }[];
  pendingQuotes: number;
  failedRepairs: number;
  totalRepairs: number;
  totalRevenue: number;
  totalCost: number;
}

export interface RepairRecommendation {
  type: 'replace_warning' | 'common_issue' | 'repeat_customer';
  severity: 'info' | 'warning' | 'danger';
  message: string;
  detail: string;
}

export const REPAIR_STATUS_FLOW: RepairRequestStatus[] = [
  'Pending', 'Received', 'Diagnosing',
  'Waiting Parts', 'Repairing', 'Ready',
  'Delivered', 'Archived', 'Cancelled',
];

export const ACTIVE_STATUSES: RepairRequestStatus[] = [
  'Pending', 'Received', 'Diagnosing',
  'Waiting Parts', 'Repairing', 'Ready',
];

let _codeCounter = 0;
export function generateRepairCode(): string {
  const year = new Date().getFullYear().toString();
  _codeCounter = (_codeCounter % 999999) + 1;
  return `RP-${year}-${String(_codeCounter).padStart(6, '0')}`;
}

const TERMINAL_STATUSES: RepairRequestStatus[] = ['Delivered', 'Cancelled'];

export function getNextValidStatuses(current: RepairRequestStatus): RepairRequestStatus[] {
  if (TERMINAL_STATUSES.includes(current)) return [];
  const idx = REPAIR_STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx >= REPAIR_STATUS_FLOW.length - 1) return [];
  const forward = REPAIR_STATUS_FLOW.slice(idx + 1).filter(s => s !== 'Cancelled');
  return [...forward, 'Cancelled'];
}

export interface RepairStatusHistoryEntry {
  id: string;
  repairId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  changedById: string | null;
  note: string;
  createdAt: string;
}

export interface RepairAuditEntry {
  id: string;
  repairId: string | null;
  action: string;
  details: string;
  performedBy: string;
  performedById: string | null;
  createdAt: string;
}

export const REPAIR_TABLES = {
  REPAIR_REQUESTS: 'repair_requests',
  REPAIR_QUOTES: 'repair_quotes',
  REPAIR_TIMELINE: 'repair_timeline',
  REPAIR_COURIER_JOBS: 'repair_courier_jobs',
  REPAIR_NOTIFICATIONS: 'repair_notifications',
  REPAIR_PHOTOS: 'repair_photos',
  REPAIR_STATUS_HISTORY: 'repair_status_history',
  REPAIR_AUDIT_LOG: 'repair_audit_log',
  REPAIR_COURIERS: 'repair_couriers',
  REPAIR_TECHNICIANS: 'repair_technicians',
} as const;

export const REPAIR_TABLES_LEGACY_V1: Record<string, string> = {
  [REPAIR_TABLES.REPAIR_REQUESTS]: 'repair_requests_v1',
  [REPAIR_TABLES.REPAIR_QUOTES]: 'repair_quotes_v1',
  [REPAIR_TABLES.REPAIR_TIMELINE]: 'repair_timeline_v1',
  [REPAIR_TABLES.REPAIR_COURIER_JOBS]: 'repair_courier_jobs_v1',
  [REPAIR_TABLES.REPAIR_NOTIFICATIONS]: 'repair_notifications_v1',
  [REPAIR_TABLES.REPAIR_PHOTOS]: 'repair_photos_v1',
  [REPAIR_TABLES.REPAIR_STATUS_HISTORY]: 'repair_status_history_v1',
  [REPAIR_TABLES.REPAIR_AUDIT_LOG]: 'repair_audit_log_v1',
};
