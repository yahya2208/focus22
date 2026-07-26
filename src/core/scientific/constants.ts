export const VERSION = '2.0.0';
export const VALIDATION_STATUS = 'implemented' as const;

export const CALIBRATION = {
  FRAME_BUDGET_MS: 16.667,
  MIN_SAMPLES: 50,
  MAX_DISPLAY_LAG_MS: 50,
  CONFIDENCE_WEIGHTS: {
    FRAME_ACCURACY: 0.6,
    REFRESH_RATE_VALIDITY: 0.4,
  },
} as const;

export const INPUT_LAG = {
  ANDROID_MS: 16,
  IOS_MS: 12,
  DESKTOP_MS: 8,
  UNKNOWN_MS: 16,
} as const;

export const REACTION = {
  MIN_RT_MS: 100,
  MAX_RT_MS: 2000,
  EXPECTED_RANGE: { min: 150, max: 400 },
} as const;

export const CONSISTENCY = {
  MIN_SESSIONS: 5,
  IQR_MULTIPLIER: 1.5,
  CV_THRESHOLDS: {
    EXCELLENT: 0.1,
    GOOD: 0.2,
    FAIR: 0.3,
  },
} as const;

export const FATIGUE = {
  BLOCK_COUNT: 3,
  SLOPE_THRESHOLD: -0.05,
  MIN_DATA_POINTS: 5,
} as const;

export const SCORING = {
  WEIGHTS: {
    REACTION_TIME: 0.4,
    CONSISTENCY: 0.3,
    FATIGUE: 0.3,
  },
  GRADES: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
  },
} as const;

export const PLATFORM: Record<string, number> = {
  Android: INPUT_LAG.ANDROID_MS,
  iOS: INPUT_LAG.IOS_MS,
  desktop: INPUT_LAG.DESKTOP_MS,
};
