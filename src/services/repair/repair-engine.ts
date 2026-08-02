import { getGlobalTelemetry } from '../../core/telemetry';
import { EventTypes } from '../../core/analytics/events';
import {
  getAllRepairRequests as loadRequests,
  getRepairRequest, saveRepairRequest,
  getQuote, saveQuote, addTimelineEvent,
  saveCourierJob, getAllCourierJobs,
  addStatusHistory, addAuditLog,
  getRepairCodeExists as checkRepairCodeExists,
} from './repair-database';
import {
  generateRepairCode,
  type RepairRequest, type RepairRequestStatus,
  type RepairQuote, type CourierJob, type CourierJobStatus,
} from './repair-types';

function now(): string {
  return new Date().toISOString();
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function collectDeviceInfo(): string {
  try { return navigator.userAgent || ''; } catch { return ''; }
}

function collectIp(): string {
  return '';
}

// ── Collision-safe code generation ──────────────────────────

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = generateRepairCode();
    try {
      const exists = await checkRepairCodeExists(code);
      if (!exists) return code;
    } catch {
      return code;
    }
  }
  return generateRepairCode();
}

// ── Audit helper ─────────────────────────────────────────────

async function logAudit(params: {
  repairId: string | null; action: string; details: string;
  performedBy: string; performedById?: string | null;
}): Promise<void> {
  try {
    await addAuditLog({
      id: uid(), repairId: params.repairId,
      action: params.action, details: params.details,
      performedBy: params.performedBy,
      performedById: params.performedById ?? null,
      ipAddress: collectIp(), userAgent: collectDeviceInfo(),
      createdAt: now(),
    });
  } catch {
    // audit failure is non-critical
  }
}

// ── Status history helper ────────────────────────────────────

async function logStatusChange(params: {
  repairId: string; fromStatus: string | null; toStatus: string;
  changedBy: string; changedById?: string | null; note: string;
}): Promise<void> {
  try {
    await addStatusHistory({
      id: uid(), repairId: params.repairId,
      fromStatus: params.fromStatus, toStatus: params.toStatus,
      changedBy: params.changedBy,
      changedById: params.changedById ?? null,
      note: params.note, ipAddress: collectIp(),
      deviceInfo: collectDeviceInfo(), createdAt: now(),
    });
  } catch {
    // status history failure is non-critical
  }
}

// ── Create Repair Request ────────────────────────────────────

export async function createRepairRequest(input: {
  customerName: string; customerPhone: string;
  brandName: string; modelName: string;
  condition?: string;
  issue: string; description: string;
  latitude: number | null; longitude: number | null;
  locationAccuracy: number | null; googleMapsLink: string | null;
  photoPaths: string[]; customerId: string | null;
}): Promise<{ request: RepairRequest; code: string }> {
  const code = await generateUniqueCode();
  const request: RepairRequest = {
    id: uid(),
    repairCode: code,
    status: 'Pending',
    adminNotes: '',
    createdAt: now(),
    updatedAt: now(),
    assignedCourierId: null,
    assignedTechnicianId: null,
    ...input,
    condition: input.condition ?? '',
    issue: input.issue as RepairRequest['issue'],
  };
  await saveRepairRequest(request);

  // Verify by re-reading
  const verified = await getRepairRequest(request.id);
  if (!verified) {
    throw new Error('فشل في حفظ الطلب. الرجاء المحاولة مرة أخرى.');
  }

  await addTimelineEvent({
    id: uid(), repairId: request.id,
    status: 'Pending', note: 'طلب تصليح جديد', createdAt: now(), actor: 'customer',
  });

  await logStatusChange({
    repairId: request.id, fromStatus: null, toStatus: 'Pending',
    changedBy: 'customer', changedById: input.customerId ?? undefined, note: 'إنشاء طلب جديد',
  });

  await logAudit({
    repairId: request.id, action: 'Create Request',
    details: `${input.brandName} ${input.modelName} - ${input.issue}`,
    performedBy: input.customerName,
  });

  getGlobalTelemetry().track(EventTypes.REPAIR_REQUESTED, {
    repair_code: code, brand: input.brandName, model: input.modelName, issue: input.issue,
  });

  return { request, code };
}

// ── Quote Lifecycle ──────────────────────────────────────────

