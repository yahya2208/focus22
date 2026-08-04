import { getSupabaseClient } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './schema';
import type {
  RepairRequest, RepairQuote, RepairTimelineEvent,
  CourierJob, RepairNotification, RepairPhoto,
  RepairStatusHistoryEntry, RepairAuditEntry,
} from '../../services/repair/repair-types';

const reqFields = 'id,repair_code,customer_name,customer_phone,brand_name,model_name,condition,issue,description,device_working,lock_screen,previously_repaired,latitude,longitude,location_accuracy,google_maps_link,photo_paths,status,admin_notes,created_at,updated_at,customer_id,assigned_courier_id,assigned_technician_id';
const quoteFields = 'id,repair_id,estimated_price,estimated_days,admin_notes,recommended_action,recommendation_reason,sent_at,approved_at,rejected_at,created_at';
const timelineFields = 'id,repair_id,status,note,created_at,actor';
const courierFields = 'id,repair_id,courier_id,courier_name,customer_name,customer_phone,customer_address,latitude,longitude,google_maps_link,distance,status,notes,created_at,updated_at';
const notifFields = 'id,repair_id,type,recipient,title,message,sent_at,read_at';
const photoFields = 'id,repair_id,path,uploaded_at';

function mapRepairRequest(row: Database['repair_requests']['Row']): RepairRequest {
  return {
    id: row.id, repairCode: row.repair_code,
    customerName: row.customer_name, customerPhone: row.customer_phone,
    brandName: row.brand_name, modelName: row.model_name,
    condition: row.condition ?? 'New',
    issue: row.issue as RepairRequest['issue'], description: row.description ?? '',
    deviceWorking: row.device_working, lockScreen: row.lock_screen,
    previouslyRepaired: row.previously_repaired,
    latitude: row.latitude, longitude: row.longitude,
    locationAccuracy: row.location_accuracy,
    googleMapsLink: row.google_maps_link,
    photoPaths: Array.isArray(row.photo_paths) ? row.photo_paths : [],
    status: row.status as RepairRequest['status'], adminNotes: row.admin_notes ?? '',
    createdAt: row.created_at, updatedAt: row.updated_at,
    customerId: row.customer_id,
    assignedCourierId: row.assigned_courier_id,
    assignedTechnicianId: row.assigned_technician_id,
  };
}

function mapQuote(row: Database['repair_quotes']['Row']): RepairQuote {
  return {
    id: row.id, repairId: row.repair_id,
    estimatedPrice: row.estimated_price, estimatedDays: row.estimated_days,
    adminNotes: row.admin_notes ?? '',
    recommendedAction: row.recommended_action as RepairQuote['recommendedAction'],
    recommendationReason: row.recommendation_reason,
    sentAt: row.sent_at, approvedAt: row.approved_at,
    rejectedAt: row.rejected_at, createdAt: row.created_at,
  };
}

function mapTimelineEvent(row: Database['repair_timeline']['Row']): RepairTimelineEvent {
  return {
    id: row.id, repairId: row.repair_id,
    status: row.status as RepairTimelineEvent['status'], note: row.note ?? '',
    createdAt: row.created_at, actor: row.actor as RepairTimelineEvent['actor'],
  };
}

