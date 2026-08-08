import { describe, it, expect, beforeEach } from 'vitest';
import { getRepairRepository, resetRepairRepository } from '../../services/repair/repair-repository';
import {
  getAllRepairRequests, getRepairRequest, getQuote, getAllTimelineEvents,
  getAllCourierJobs, getAuditLog,
} from '../../services/repair/repair-database';
import { generateRepairCode, type RepairRequest } from '../../services/repair/repair-types';
import { sendRepairRequestWhatsApp } from '../../services/repair/repair-whatsapp';

const TEST_INPUT = {
  customerName: 'أحمد العربي',
  customerPhone: '05551148943',
  brandName: 'Samsung',
  modelName: 'A52',
  condition: 'New',
  issue: 'Screen',
  description: 'الشاشة مكسورة',
  latitude: 36.78,
  longitude: 3.06,
  locationAccuracy: 100,
  googleMapsLink: 'https://maps.google.com/?q=36.78,3.06',
  photoPaths: [],
  customerId: null,
};

describe('Repair OS', () => {
  beforeEach(() => {
    resetRepairRepository();
    try { localStorage.clear(); } catch { /* jsdom storage may be missing */ }
  });

  describe('Engine 1 — Code Generation', () => {
    it('generates a repair code with RP-YYYY-NNNNNN format', () => {
      const code = generateRepairCode();
      expect(code).toMatch(/^RP-2026-\d{6}$/);
    });

    it('generates unique codes', () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateRepairCode()));
      expect(codes.size).toBe(100);
    });
  });

  describe('Engine 2 — Request Lifecycle', () => {
    it('creates a repair request with Pending status', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      expect(request.status).toBe('Pending');
      expect(request.customerName).toBe(TEST_INPUT.customerName);
      expect(request.brandName).toBe(TEST_INPUT.brandName);
      expect(request.repairCode).toMatch(/^RP-/);
    });

    it('creates a repair request with pending timeline event', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const events = await getAllTimelineEvents(request.id);
      expect(events.some(e => e.status === 'Pending')).toBe(true);
    });

    it('finds a repair request by id', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const found = await getRepairRequest(request.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(request.id);
    });

    it('lists all repair requests', async () => {
      const before = await getAllRepairRequests();
      await getRepairRepository().createRequest(TEST_INPUT);
      const after = await getAllRepairRequests();
      expect(after.length).toBe(before.length + 1);
    });

    it('searches repair requests', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const results = await getRepairRepository().search('Samsung');
      expect(results.some(r => r.id === request.id)).toBe(true);
    });
  });

  describe('Engine 3 — Quote Lifecycle', () => {
    it('creates a quote for a repair request', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const quote = await getRepairRepository().createQuote(request.id, 2500, 3, 'شاشة أصلية');
      expect(quote).not.toBeNull();
      expect(quote!.repairId).toBe(request.id);
      expect(quote!.estimatedPrice).toBe(2500);
    });

    it('approves a quote and transitions to Diagnosing', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 2000, 2, '');
      const updated = await getRepairRepository().approveQuote(request.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Diagnosing');
    });

    it('rejects a quote and cancels the request', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 3000, 5, '');
      const updated = await getRepairRepository().rejectQuote(request.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Cancelled');
    });

    it('stores quote approval timestamp', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 1500, 1, '');
      await getRepairRepository().approveQuote(request.id);
      const quote = await getQuote(request.id);
      expect(quote).not.toBeNull();
      expect(quote!.approvedAt).not.toBeNull();
    });
  });

  describe('Engine 4 — Status Flow', () => {
    it('transitions through valid statuses', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 1000, 2, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().updateStatus(request.id, 'Diagnosing');
      const req = await getRepairRequest(request.id);
      expect(req!.status).toBe('Diagnosing');
    });

    it('tracks timeline events for each transition', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 5000, 7, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().updateStatus(request.id, 'Diagnosing');
      await getRepairRepository().updateStatus(request.id, 'Repairing');
      await getRepairRepository().updateStatus(request.id, 'Ready');
      const events = await getAllTimelineEvents(request.id);
      const statuses = events.map(e => e.status);
      expect(statuses).toContain('Pending');
      expect(statuses).toContain('Repairing');
      expect(statuses).toContain('Ready');
    });
  });

  describe('Engine 5 — WhatsApp Messages', () => {
    it('sendRepairRequestWhatsApp opens wa.me link with request details', () => {
      const code = generateRepairCode();
      const request: RepairRequest = {
        id: 'test',
        repairCode: code,
        customerName: 'test',
        customerPhone: '05551148943',
        brandName: 'Samsung',
        modelName: 'A52',
        condition: 'New',
        issue: 'Screen',
        description: 'Test',
        latitude: null,
        longitude: null,
        locationAccuracy: null,
        googleMapsLink: null,
        photoPaths: [],
        status: 'Pending',
        adminNotes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customerId: null,
        assignedCourierId: null,
        assignedTechnicianId: null,
      };
      let capturedUrl = '';
      const origLoc = window.location;
      delete (window as unknown as Record<string, unknown>).location;
      (window as unknown as Record<string, unknown>).location = { set href(v: string) { capturedUrl = v; }, get href() { return ''; } };
      sendRepairRequestWhatsApp(request);
      expect(capturedUrl).toContain('wa.me/');
      expect(capturedUrl).toContain(encodeURIComponent(request.repairCode));
      expect(capturedUrl).toContain(encodeURIComponent(request.brandName));
      expect(capturedUrl).toContain(encodeURIComponent(request.modelName));
      expect(capturedUrl).toContain(encodeURIComponent(request.issue));
      (window as unknown as Record<string, unknown>).location = origLoc;
    });
  });

  describe('Engine 6 — Courier System', () => {
    it('assignCourier creates a courier job', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 2000, 2, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().assignCourier(request.id, 'courier_1', 'محمد');
      const jobs = await getAllCourierJobs();
      const job = jobs.find(j => j.repairId === request.id);
      expect(job).not.toBeNull();
      expect(job!.courierId).toBe('courier_1');
      expect(job!.status).toBe('Pending');
    });

    it('updateCourierJobStatus transitions courier status', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 2000, 2, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().assignCourier(request.id, 'courier_2', 'أحمد');
      const jobs = await getAllCourierJobs();
      const job = jobs.find(j => j.repairId === request.id)!;
      const updated = await getRepairRepository().updateCourierJobStatus(job.id, 'Trip Started');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Trip Started');
    });
  });

  describe('Engine 7 — Full Workflow', () => {
    it('completes a full repair workflow', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 2500, 3, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().assignCourier(request.id, 'courier_4', 'سعيد');
      const allJobs = await getAllCourierJobs();
      const job = allJobs.find(j => j.repairId === request.id);
      expect(job).not.toBeNull();
      await getRepairRepository().updateStatus(request.id, 'Diagnosing');
      await getRepairRepository().updateStatus(request.id, 'Repairing');
      await getRepairRepository().updateStatus(request.id, 'Waiting Parts');
      await getRepairRepository().updateStatus(request.id, 'Ready');
      const req = await getRepairRequest(request.id);
      expect(req!.status).toBe('Ready');
    });

    it('all timeline events are in order', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 2500, 3, '');
      await getRepairRepository().approveQuote(request.id);
      await getRepairRepository().updateStatus(request.id, 'Diagnosing');
      await getRepairRepository().updateStatus(request.id, 'Repairing');
      const events = await getAllTimelineEvents(request.id);
      const timestamps = events.map(e => new Date(e.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
    });
  });

  describe('Engine 8 — Dashboard & Audit', () => {
    it('getDashboard returns structured data', async () => {
      await getRepairRepository().createRequest(TEST_INPUT);
      const dashboard = await getRepairRepository().getDashboard();
      expect(dashboard).toHaveProperty('totalRepairs');
      expect(dashboard.totalRepairs).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(dashboard.mostRepairedBrands)).toBe(true);
      expect(dashboard).toHaveProperty('pending');
    });

    it('records audit entries for request actions', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const logs = await getAuditLog(request.id);
      expect(logs.some(l => l.action === 'Create Request')).toBe(true);
    });
  });

  describe('Engine 9 — Database Layer', () => {
    it('persists data across read/write calls', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      const reloaded = await getRepairRequest(request.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.customerName).toBe(TEST_INPUT.customerName);
    });

    it('supports quotes, timeline, and requests independently', async () => {
      const { request } = await getRepairRepository().createRequest(TEST_INPUT);
      await getRepairRepository().createQuote(request.id, 1000, 2, '');
      const quote = await getQuote(request.id);
      expect(quote).not.toBeNull();
      const events = await getAllTimelineEvents(request.id);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