export async function createQuote(
  repairId: string,
  estimatedPrice: number,
  estimatedDays: number,
  adminNotes: string,
  recommendedAction?: 'repair' | 'replace' | 'exchange_offer' | null,
  recommendationReason?: string,
): Promise<RepairQuote> {
  const quote: RepairQuote = {
    id: uid(), repairId,
    estimatedPrice, estimatedDays, adminNotes,
    recommendedAction: recommendedAction ?? null,
    recommendationReason: recommendationReason ?? null,
    sentAt: now(), approvedAt: null, rejectedAt: null, createdAt: now(),
  };
  await saveQuote(quote);

  const request = await getRepairRequest(repairId);
  const prevStatus = request?.status ?? null;
  if (request) {
    await updateStatus(request, 'Received');
    await addTimelineEvent({
      id: uid(), repairId,
      status: 'Received', note: `السعر: ${estimatedPrice} د.ج - المدة: ${estimatedDays} يوم`,
      createdAt: now(), actor: 'admin',
    });
    await logStatusChange({
      repairId, fromStatus: prevStatus, toStatus: 'Received',
      changedBy: 'admin', note: `السعر: ${estimatedPrice} د.ج`,
    });
    await logAudit({
      repairId, action: 'Create Quote',
      details: `السعر: ${estimatedPrice} د.ج - المدة: ${estimatedDays} يوم`,
      performedBy: 'admin',
    });
  }

  getGlobalTelemetry().track(EventTypes.QUOTE_SENT, { repair_id: repairId, price: estimatedPrice, days: estimatedDays });
  return quote;
}

export async function approveQuote(repairId: string): Promise<RepairRequest | null> {
  const quote = await getQuote(repairId);
  if (!quote) return null;
  quote.approvedAt = now();
  await saveQuote(quote);

  const request = await getRepairRequest(repairId);
  const prevStatus = request?.status ?? null;
  if (!request) return null;
  await updateStatus(request, 'Diagnosing');
  await addTimelineEvent({
    id: uid(), repairId,
    status: 'Diagnosing', note: 'تم قبول السعر - جاري التشخيص', createdAt: now(), actor: 'customer',
  });
  await logStatusChange({
    repairId, fromStatus: prevStatus, toStatus: 'Diagnosing',
    changedBy: 'customer', note: 'قبول السعر',
  });
  await logAudit({
    repairId, action: 'Approve Quote',
    details: 'تم قبول السعر من قبل العميل',
    performedBy: 'customer',
  });
  getGlobalTelemetry().track(EventTypes.QUOTE_APPROVED, { repair_id: repairId });
  return request;
}

export async function rejectQuote(repairId: string): Promise<RepairRequest | null> {
  const quote = await getQuote(repairId);
  if (!quote) return null;
  quote.rejectedAt = now();
  await saveQuote(quote);

  const request = await getRepairRequest(repairId);
  const prevStatus = request?.status ?? null;
  if (!request) return null;
  await updateStatus(request, 'Cancelled');
  await addTimelineEvent({
    id: uid(), repairId,
    status: 'Cancelled', note: 'تم رفض السعر من قبل العميل', createdAt: now(), actor: 'customer',
  });
  await logStatusChange({
    repairId, fromStatus: prevStatus, toStatus: 'Cancelled',
    changedBy: 'customer', note: 'رفض السعر',
  });
  await logAudit({
    repairId, action: 'Reject Quote',
    details: 'تم رفض السعر من قبل العميل',
    performedBy: 'customer',
  });
  return request;
}

// ── Courier System ───────────────────────────────────────────

export async function assignCourier(repairId: string, courierId: string, courierName: string): Promise<CourierJob | null> {
  const request = await getRepairRequest(repairId);
  if (!request) return null;

  request.assignedCourierId = courierId;
  request.updatedAt = now();
  await saveRepairRequest(request);

  const prevStatus = request.status;
  await updateStatus(request, 'Received');

  const job: CourierJob = {
    id: uid(), repairId, courierId, courierName,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    customerAddress: null,
    latitude: request.latitude,
    longitude: request.longitude,
    googleMapsLink: request.googleMapsLink,
    distance: null,
    status: 'Pending',
    notes: '',
    createdAt: now(),
    updatedAt: now(),
  };
  await saveCourierJob(job);

  await addTimelineEvent({
    id: uid(), repairId,
    status: 'Received', note: `تم تعيين المندوب: ${courierName}`,
    createdAt: now(), actor: 'admin',
  });
  await logStatusChange({
    repairId, fromStatus: prevStatus, toStatus: 'Received',
    changedBy: 'admin', note: `تعيين مندوب: ${courierName}`,
  });
  await logAudit({
    repairId, action: 'Assign Courier',
    details: `المندوب: ${courierName} (${courierId})`,
    performedBy: 'admin',
  });
  getGlobalTelemetry().track(EventTypes.COURIER_ASSIGNED, { repair_id: repairId, courier_id: courierId });
  return job;
}

