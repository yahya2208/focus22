import type { PrecisionResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';
import { CONSISTENCY } from '../constants';

function calculateSD(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateIQR(sorted: readonly number[]): number {
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  return q3 - q1;
}

function makeValidation(metric: string, value: number, threshold: number, message: string): ValidationResult {
  const status: ValidationStatus = value <= threshold ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = value <= threshold * 0.5 ? 'high' : value <= threshold ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validatePrecision(values: readonly number[]): PrecisionResult {
  if (values.length < 2) {
    return {
      standardDeviation: 0,
      coefficientOfVariation: 0,
      iqr: 0,
      precisionRating: 'poor',
      validations: [{ metric: 'precision.input', value: 0, threshold: 1, status: 'failed', message: 'Need at least 2 values for precision', confidence: 'low' }],
    };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = calculateSD(values, mean);
  const cv = mean > 0 ? sd / mean : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = calculateIQR(sorted);

  let rating: PrecisionResult['precisionRating'];
  if (cv <= CONSISTENCY.CV_THRESHOLDS.EXCELLENT) rating = 'excellent';
  else if (cv <= CONSISTENCY.CV_THRESHOLDS.GOOD) rating = 'good';
  else if (cv <= CONSISTENCY.CV_THRESHOLDS.FAIR) rating = 'acceptable';
  else rating = 'poor';

  const validations: ValidationResult[] = [
    makeValidation('precision.cv', cv, CONSISTENCY.CV_THRESHOLDS.FAIR, `CV of ${(cv * 100).toFixed(1)}% — ${rating} precision`),
    makeValidation('precision.sd', sd, 50, `SD of ${sd.toFixed(2)}ms — ${sd < 50 ? 'tight' : 'wide'} spread`),
    makeValidation('precision.iqr', iqr, 80, `IQR of ${iqr.toFixed(2)}ms — interquartile range`),
  ];

  return {
    standardDeviation: sd,
    coefficientOfVariation: cv,
    iqr,
    precisionRating: rating,
    validations,
  };
}
