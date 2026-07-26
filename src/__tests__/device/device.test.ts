import { describe, it, expect } from 'vitest';
import {
  collectDeviceProfile,
  resetDeviceProfile,
  createDeviceProfileForTest,
} from '../../core/device';

describe('Device Profile', () => {
  it('should create a valid test profile', () => {
    const profile = createDeviceProfileForTest();
    expect(profile.id).toBe('dev_test');
    expect(profile.browser).toBe('Chrome');
    expect(profile.platform).toBe('desktop');
    expect(profile.screenWidth).toBe(1920);
    expect(profile.cpuCores).toBe(8);
  });

  it('should create a test profile with overrides', () => {
    const profile = createDeviceProfileForTest({ platform: 'mobile', touchSupport: true });
    expect(profile.platform).toBe('mobile');
    expect(profile.touchSupport).toBe(true);
    expect(profile.browser).toBe('Chrome');
  });

  it('should collect a real device profile', () => {
    resetDeviceProfile();
    const profile = collectDeviceProfile();
    expect(profile.id).toMatch(/^dev_/);
    expect(profile.browser).toBeTruthy();
    expect(profile.os).toBeTruthy();
    expect(profile.platform).toMatch(/desktop|mobile|tablet|unknown/);
    expect(profile.screenWidth).toBeGreaterThanOrEqual(0);
    expect(profile.language).toBeTruthy();
    expect(profile.timezone).toBeTruthy();
    expect(profile.userAgent).toBeTruthy();
    expect(profile.collectedAt).toBeGreaterThan(0);
  });

  it('should cache the device profile', () => {
    resetDeviceProfile();
    const p1 = collectDeviceProfile();
    const p2 = collectDeviceProfile();
    expect(p1.id).toBe(p2.id);
    expect(p1.collectedAt).toBe(p2.collectedAt);
  });

  it('should reset the cache', () => {
    const p1 = collectDeviceProfile();
    resetDeviceProfile();
    const p2 = collectDeviceProfile();
    expect(p1).not.toBe(p2);
    expect(p2.userAgent).toBeDefined();
  });
});