function mapCourierJob(row: Database['repair_courier_jobs']['Row']): CourierJob {
  return {
    id: row.id, repairId: row.repair_id,
    courierId: row.courier_id, courierName: row.courier_name,
    customerName: row.customer_name, customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    latitude: row.latitude, longitude: row.longitude,
    googleMapsLink: row.google_maps_link,
    distance: row.distance, status: row.status as CourierJob['status'],
    notes: row.notes ?? '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapNotification(row: Database['repair_notifications']['Row']): RepairNotification {
  return {
    id: row.id, repairId: row.repair_id,
    type: row.type as RepairNotification['type'], recipient: row.recipient as RepairNotification['recipient'],
    title: row.title, message: row.message,
    sentAt: row.sent_at, readAt: row.read_at,
  };
}

function mapPhoto(row: Database['repair_photos']['Row']): RepairPhoto {
  return {
    id: row.id, repairId: row.repair_id,
    path: row.path, uploadedAt: row.uploaded_at,
  };
}

export class RepairDataService {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async getAllRepairRequests(): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getRepairRequest(id: string): Promise<RepairRequest | null> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapRepairRequest(data) : null;
  }

  async saveRepairRequest(request: RepairRequest): Promise<void> {
    const { error } = await this.client.from('repair_requests').upsert({
      id: request.id, repair_code: request.repairCode,
      customer_name: request.customerName, customer_phone: request.customerPhone,
      brand_name: request.brandName, model_name: request.modelName,
      condition: request.condition,
      issue: request.issue, description: request.description,
      device_working: request.deviceWorking, lock_screen: request.lockScreen,
      previously_repaired: request.previouslyRepaired,
      latitude: request.latitude, longitude: request.longitude,
      location_accuracy: request.locationAccuracy,
      google_maps_link: request.googleMapsLink,
      photo_paths: JSON.stringify(request.photoPaths),
      status: request.status, admin_notes: request.adminNotes,
      created_at: request.createdAt, updated_at: request.updatedAt,
      customer_id: request.customerId,
      assigned_courier_id: request.assignedCourierId,
      assigned_technician_id: request.assignedTechnicianId,
    });
    if (error) throw error;
  }

  async deleteRepairRequest(id: string): Promise<void> {
    const { error } = await this.client.from('repair_requests').delete().eq('id', id);
    if (error) throw error;
  }

  async getRepairRequestsByCustomer(customerPhone: string): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('customer_phone', customerPhone).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getRepairRequestsByStatus(status: string): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('status', status).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getRepairRequestsByCourier(courierId: string): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('assigned_courier_id', courierId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getRepairRequestByCode(code: string): Promise<RepairRequest | null> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('repair_code', code).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapRepairRequest(data) : null;
  }

  async getRepairRequestsByName(name: string): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).ilike('customer_name', `%${name}%`).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getRepairRequestsByPhone(phone: string): Promise<RepairRequest[]> {
    const { data, error } = await this.client.from('repair_requests').select(reqFields).eq('customer_phone', phone).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairRequest);
  }

  async getAllQuotes(): Promise<RepairQuote[]> {
    const { data, error } = await this.client.from('repair_quotes').select(quoteFields).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapQuote);
  }

  async getQuote(repairId: string): Promise<RepairQuote | null> {
    const { data, error } = await this.client.from('repair_quotes').select(quoteFields).eq('repair_id', repairId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapQuote(data) : null;
  }

  async saveQuote(quote: RepairQuote): Promise<void> {
    const { error } = await this.client.from('repair_quotes').upsert({
      id: quote.id, repair_id: quote.repairId,
      estimated_price: quote.estimatedPrice, estimated_days: quote.estimatedDays,
      admin_notes: quote.adminNotes,
      recommended_action: quote.recommendedAction,
      recommendation_reason: quote.recommendationReason,
      sent_at: quote.sentAt, approved_at: quote.approvedAt,
      rejected_at: quote.rejectedAt, created_at: quote.createdAt,
    });
    if (error) throw error;
  }

  async getAllTimelineEvents(repairId?: string): Promise<RepairTimelineEvent[]> {
    let query = this.client.from('repair_timeline').select(timelineFields);
    if (repairId) query = query.eq('repair_id', repairId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTimelineEvent);
  }

  async addTimelineEvent(event: RepairTimelineEvent): Promise<void> {
    const { error } = await this.client.from('repair_timeline').insert({
      id: event.id, repair_id: event.repairId,
      status: event.status, note: event.note,
      created_at: event.createdAt, actor: event.actor,
    });
    if (error) throw error;
  }

  async getAllCourierJobs(courierId?: string): Promise<CourierJob[]> {
    let query = this.client.from('repair_courier_jobs').select(courierFields);
    if (courierId) query = query.eq('courier_id', courierId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapCourierJob);
  }

  async getCourierJobByRepair(repairId: string): Promise<CourierJob | null> {
    const { data, error } = await this.client.from('repair_courier_jobs').select(courierFields).eq('repair_id', repairId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapCourierJob(data) : null;
  }

  async saveCourierJob(job: CourierJob): Promise<void> {
    const { error } = await this.client.from('repair_courier_jobs').upsert({
      id: job.id, repair_id: job.repairId,
      courier_id: job.courierId, courier_name: job.courierName,
      customer_name: job.customerName, customer_phone: job.customerPhone,
      customer_address: job.customerAddress,
      latitude: job.latitude, longitude: job.longitude,
      google_maps_link: job.googleMapsLink,
      distance: job.distance, status: job.status,
      notes: job.notes, created_at: job.createdAt, updated_at: job.updatedAt,
    });
    if (error) throw error;
  }

  async getAllNotifications(repairId?: string): Promise<RepairNotification[]> {
    let query = this.client.from('repair_notifications').select(notifFields);
    if (repairId) query = query.eq('repair_id', repairId);
    const { data, error } = await query.order('sent_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapNotification);
  }

  async saveNotification(notification: RepairNotification): Promise<void> {
    const { error } = await this.client.from('repair_notifications').insert({
      id: notification.id, repair_id: notification.repairId,
      type: notification.type, recipient: notification.recipient,
      title: notification.title, message: notification.message,
      sent_at: notification.sentAt, read_at: notification.readAt,
    });
    if (error) throw error;
  }

  async getAllPhotos(repairId?: string): Promise<RepairPhoto[]> {
    let query = this.client.from('repair_photos').select(photoFields);
    if (repairId) query = query.eq('repair_id', repairId);
    const { data, error } = await query.order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPhoto);
  }

  async savePhoto(photo: RepairPhoto): Promise<void> {
    const { error } = await this.client.from('repair_photos').insert({
      id: photo.id, repair_id: photo.repairId,
      path: photo.path, uploaded_at: photo.uploadedAt,
    });
    if (error) throw error;
  }

  // ── Code collision check ──────────────────────────────────
  async getRepairCodeExists(code: string): Promise<boolean> {
    const { data, error } = await this.client.from('repair_requests').select('id').eq('repair_code', code).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  // ── Status History ────────────────────────────────────────
  async addStatusHistory(entry: RepairStatusHistoryEntry): Promise<void> {
    const { error } = await this.client.from('repair_status_history').insert({
      id: entry.id, repair_id: entry.repairId,
      from_status: entry.fromStatus, to_status: entry.toStatus,
      changed_by: entry.changedBy, changed_by_id: entry.changedById,
      note: entry.note, ip_address: entry.ipAddress,
      device_info: entry.deviceInfo, created_at: entry.createdAt,
    });
    if (error) throw error;
  }

  async getStatusHistory(repairId: string): Promise<RepairStatusHistoryEntry[]> {
    const { data, error } = await this.client.from('repair_status_history')
      .select('id,repair_id,from_status,to_status,changed_by,changed_by_id,note,ip_address,device_info,created_at')
      .eq('repair_id', repairId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Database['repair_status_history']['Row']) => ({
      id: r.id, repairId: r.repair_id,
      fromStatus: r.from_status, toStatus: r.to_status,
      changedBy: r.changed_by, changedById: r.changed_by_id,
      note: r.note, ipAddress: r.ip_address,
      deviceInfo: r.device_info, createdAt: r.created_at,
    }));
  }

  // ── Audit Log ─────────────────────────────────────────────
  async addAuditLog(entry: RepairAuditEntry): Promise<void> {
    const { error } = await this.client.from('repair_audit_log').insert({
      id: entry.id, repair_id: entry.repairId,
      action: entry.action, details: entry.details,
      performed_by: entry.performedBy, performed_by_id: entry.performedById,
      ip_address: entry.ipAddress, user_agent: entry.userAgent,
      created_at: entry.createdAt,
    });
    if (error) throw error;
  }

  async getAuditLog(repairId?: string): Promise<RepairAuditEntry[]> {
    let query = this.client.from('repair_audit_log').select('id,repair_id,action,details,performed_by,performed_by_id,ip_address,user_agent,created_at');
    if (repairId) query = query.eq('repair_id', repairId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Database['repair_audit_log']['Row']) => ({
      id: r.id, repairId: r.repair_id,
      action: r.action, details: r.details,
      performedBy: r.performed_by, performedById: r.performed_by_id,
      ipAddress: r.ip_address, userAgent: r.user_agent,
      createdAt: r.created_at,
    }));
  }

  // ── DB Health Check ───────────────────────────────────────
  async healthCheck(): Promise<{ connected: boolean; tables: Record<string, boolean>; error?: string }> {
    const result: Record<string, boolean> = {
      repair_requests: false, repair_quotes: false, repair_timeline: false,
      repair_courier_jobs: false, repair_notifications: false, repair_photos: false,
      repair_status_history: false, repair_audit_log: false, users: false,
    };
    try {
      for (const table of Object.keys(result)) {
        try {
          const { error } = await this.client.from(table).select('id', { count: 'exact', head: true }).limit(1);
          result[table] = !error;
        } catch { result[table] = false; }
      }
      return { connected: true, tables: result };
    } catch (e) {
      return { connected: false, tables: result, error: (e as Error)?.message || 'Unknown error' };
    }
  }
}

let instance: RepairDataService | null = null;

export function getRepairDataService(client?: SupabaseClient): RepairDataService {
  if (!instance) instance = new RepairDataService(client);
  return instance;
}

export function resetRepairDataService(): void {
  instance = null;
}
