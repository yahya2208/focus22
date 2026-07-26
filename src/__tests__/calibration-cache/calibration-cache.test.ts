import { describe, it, expect } from 'vitest';
import {
  isCalibrationValid,
  createCacheEntry,
  createInMemoryCalibrationCache,
  getDefaultPolicy,
} from '../../core/calibration-cache';

describe('Calibration Cache', () => {
  const policy = getDefaultPolicy();

  it('should accept a valid calibration', () => {
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    const result = isCalibrationValid(entry, 'dev-1', 'Chrome', 60, policy);
    expect(result.valid).toBe(true);
  });

  it('should reject expired calibration', () => {
    const entry = {
      profile: { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      deviceId: 'dev-1',
      browserName: 'Chrome',
      expiresAt: Date.now() - 1000,
    };
    const result = isCalibrationValid(entry, 'dev-1', 'Chrome', 60, policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('should reject low confidence calibration', () => {
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.3, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    const result = isCalibrationValid(entry, 'dev-1', 'Chrome', 60, policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('low_confidence');
  });

  it('should reject on device change', () => {
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    const result = isCalibrationValid(entry, 'dev-2', 'Chrome', 60, policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('device_changed');
  });

  it('should reject on browser change', () => {
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    const result = isCalibrationValid(entry, 'dev-1', 'Firefox', 60, policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('browser_changed');
  });

  it('should reject on refresh rate change', () => {
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    const result = isCalibrationValid(entry, 'dev-1', 'Chrome', 144, policy);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('refresh_rate_changed');
  });

  it('should store and retrieve from cache', () => {
    const cache = createInMemoryCalibrationCache();
    expect(cache.get()).toBeNull();
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    cache.set(entry);
    expect(cache.get()).toEqual(entry);
  });

  it('should clear cache', () => {
    const cache = createInMemoryCalibrationCache();
    const entry = createCacheEntry(
      { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'desktop', timestamp: Date.now() },
      'dev-1',
      'Chrome',
    );
    cache.set(entry);
    cache.clear();
    expect(cache.get()).toBeNull();
  });
});
