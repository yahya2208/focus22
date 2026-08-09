import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 02 — Repair surface: dormant methods, dead WhatsApp helpers,
 * TEST-ONLY analytics modules, and PII writes.
 *
 * Proposed P6 removals / minimizations (Discovery proposal):
 *  P6-05  Dormant repair methods (no runtime callers): getRepairRequestsByName,
 *         getRepairRequestsByPhone (repair-data-service + repair-database facade)
 *  P6-06  Dormant notifications/photos service methods: getAllNotifications,
 *         saveNotification, getAllPhotos, savePhoto
 *  P6-07  Dead WhatsApp helpers: sendStatusWhatsApp (repair-whatsapp.ts),
 *         openRepairStatus (whatsapp-service.ts)
 *  P6-08  TEST-ONLY analytics modules: repair-engine.ts, repair-bi.ts
 *         (imported only by __tests__/repair/repair.test.ts)
 *  P6-09  PII minimization in the runtime write chain: repair-repository must not
 *         capture navigator.userAgent; repair-data-service must not persist
 *         ip_address / user_agent / device_info to repair_status_history and
 *         repair_audit_log
 *
 * INTENTIONALLY RED until P6 execution applies these changes.
 */

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}

function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('P6-05: dormant customer-name/phone repair search removed', () => {
  it('repair-data-service has no getRepairRequestsByName / getRepairRequestsByPhone', () => {
    const svc = codeOnly(read('core/supabase/repair-data-service.ts'));
    expect(svc).not.toContain('getRepairRequestsByName');
    expect(svc).not.toContain('getRepairRequestsByPhone');
  });

  it('repair-database facade has no getRepairRequestsByName / getRepairRequestsByPhone', () => {
    const db = codeOnly(read('services/repair/repair-database.ts'));
    expect(db).not.toContain('getRepairRequestsByName');
    expect(db).not.toContain('getRepairRequestsByPhone');
  });
});

describe('P6-06: dormant notifications/photos service methods removed', () => {
  it('repair-data-service has no getAllNotifications/saveNotification/getAllPhotos/savePhoto', () => {
    const svc = codeOnly(read('core/supabase/repair-data-service.ts'));
    expect(svc).not.toContain('getAllNotifications');
    expect(svc).not.toContain('saveNotification');
    expect(svc).not.toContain('getAllPhotos');
    expect(svc).not.toContain('savePhoto');
  });

  it('repair-database facade has no notifications/photos methods', () => {
    const db = codeOnly(read('services/repair/repair-database.ts'));
    expect(db).not.toContain('getAllNotifications');
    expect(db).not.toContain('saveNotification');
    expect(db).not.toContain('getAllPhotos');
    expect(db).not.toContain('savePhoto');
  });
});

describe('P6-07: dead repair WhatsApp helpers removed', () => {
  it('repair-whatsapp.ts has no sendStatusWhatsApp', () => {
    const w = codeOnly(read('services/repair/repair-whatsapp.ts'));
    expect(w).not.toContain('sendStatusWhatsApp');
  });

  it('whatsapp-service.ts has no openRepairStatus', () => {
    const w = codeOnly(read('services/whatsapp-service.ts'));
    expect(w).not.toContain('openRepairStatus');
  });
});

describe('P6-08: TEST-ONLY repair analytics modules removed', () => {
  it('src/services/repair/repair-engine.ts does not exist', () => {
    expect(exists('services/repair/repair-engine.ts')).toBe(false);
  });

  it('src/services/repair/repair-bi.ts does not exist', () => {
    expect(exists('services/repair/repair-bi.ts')).toBe(false);
  });
});

describe('P6-09: no PII writes in the repair runtime chain', () => {
  it('repair-repository does not capture navigator.userAgent', () => {
    const repo = codeOnly(read('services/repair/repair-repository.ts'));
    expect(repo).not.toContain('navigator.userAgent');
    expect(repo).not.toContain('collectDeviceInfo');
  });

  it('repair-data-service does not persist ip_address/user_agent/device_info', () => {
    const svc = codeOnly(read('core/supabase/repair-data-service.ts'));
    expect(svc).not.toContain('ip_address: entry.ipAddress');
    expect(svc).not.toContain('user_agent: entry.userAgent');
    expect(svc).not.toContain('device_info: entry.deviceInfo');
  });

  it('repair-status-history / repair-audit-log column reads are removed from the service', () => {
    const svc = codeOnly(read('core/supabase/repair-data-service.ts'));
    expect(svc).not.toMatch(/ip_address/);
    expect(svc).not.toMatch(/user_agent/);
    expect(svc).not.toMatch(/device_info/);
  });
});
