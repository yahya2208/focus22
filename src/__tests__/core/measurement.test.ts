import { describe, it, expect } from 'vitest';
import { correctReactionTime } from '../../core/measurement';
import { createDefaultCalibrationProfile } from '../../core/calibration';

describe('Measurement Pipeline', () => {
  const calibration = createDefaultCalibrationProfile();

  it('should correct raw RT by subtracting display and input lag', () => {
    const rawRt = 300;
    const result = correctReactionTime(rawRt, calibration);
    expect(result.correctedRtMs).toBeCloseTo(300 - 16.667 - 8, 1);
    expect(result.rawRtMs).toBe(300);
  });

  it('should mark result as invalid when corrected RT is negative', () => {
    const rawRt = 10;
    const result = correctReactionTime(rawRt, calibration);
    expect(result.isValid).toBe(false);
    expect(result.correctedRtMs).toBe(0);
  });

  it('should preserve confidence from calibration', () => {
    const result = correctReactionTime(250, calibration);
    expect(result.confidence).toBe(calibration.confidence);
  });
});
