import {
  generateRepairCode,
  type RepairRequest, type RepairRequestStatus,
  type RepairQuote, type RepairTimelineEvent,
  type CourierJob, type CourierJobStatus,
  type Courier, type Technician,
  type DashboardData, type SearchFilter,
  type SyncResult,
  type RepairAuditEntry,
} from './repair-types';
import {
  getAllRepairRequests, getRepairRequest, saveRepairRequest,
  getRepairRequestByCode, searchRequests,
  getQuote, saveQuote,
  getAllTimelineEvents, addTimelineEvent,
  getAllCourierJobs, saveCourierJob,
  addStatusHistory, addAuditLog, getAuditLog,
  getAllCouriers, getCourier, saveCourier, deleteCourier,
  getAllTechnicians, getTechnician, saveTechnician, deleteTechnician,
  syncToSupabase, forceRecheckConnection, getHealthStatus,
} from './repair-database';

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function now(): string { return new Date().toISOString(); }
function collectDeviceInfo(): string { try { return navigator.userAgent || ''; } catch { return ''; } }

async function logAudit(params: { repairId: string | null; action: string; details: string; performedBy: string }): Promise<void> {
  try {
    await addAuditLog({
      id: uid(), repairId: params.repairId, action: params.action, details: params.details,
      performedBy: params.performedBy, performedById: null, ipAddress: '', userAgent: collectDeviceInfo(), createdAt: now(),
    });
  } catch { /* Intentionally ignored. */ }
}

async function logStatusChange(params: { repairId: string; fromStatus: string | null; toStatus: string; changedBy: string; note: string }): Promise<void> {
  try {
    await addStatusHistory({
      id: uid(), repairId: params.repairId, fromStatus: params.fromStatus, toStatus: params.toStatus,
      changedBy: params.changedBy, changedById: null, note: params.note, ipAddress: null, deviceInfo: null, createdAt: now(),
    });
  } catch { /* Intentionally ignored. */ }
}

// ── Singleton ───────────────────────────────────────────────────

class RepairRepository {
  // ═══════════════════════════════════════════════════════════════
  // REPAIR REQUESTS
  // ═══════════════════════════════════════════════════════════════

  async getAllRequests(): Promise<RepairRequest[]> { return getAllRepairRequests(); }

  async getRequestById(id: string): Promise<RepairRequest | null> { return getRepairRequest(id); }

  async getRequestByCode(code: string): Promise<RepairRequest | null> { return getRepairRequestByCode(code); }

  async search(query: string, filter: SearchFilter = 'all'): Promise<RepairRequest[]> {
    const results = await searchRequests(query);
    if (filter === 'all') return results;
    if (filter === 'active') return results.filter(r => !['Delivered', 'Archived', 'Cancelled'].includes(r.status));
    if (filter === 'archived') return results.filter(r => r.status === 'Archived');
    if (filter === 'delivered') return results.filter(r => r.status === 'Delivered');
    if (filter === 'pending') return results.filter(r => r.status === 'Pending');
    return results;
  }

  async createRequest(input: {
    customerName: string; customerPhone: string;
    brandName: string; modelName: string; condition?: string;
    issue: string; description: string;
    latitude: number | null; longitude: number | null;
    locationAccuracy: number | null; googleMapsLink: string | null;
    photoPaths: string[]; customerId: string | null;
  }): Promise<{ request: RepairRequest; code: string }> {
    const code = await this.#generateUniqueCode();
    const request: RepairRequest = {
      id: uid(), repairCode: code, status: 'Pending', adminNotes: '',
      createdAt: now(), updatedAt: now(),
      assignedCourierId: null, assignedTechnicianId: null,
      ...input,
      condition: input.condition ?? '',
      issue: input.issue as RepairRequest['issue'],
    };
    await saveRepairRequest(request);
    const verified = await getRepairRequest(request.id);
    if (!verified) throw new Error('فشل في حفظ الطلب. الرجاء المحاولة مرة أخرى.');

    await addTimelineEvent({
      id: uid(), repairId: request.id, status: 'Pending',
      note: 'طلب تصليح جديد', createdAt: now(), actor: 'customer',
    });
    await logStatusChange({
      repairId: request.id, fromStatus: null, toStatus: 'Pending',
      changedBy: 'customer', note: 'إنشاء طلب جديد',
    });
    await logAudit({
      repairId: request.id, action: 'Create Request',
      details: `${input.brandName} ${input.modelName} - ${input.issue}`,
      performedBy: input.customerName,
    });
    return { request, code };
  }