export async function updateCourierJobStatus(jobId: string, status: CourierJobStatus): Promise<CourierJob | null> {
  const all = await getAllCourierJobs();
  const job = all.find(j => j.id === jobId);
  if (!job) return null;
  const prevJobStatus = job.status;
  job.status = status;
  job.updatedAt = now();
  await saveCourierJob(job);

  const statusToEvent: Record<string, string> = {
    'Trip Started': EventTypes.COURIER_TRIP_STARTED,
    'Arrived': EventTypes.COURIER_ARRIVED,
    'Collected': EventTypes.COURIER_COLLECTED,
    'Heading To Store': EventTypes.COURIER_HEADING_STORE,
    'Delivered To Store': EventTypes.STORE_RECEIVED,
    'Returning': EventTypes.COURIER_RETURNING,
    'Returned': EventTypes.COURIER_RETURNED,
  };
  const eventName = statusToEvent[status] as string | undefined;
  if (eventName) getGlobalTelemetry().track(eventName as any, { repair_id: job.repairId, job_id: jobId });

  const request = await getRepairRequest(job.repairId);
  if (request && status === 'Collected') await updateStatus(request, 'Received');
  if (request && status === 'Delivered To Store') await updateStatus(request, 'Received');

  await addTimelineEvent({
    id: uid(), repairId: job.repairId,
    status: status as unknown as RepairRequestStatus,
    note: `المندوب: ${status}`,
    createdAt: now(), actor: 'courier',
  });
  await logAudit({
    repairId: job.repairId, action: 'Update Courier Status',
    details: `من ${prevJobStatus} إلى ${status}`,
    performedBy: 'courier',
  });
  return job;
}

// ── Status Updates ───────────────────────────────────────────

export async function updateRepairStatus(repairId: string, status: RepairRequestStatus, note?: string): Promise<RepairRequest | null> {
  const request = await getRepairRequest(repairId);
  if (!request) return null;
  const prevStatus = request.status;
  await updateStatus(request, status);
  await addTimelineEvent({
    id: uid(), repairId,
    status, note: note ?? status, createdAt: now(), actor: 'admin',
  });
  await logStatusChange({
    repairId, fromStatus: prevStatus, toStatus: status,
    changedBy: 'admin', note: note ?? '',
  });
  await logAudit({
    repairId, action: 'Update Status',
    details: `من ${prevStatus} إلى ${status}${note ? ` - ${note}` : ''}`,
    performedBy: 'admin',
  });
  return request;
}

async function updateStatus(request: RepairRequest, status: RepairRequestStatus): Promise<void> {
  request.status = status;
  request.updatedAt = now();
  await saveRepairRequest(request);

  const statusToEvent: Record<string, string> = {
    'Diagnosing': EventTypes.INSPECTION_STARTED,
    'Repairing': EventTypes.REPAIR_STARTED,
    'Waiting Parts': EventTypes.WAITING_PARTS,
    'Ready': EventTypes.REPAIR_COMPLETED,
    'Cancelled': EventTypes.REPAIR_FAILED,
    'Delivered': EventTypes.CUSTOMER_RECEIVED,
  };
  const eventName = statusToEvent[status] as string | undefined;
  if (eventName) getGlobalTelemetry().track(eventName as any, { repair_id: request.id, repair_code: request.repairCode });
}

// ── Analytics ────────────────────────────────────────────────

export async function getRepairAnalytics() {
  const requests = await loadRequests();
  const total = requests.length;
  const completed = requests.filter(r => r.status === 'Delivered').length;
  const failed = requests.filter(r => r.status === 'Cancelled').length;
  const pending = requests.filter(r => r.status === 'Pending').length;

  const nowMs = Date.now();
  const repairTimes = requests
    .filter(r => r.status === 'Delivered')
    .map(r => (nowMs - new Date(r.createdAt).getTime()) / 3600000);

  const successRate = total > 0 ? (completed / (total - pending || 1)) * 100 : 0;

  const issueCounts: Record<string, number> = {};
  requests.forEach(r => { issueCounts[r.issue] = (issueCounts[r.issue] || 0) + 1; });
  const topIssues = Object.entries(issueCounts)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const brandCounts: Record<string, number> = {};
  requests.forEach(r => { brandCounts[r.brandName] = (brandCounts[r.brandName] || 0) + 1; });
  const topBrands = Object.entries(brandCounts)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const uniqueCustomers = new Set(requests.filter(r => r.customerPhone).map(r => r.customerPhone));
  const repeatCustomers = Array.from(uniqueCustomers)
    .filter(phone => requests.filter(r => r.customerPhone === phone).length > 1).length;

  return {
    averageRepairTimeHours: repairTimes.length > 0
      ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : 0,
    repairSuccessRate: successRate,
    averageProfit: 0,
    topIssues,
    topBrands,
    repeatCustomers,
    pendingQuotes: pending,
    failedRepairs: failed,
    totalRepairs: total,
    totalRevenue: 0,
    totalCost: 0,
  };
}

export async function getRepairCodeExists(code: string): Promise<boolean> {
  return checkRepairCodeExists(code);
}
