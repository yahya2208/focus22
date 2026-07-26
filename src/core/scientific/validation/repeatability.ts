import type { RepeatabilityResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

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

export function validateRepeatability(
  sessions: readonly (readonly number[])[],
): RepeatabilityResult {
  if (sessions.length === 0 || sessions.every((s) => s.length === 0)) {
    return {
      withinSessionCV: 0,
      withinSessionSD: 0,
      rating: 'poor',
      validations: [{ metric: 'repeatability.input', value: 0, threshold: 1, status: 'failed', message: 'No session data for repeatability', confidence: 'low' }],
    };
  }

  const sessionMeans = sessions
    .filter((s) => s.length > 0)
    .map((s) => s.reduce((a, b) => a + b, 0) / s.length);

  if (sessionMeans.length < 2) {
    return {
      withinSessionCV: 0,
      withinSessionSD: 0,
      rating: 'poor',
      validations: [{ metric: 'repeatability.sessions', value: sessionMeans.length, threshold: 2, status: 'failed', message: `Need at least 2 valid sessions, got ${sessionMeans.length}`, confidence: 'low' }],
    };
  }

  const grandMean = sessionMeans.reduce((a, b) => a + b, 0) / sessionMeans.length;
  const sd = calculateSD(sessionMeans, grandMean);
  const cv = grandMean > 0 ? sd / grandMean : 0;

  let rating: RepeatabilityResult['rating'];
  if (cv <= 0.05) rating = 'excellent';
  else if (cv <= 0.10) rating = 'good';
  else if (cv <= 0.15) rating = 'acceptable';
  else rating = 'poor';

  const validations: ValidationResult[] = [
    makeValidation('repeatability.cv', cv, 0.15, `Within-session CV of ${(cv * 100).toFixed(1)}% — ${rating} repeatability`),
    makeValidation('repeatability.sd', sd, 40, `Between-session SD of ${sd.toFixed(2)}ms`),
    makeValidation('repeatability.n', sessionMeans.length, 3, `${sessionMeans.length} sessions analyzed for repeatability`),
  ];

  return {
    withinSessionCV: cv,
    withinSessionSD: sd,
    rating,
    validations,
  };
}