  async #generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = generateRepairCode();
      try {
        const exists = await getRepairRequestByCode(code);
        if (!exists) return code;
      } catch { return code; }
    }
    return generateRepairCode();
  }

  async updateRequest(id: string, updates: Partial<RepairRequest>): Promise<RepairRequest | null> {
    const request = await getRepairRequest(id);
    if (!request) return null;
    Object.assign(request, updates, { updatedAt: now() });
    await saveRepairRequest(request);
    await logAudit({
      repairId: id, action: 'Update Request',
      details: JSON.stringify(updates), performedBy: 'admin',
    });
    return request;
  }

  async updateStatus(id: string, status: RepairRequestStatus, note?: string): Promise<RepairRequest | null> {
    const request = await getRepairRequest(id);
    if (!request) return null;
    const prevStatus = request.status;
    request.status = status;
    request.updatedAt = now();
    await saveRepairRequest(request);
    await addTimelineEvent({
      id: uid(), repairId: id, status, note: note ?? status, createdAt: now(), actor: 'admin',
    });
    await logStatusChange({
      repairId: id, fromStatus: prevStatus, toStatus: status, changedBy: 'admin', note: note ?? '',
    });
    await logAudit({
      repairId: id, action: 'Update Status',
      details: `من ${prevStatus} إلى ${status}${note ? ` - ${note}` : ''}`,
      performedBy: 'admin',
    });
    return request;
  }

  async archiveRequest(id: string): Promise<RepairRequest | null> {
    return this.updateStatus(id, 'Archived', 'تم الأرشفة');
  }

  async archiveAllDelivered(): Promise<number> {
    const all = await getAllRepairRequests();
    const delivered = all.filter(r => r.status === 'Delivered');
    for (const r of delivered) {
      r.status = 'Archived';
      r.updatedAt = now();
      await saveRepairRequest(r);
      await addTimelineEvent({
        id: uid(), repairId: r.id, status: 'Archived',
        note: 'تم الأرشفة تلقائياً', createdAt: now(), actor: 'system',
      });
      await logAudit({ repairId: r.id, action: 'Archive', details: 'أرشفة تلقائية', performedBy: 'system' });
    }
    return delivered.length;
  }

  // ═══════════════════════════════════════════════════════════════
  // QUOTES
  // ═══════════════════════════════════════════════════════════════

  async getQuote(repairId: string): Promise<RepairQuote | null> { return getQuote(repairId); }

  async createQuote(repairId: string, estimatedPrice: number, estimatedDays: number, adminNotes: string, recommendedAction?: string | null): Promise<RepairQuote | null> {
    const request = await getRepairRequest(repairId);
    if (!request) return null;
    const quote: RepairQuote = {
      id: uid(), repairId, estimatedPrice, estimatedDays, adminNotes,
      recommendedAction: (recommendedAction ?? null) as RepairQuote['recommendedAction'],
      recommendationReason: null, sentAt: now(), approvedAt: null, rejectedAt: null, createdAt: now(),
    };
    await saveQuote(quote);
    await this.updateStatus(repairId, 'Received', `السعر: ${estimatedPrice} د.ج - المدة: ${estimatedDays} يوم`);
    await logAudit({
      repairId, action: 'Create Quote',
      details: `السعر: ${estimatedPrice} د.ج - المدة: ${estimatedDays} يوم`,
      performedBy: 'admin',
    });
    return quote;
  }

  async approveQuote(repairId: string): Promise<RepairRequest | null> {
    const quote = await getQuote(repairId);
    if (!quote) return null;
    quote.approvedAt = now();
    await saveQuote(quote);
    await this.updateStatus(repairId, 'Diagnosing', 'تم قبول السعر - جاري التشخيص');
    await logAudit({ repairId, action: 'Approve Quote', details: 'تم قبول السعر من قبل العميل', performedBy: 'customer' });
    return getRepairRequest(repairId);
  }

  async rejectQuote(repairId: string): Promise<RepairRequest | null> {
    const quote = await getQuote(repairId);
    if (!quote) return null;
    quote.rejectedAt = now();
    await saveQuote(quote);
    await this.updateStatus(repairId, 'Cancelled', 'تم رفض السعر من قبل العميل');
    return getRepairRequest(repairId);
  }

  // ═══════════════════════════════════════════════════════════════
  // ASSIGNMENT
  // ═══════════════════════════════════════════════════════════════

  async assignCourier(repairId: string, courierId: string, courierName: string): Promise<void> {
    const request = await getRepairRequest(repairId);
    if (!request) return;
    request.assignedCourierId = courierId;
    request.updatedAt = now();
    await saveRepairRequest(request);
    const job: CourierJob = {
      id: uid(), repairId, courierId, courierName,
      customerName: request.customerName, customerPhone: request.customerPhone,
      customerAddress: null, latitude: request.latitude, longitude: request.longitude,
      googleMapsLink: request.googleMapsLink, distance: null, status: 'Pending', notes: '',
      createdAt: now(), updatedAt: now(),
    };
    await saveCourierJob(job);
    await addTimelineEvent({
      id: uid(), repairId, status: request.status as RepairRequestStatus,
      note: `تم تعيين المندوب: ${courierName}`, createdAt: now(), actor: 'admin',
    });
    await logAudit({ repairId, action: 'Assign Courier', details: `المندوب: ${courierName}`, performedBy: 'admin' });
  }

  async assignTechnician(repairId: string, technicianId: string, technicianName: string): Promise<void> {
    const request = await getRepairRequest(repairId);
    if (!request) return;
    request.assignedTechnicianId = technicianId;
    request.updatedAt = now();
    await saveRepairRequest(request);
    await addTimelineEvent({
      id: uid(), repairId, status: request.status as RepairRequestStatus,
      note: `تم تعيين الفني: ${technicianName}`, createdAt: now(), actor: 'admin',
    });
    await logAudit({ repairId, action: 'Assign Technician', details: `الفني: ${technicianName}`, performedBy: 'admin' });
  }

  async getAllCourierJobs(courierId?: string): Promise<CourierJob[]> { return getAllCourierJobs(courierId); }

  async updateCourierJobStatus(jobId: string, status: CourierJobStatus): Promise<CourierJob | null> {
    const all = await getAllCourierJobs();
    const job = all.find(j => j.id === jobId);
    if (!job) return null;
    job.status = status;
    job.updatedAt = now();
    await saveCourierJob(job);
    await addTimelineEvent({
      id: uid(), repairId: job.repairId, status: status as unknown as RepairRequestStatus,
      note: `المندوب: ${status}`, createdAt: now(), actor: 'courier',
    });
    await logAudit({ repairId: job.repairId, action: 'Update Courier Status', details: `إلى ${status}`, performedBy: 'courier' });
    return job;
  }

  // ═══════════════════════════════════════════════════════════════
  // COURIERS
  // ═══════════════════════════════════════════════════════════════

  async getAllCouriers(): Promise<Courier[]> { return getAllCouriers(); }
  async getCourier(id: string): Promise<Courier | null> { return getCourier(id); }

  async saveCourier(courier: Courier): Promise<void> { await saveCourier(courier); }

  async deleteCourier(id: string): Promise<void> { await deleteCourier(id); }

  // ═══════════════════════════════════════════════════════════════
  // TECHNICIANS
  // ═══════════════════════════════════════════════════════════════

  async getAllTechnicians(): Promise<Technician[]> { return getAllTechnicians(); }
  async getTechnician(id: string): Promise<Technician | null> { return getTechnician(id); }

  async saveTechnician(technician: Technician): Promise<void> { await saveTechnician(technician); }

  async deleteTechnician(id: string): Promise<void> { await deleteTechnician(id); }

  // ═══════════════════════════════════════════════════════════════
  // TIMELINE
  // ═══════════════════════════════════════════════════════════════

  async getTimeline(repairId: string): Promise<RepairTimelineEvent[]> { return getAllTimelineEvents(repairId); }

  // ═══════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ═══════════════════════════════════════════════════════════════

  async getLogs(repairId?: string): Promise<RepairAuditEntry[]> { return getAuditLog(repairId); }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  async getDashboard(): Promise<DashboardData> {
    const all = await getAllRepairRequests();
    const couriers = await getAllCouriers();
    const technicians = await getAllTechnicians();
    const today = new Date().toDateString();

    const pending = all.filter(r => r.status === 'Pending').length;
    const received = all.filter(r => r.status === 'Received').length;
    const diagnosing = all.filter(r => r.status === 'Diagnosing').length;
    const waitingParts = all.filter(r => r.status === 'Waiting Parts').length;
    const repairing = all.filter(r => r.status === 'Repairing').length;
    const ready = all.filter(r => r.status === 'Ready').length;
    const delivered = all.filter(r => r.status === 'Delivered').length;
    const archived = all.filter(r => r.status === 'Archived').length;
    const deliveredToday = all.filter(r => r.status === 'Delivered' && new Date(r.updatedAt).toDateString() === today).length;

    const courierCounts: Record<string, number> = {};
    const techCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};
    all.forEach(r => {
      if (r.assignedCourierId) courierCounts[r.assignedCourierId] = (courierCounts[r.assignedCourierId] || 0) + 1;
      if (r.assignedTechnicianId) techCounts[r.assignedTechnicianId] = (techCounts[r.assignedTechnicianId] || 0) + 1;
      brandCounts[r.brandName] = (brandCounts[r.brandName] || 0) + 1;
    });

    const repairTimes = all.filter(r => r.status === 'Delivered')
      .map(r => (Date.now() - new Date(r.createdAt).getTime()) / 3600000);
    const avgRepairTime = repairTimes.length > 0 ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : 0;

    return {
      pending, received, diagnosing, waitingParts, repairing, ready, delivered, archived,
      deliveredToday, totalRepairs: all.length,
      topTechnicians: Object.entries(techCounts).map(([id, count]) => ({
        id, name: technicians.find(t => t.id === id)?.name || id, count,
      })).sort((a, b) => b.count - a.count).slice(0, 5),
      topCouriers: Object.entries(courierCounts).map(([id, count]) => ({
        id, name: couriers.find(c => c.id === id)?.name || id, count,
      })).sort((a, b) => b.count - a.count).slice(0, 5),
      averageRepairTimeHours: avgRepairTime,
      mostRepairedBrands: Object.entries(brandCounts).map(([brand, count]) => ({ brand, count }))
        .sort((a, b) => b.count - a.count).slice(0, 5),
      revenue: 0, quotesAccepted: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SYNC & CONNECTION
  // ═══════════════════════════════════════════════════════════════

  async syncToSupabase(): Promise<SyncResult> { return syncToSupabase(); }

  async checkConnection(): Promise<boolean> { return forceRecheckConnection(); }

  async getHealth() { return getHealthStatus(); }
}

let _instance: RepairRepository | null = null;

export function getRepairRepository(): RepairRepository {
  if (!_instance) _instance = new RepairRepository();
  return _instance;
}

export function resetRepairRepository(): void { _instance = null; }
