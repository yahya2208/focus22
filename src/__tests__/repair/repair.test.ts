import { describe, it, expect } from 'vitest';
import {
  createRepairRequest, createQuote, approveQuote,
  rejectQuote, assignCourier, updateCourierJobStatus,
  updateRepairStatus, getRepairAnalytics,
} from '../../services/repair/repair-engine';
import {
  getAllRepairRequests, getRepairRequest,
  getQuote, getAllTimelineEvents,
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
      const { request } = await createRepairRequest(TEST_INPUT);
      expect(request.status).toBe('Pending');
      expect(request.customerName).toBe(TEST_INPUT.customerName);
      expect(request.brandName).toBe(TEST_INPUT.brandName);
      expect(request.repairCode).toMatch(/^RP-/);
    });

    it('creates a repair request with pending timeline event', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      const events = await getAllTimelineEvents(request.id);
      expect(events.some(e => e.status === 'Pending')).toBe(true);
    });

    it('finds a repair request by id', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      const found = await getRepairRequest(request.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(request.id);
    });

    it('lists all repair requests', async () => {
      const before = await getAllRepairRequests();
      await createRepairRequest(TEST_INPUT);
      const after = await getAllRepairRequests();
      expect(after.length).toBe(before.length + 1);
    });
  });

  describe('Engine 3 — Quote Lifecycle', () => {
    it('creates a quote for a repair request', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      const quote = await createQuote(request.id, 2500, 3, 'شاشة أصلية');
      expect(quote.repairId).toBe(request.id);
      expect(quote.estimatedPrice).toBe(2500);
    });

    it('approves a quote and transitions to Diagnosing', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2000, 2, '');
      const updated = await approveQuote(request.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Diagnosing');
    });

    it('rejects a quote and cancels the request', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 3000, 5, '');
      const updated = await rejectQuote(request.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Cancelled');
    });

    it('stores quote approval timestamp', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 1500, 1, '');
      await approveQuote(request.id);
      const quote = await getQuote(request.id);
      expect(quote).not.toBeNull();
      expect(quote!.approvedAt).not.toBeNull();
    });
  });

  describe('Engine 4 — Status Flow', () => {
    it('transitions through valid statuses', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 1000, 2, '');
      await approveQuote(request.id);
      await updateRepairStatus(request.id, 'Diagnosing');
      const req = await getRepairRequest(request.id);
      expect(req!.status).toBe('Diagnosing');
    });

    it('tracks timeline events for each transition', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 5000, 7, '');
      await approveQuote(request.id);
      await updateRepairStatus(request.id, 'Diagnosing');
      await updateRepairStatus(request.id, 'Repairing');
      await updateRepairStatus(request.id, 'Ready');
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
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2000, 2, '');
      await approveQuote(request.id);
      const job = await assignCourier(request.id, 'courier_1', 'محمد');
      expect(job).not.toBeNull();
      expect(job!.courierId).toBe('courier_1');
      expect(job!.status).toBe('Pending');
    });

    it('updateCourierJobStatus transitions courier status', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2000, 2, '');
      await approveQuote(request.id);
      const job = await assignCourier(request.id, 'courier_2', 'أحمد');
      const updated = await updateCourierJobStatus(job!.id, 'Trip Started');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('Trip Started');
    });

    it('courier collection updates repair status to Received', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2000, 2, '');
      await approveQuote(request.id);
      const job = await assignCourier(request.id, 'courier_3', 'خالد');
      await updateCourierJobStatus(job!.id, 'Trip Started');
      await updateCourierJobStatus(job!.id, 'Arrived');
      await updateCourierJobStatus(job!.id, 'Collected');
      const req = await getRepairRequest(request.id);
      expect(req!.status).toBe('Received');
    });
  });

  describe('Engine 7 — Full Workflow', () => {
    it('completes a full repair workflow', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2500, 3, '');
      await approveQuote(request.id);
      await assignCourier(request.id, 'courier_4', 'سعيد');
      const allJobs = await (await import('../../services/repair/repair-database')).getAllCourierJobs();
      const job = allJobs.find(j => j.repairId === request.id);
      expect(job).not.toBeNull();
      await updateRepairStatus(request.id, 'Diagnosing');
      await updateRepairStatus(request.id, 'Repairing');
      await updateRepairStatus(request.id, 'Waiting Parts');
      await updateRepairStatus(request.id, 'Ready');
      const req = await getRepairRequest(request.id);
      expect(req!.status).toBe('Ready');
    });

    it('all timeline events are in order', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 2500, 3, '');
      await approveQuote(request.id);
      await updateRepairStatus(request.id, 'Diagnosing');
      await updateRepairStatus(request.id, 'Repairing');
      const events = await getAllTimelineEvents(request.id);
      const timestamps = events.map(e => new Date(e.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
    });
  });

  describe('Engine 8 — Analytics', () => {
    it('getRepairAnalytics returns structured data', async () => {
      const analytics = await getRepairAnalytics();
      expect(analytics).toHaveProperty('totalRepairs');
      expect(analytics).toHaveProperty('repairSuccessRate');
      expect(analytics).toHaveProperty('topIssues');
      expect(analytics).toHaveProperty('topBrands');
    });
  });

  describe('Engine 9 — BI Integration', () => {
    it('getRepairBIData returns structured data', async () => {
      const { getRepairBIData } = await import('../../services/repair/repair-bi');
      const bi = await getRepairBIData();
      expect(bi).toHaveProperty('totalRepairs');
      expect(bi).toHaveProperty('repairSuccessRate');
      expect(bi).toHaveProperty('topIssues');
      expect(bi).toHaveProperty('topBrands');
      expect(bi).toHaveProperty('courierPerformance');
      expect(bi).toHaveProperty('totalRevenue');
    });
  });

  describe('Engine 10 — Database Layer', () => {
    it('persists data across read/write calls', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      const reloaded = await getRepairRequest(request.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.customerName).toBe(TEST_INPUT.customerName);
    });

    it('supports quotes, timeline, and requests independently', async () => {
      const { request } = await createRepairRequest(TEST_INPUT);
      await createQuote(request.id, 1000, 2, '');
      const quote = await getQuote(request.id);
      expect(quote).not.toBeNull();
      const events = await getAllTimelineEvents(request.id);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
