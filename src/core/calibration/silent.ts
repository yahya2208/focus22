import { CALIBRATION } from '../scientific/constants';
import { createDefaultCalibrationProfile, type CalibrationProfile } from './index';

const STORAGE_KEY = 'focus_calibration_profile';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getCachedProfile(): CalibrationProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as CalibrationProfile;
    if (Date.now() - profile.timestamp > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

function saveProfile(profile: CalibrationProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch { /* storage full or unavailable */ }
}

let inFlight: Promise<CalibrationProfile | null> | null = null;

export function runSilentCalibration(): Promise<CalibrationProfile | null> {
  const cached = getCachedProfile();
  if (cached) return Promise.resolve(cached);

  if (inFlight) return inFlight;

  inFlight = new Promise<CalibrationProfile>((resolve) => {
    const frames: number[] = [];
    let lastTime = performance.now();
    let rafId = 0;

    function measure(timestamp: number) {
      const delta = timestamp - lastTime;
      frames.push(delta);
      lastTime = timestamp;

      if (frames.length >= CALIBRATION.MIN_SAMPLES) {
        cancelAnimationFrame(rafId);

        const avgFrameMs = frames.reduce((a, b) => a + b, 0) / frames.length;
        const refreshRate = Math.round(1000 / avgFrameMs);
        const displayLagMs = 1000 / refreshRate / 2;
        const frameAccuracy = frames.filter((d) => Math.abs(d - avgFrameMs) < 2).length / frames.length;
        const refreshRateValidity = refreshRate >= 50 && refreshRate <= 240 ? 1 : 0.5;
        const confidence =
          frameAccuracy * CALIBRATION.CONFIDENCE_WEIGHTS.FRAME_ACCURACY +
          refreshRateValidity * CALIBRATION.CONFIDENCE_WEIGHTS.REFRESH_RATE_VALIDITY;

        const platform = /Android/i.test(navigator.userAgent)
          ? 'Android'
          : /iPhone|iPad/i.test(navigator.userAgent)
            ? 'iOS'
            : 'desktop';
        const inputLagMap: Record<string, number> = { Android: 16, iOS: 12, desktop: 8 };

        const profile: CalibrationProfile = {
          ...createDefaultCalibrationProfile(),
          refreshRate,
          displayLagMs,
          inputLagMs: inputLagMap[platform] ?? 16,
          confidence,
          platform,
          timestamp: Date.now(),
        };

        saveProfile(profile);
        resolve(profile);
        inFlight = null;
      } else {
        rafId = requestAnimationFrame(measure);
      }
    }

    rafId = requestAnimationFrame(measure);
  });

  return inFlight;
}
