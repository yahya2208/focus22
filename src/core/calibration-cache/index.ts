import type { CalibrationProfile } from '../calibration';

export interface CalibrationCacheEntry {
  readonly profile: CalibrationProfile;
  readonly deviceId: string;
  readonly browserName: string;
  readonly expiresAt: number;
}

export interface CalibrationPolicy {
  readonly maxAgeDays: number;
  readonly confidenceThreshold: number;
  readonly recalibrateOnDeviceChange: boolean;
  readonly recalibrateOnBrowserChange: boolean;
  readonly recalibrateOnRefreshRateChange: boolean;
}

const DEFAULT_POLICY: CalibrationPolicy = {
  maxAgeDays: 30,
  confidenceThreshold: 0.7,
  recalibrateOnDeviceChange: true,
  recalibrateOnBrowserChange: true,
  recalibrateOnRefreshRateChange: true,
};

const CALIBRATION_CACHE_KEY = 'focus_calibration_cache';

export function getDefaultPolicy(): CalibrationPolicy {
  return DEFAULT_POLICY;
}

export function isCalibrationValid(
  entry: CalibrationCacheEntry,
  currentDeviceId: string,
  currentBrowser: string,
  currentRefreshRate: number,
  policy: CalibrationPolicy = DEFAULT_POLICY,
): { valid: boolean; reason?: string } {
  if (Date.now() > entry.expiresAt) {
    return { valid: false, reason: 'expired' };
  }

  if (entry.profile.confidence < policy.confidenceThreshold) {
    return { valid: false, reason: 'low_confidence' };
  }

  if (policy.recalibrateOnDeviceChange && entry.deviceId !== currentDeviceId) {
    return { valid: false, reason: 'device_changed' };
  }

  if (policy.recalibrateOnBrowserChange && entry.browserName !== currentBrowser) {
    return { valid: false, reason: 'browser_changed' };
  }

  if (policy.recalibrateOnRefreshRateChange && entry.profile.refreshRate !== currentRefreshRate) {
    return { valid: false, reason: 'refresh_rate_changed' };
  }

  return { valid: true };
}

export function createCacheEntry(
  profile: CalibrationProfile,
  deviceId: string,
  browserName: string,
  policy: CalibrationPolicy = DEFAULT_POLICY,
): CalibrationCacheEntry {
  const expiresAt = Date.now() + policy.maxAgeDays * 24 * 60 * 60 * 1000;
  return { profile, deviceId, browserName, expiresAt };
}

export interface CalibrationCache {
  get(): CalibrationCacheEntry | null;
  set(entry: CalibrationCacheEntry): void;
  clear(): void;
}

export function createCalibrationCache(): CalibrationCache {
  return {
    get(): CalibrationCacheEntry | null {
      const raw = localStorage.getItem(CALIBRATION_CACHE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as CalibrationCacheEntry;
      } catch {
        return null;
      }
    },

    set(entry: CalibrationCacheEntry): void {
      localStorage.setItem(CALIBRATION_CACHE_KEY, JSON.stringify(entry));
    },

    clear(): void {
      localStorage.removeItem(CALIBRATION_CACHE_KEY);
    },
  };
}

export function createInMemoryCalibrationCache(): CalibrationCache {
  let cached: CalibrationCacheEntry | null = null;
  return {
    get(): CalibrationCacheEntry | null {
      return cached;
    },
    set(entry: CalibrationCacheEntry): void {
      cached = entry;
    },
    clear(): void {
      cached = null;
    },
  };
}
