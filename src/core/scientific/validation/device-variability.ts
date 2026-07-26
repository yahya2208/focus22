import type { DeviceVariabilityResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

function calculateMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateSD(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function makeValidation(metric: string, value: number, threshold: number, message: string): ValidationResult {
  const status: ValidationStatus = value <= threshold ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = value <= threshold * 0.5 ? 'high' : value <= threshold ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validateDeviceVariability(
  deviceMeans: ReadonlyMap<string, readonly number[]>,
): DeviceVariabilityResult {
  if (deviceMeans.size < 2) {
    return {
      betweenDeviceCV: 0,
      betweenDeviceSD: 0,
      deviceEffectSize: 0,
      rating: 'low',
      validations: [{ metric: 'deviceVariability.input', value: deviceMeans.size, threshold: 2, status: 'failed', message: `Need at least 2 devices, got ${deviceMeans.size}`, confidence: 'low' }],
    };
  }

  const groupMeans: number[] = [];
  for (const [, values] of deviceMeans) {
    if (values.length > 0) {
      groupMeans.push(calculateMean(values));
    }
  }

  if (groupMeans.length < 2) {
    return {
      betweenDeviceCV: 0,
      betweenDeviceSD: 0,
      deviceEffectSize: 0,
      rating: 'low',
      validations: [{ metric: 'deviceVariability.data', value: 0, threshold: 2, status: 'failed', message: 'Insufficient data per device', confidence: 'low' }],
    };
  }

  const grandMean = calculateMean(groupMeans);
  const sd = calculateSD(groupMeans, grandMean);
  const cv = grandMean > 0 ? sd / grandMean : 0;

  const allValues: number[] = [];
  for (const [, values] of deviceMeans) {
    allValues.push(...values);
  }
  const overallSD = calculateSD(allValues, calculateMean(allValues));
  const effectSize = overallSD > 0 ? sd / overallSD : 0;

  let rating: DeviceVariabilityResult['rating'];
  if (cv <= 0.05) rating = 'low';
  else if (cv <= 0.15) rating = 'moderate';
  else rating = 'high';

  const validations: ValidationResult[] = [
    makeValidation('deviceVariability.cv', cv, 0.15, `Between-device CV of ${(cv * 100).toFixed(1)}% — ${rating} variability`),
    makeValidation('deviceVariability.effectSize', effectSize, 0.5, `Effect size d=${effectSize.toFixed(3)} — ${effectSize < 0.2 ? 'negligible' : effectSize < 0.5 ? 'small' : 'large'} device effect`),
  ];

  return {
    betweenDeviceCV: cv,
    betweenDeviceSD: sd,
    deviceEffectSize: effectSize,
    rating,
    validations,
  };
}
