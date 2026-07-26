export interface CalibrationProfile {
  readonly refreshRate: number;
  readonly displayLagMs: number;
  readonly inputLagMs: number;
  readonly confidence: number;
  readonly platform: string;
  readonly timestamp: number;
}

export interface CalibrationResult {
  readonly profile: CalibrationProfile;
  readonly samples: readonly number[];
  readonly frameAccuracy: number;
}

export function createDefaultCalibrationProfile(): CalibrationProfile {
  return {
    refreshRate: 60,
    displayLagMs: 16.667,
    inputLagMs: 8,
    confidence: 0.5,
    platform: 'unknown',
    timestamp: Date.now(),
  };
}
