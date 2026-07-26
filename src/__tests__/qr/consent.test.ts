import { describe, it, expect } from 'vitest';
import { createConsentService, CURRENT_CONSENT_VERSION } from '../../core/qr/consent';

describe('Consent Service', () => {
  it('should record consent', () => {
    const service = createConsentService();
    const record = service.record('user-1', true);
    expect(record.granted).toBe(true);
    expect(record.userId).toBe('user-1');
    expect(record.version).toBe(CURRENT_CONSENT_VERSION.version);
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('should record consent denial', () => {
    const service = createConsentService();
    const record = service.record('user-1', false);
    expect(record.granted).toBe(false);
  });

  it('should check if user consented', () => {
    const service = createConsentService();
    service.record('user-1', true);
    expect(service.hasConsented('user-1')).toBe(true);
  });

  it('should return false for non-consenting user', () => {
    const service = createConsentService();
    expect(service.hasConsented('nobody')).toBe(false);
  });

  it('should return false for denied consent', () => {
    const service = createConsentService();
    service.record('user-1', false);
    expect(service.hasConsented('user-1')).toBe(false);
  });

  it('should get consent record', () => {
    const service = createConsentService();
    service.record('user-1', true);
    const record = service.getRecord('user-1');
    expect(record?.granted).toBe(true);
    expect(record?.userId).toBe('user-1');
  });

  it('should return null for non-existent record', () => {
    const service = createConsentService();
    expect(service.getRecord('nobody')).toBeNull();
  });

  it('should withdraw consent', () => {
    const service = createConsentService();
    service.record('user-1', true);
    service.withdraw('user-1');
    expect(service.hasConsented('user-1')).toBe(false);
    const record = service.getRecord('user-1');
    expect(record?.granted).toBe(false);
  });

  it('should ignore withdraw for non-existent user', () => {
    const service = createConsentService();
    service.withdraw('nobody');
    expect(service.getRecord('nobody')).toBeNull();
  });

  it('should return current consent version', () => {
    const service = createConsentService();
    const version = service.getCurrentVersion();
    expect(version.version).toBe('1.0.0');
    expect(version.effectiveDate).toBeGreaterThan(0);
  });

  it('should overwrite previous consent on re-record', () => {
    const service = createConsentService();
    service.record('user-1', true);
    service.record('user-1', false);
    expect(service.hasConsented('user-1')).toBe(false);
  });
});
