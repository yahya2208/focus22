import type { CalibrationValidationResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

function makeValidation(metric: string, value: number, threshold: number, message: string): ValidationResult {
  const status: ValidationStatus = value <= threshold ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = value <= threshold * 0.5 ? 'high' : value <= threshold ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validateCalibration(
  expectedLagMs: number,
  measuredLagMs: number,
  refreshRates: readonly number[],
  confidences: readonly number[],
): CalibrationValidationResult {
  if (confidences.length === 0) {
    return {
      calibrationAccuracy: 0,
      lagCompensationError: 0,
      refreshRateConsistency: 0,
      confidenceCalibrationCorrelation: 0,
      rating: 'invalid',
      validations: [{ metric: 'calibration.input', value: 0, threshold: 1, status: 'failed', message: 'No calibration data provided', confidence: 'low' }],
    };
  }

  const lagError = Math.abs(expectedLagMs - measuredLagMs);

  const meanConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const meanRefreshRate = refreshRates.length > 0
    ? refreshRates.reduce((a, b) => a + b, 0) / refreshRates.length
    : 60;
  const refreshSD = refreshRates.length > 1
    ? Math.sqrt(refreshRates.reduce((sum, r) => sum + (r - meanRefreshRate) ** 2, 0) / (refreshRates.length - 1))
    : 0;
  const refreshCV = meanRefreshRate > 0 ? refreshSD / meanRefreshRate : 0;

  let correlation = 0;
  if (confidences.length === refreshRates.length && confidences.length > 1) {
    const mc = meanConfidence;
    const mr = meanRefreshRate;
    const sc = Math.sqrt(confidences.reduce((sum, c) => sum + (c - mc) ** 2, 0) / (confidences.length - 1));
    const sr = Math.sqrt(refreshRates.reduce((sum, r) => sum + (r - mr) ** 2, 0) / (refreshRates.length - 1));
    if (sc > 0 && sr > 0) {
      let sum = 0;
      for (let i = 0; i < confidences.length; i++) {
        sum += ((confidences[i] ?? 0) - mc) * ((refreshRates[i] ?? 0) - mr);
      }
      correlation = sum / ((confidences.length - 1) * sc * sr);
    }
  }

  const calAccuracy = Math.max(0, 1 - lagError / 50);

  let rating: CalibrationValidationResult['rating'];
  if (lagError <= 5 && meanConfidence >= 0.8) rating = 'valid';
  else if (lagError <= 15 && meanConfidence >= 0.5) rating = 'marginal';
  else rating = 'invalid';

  const validations: ValidationResult[] = [
    makeValidation('calibration.lagError', lagError, 15, `Lag compensation error of ${lagError.toFixed(1)}ms — ${rating}`),
    makeValidation('calibration.confidence', 1 - meanConfidence, 0.3, `Mean confidence ${(meanConfidence * 100).toFixed(0)}% — ${meanConfidence >= 0.7 ? 'sufficient' : 'insufficient'}`),
    makeValidation('calibration.refreshCV', refreshCV, 0.05, `Refresh rate CV of ${(refreshCV * 100).toFixed(1)}% — ${refreshCV < 0.05 ? 'stable' : 'variable'}`),
  ];

  return {
    calibrationAccuracy: calAccuracy,
    lagCompensationError: lagError,
    refreshRateConsistency: 1 - refreshCV,
    confidenceCalibrationCorrelation: correlation,
    rating,
    validations,
  };
}
