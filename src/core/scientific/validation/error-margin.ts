import type { ErrorMarginResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

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

export function validateErrorMargin(values: readonly number[]): ErrorMarginResult {
  if (values.length < 2) {
    return {
      marginOfError95: 0,
      marginOfError99: 0,
      standardError: 0,
      confidenceInterval95: { lower: 0, upper: 0 },
      confidenceInterval99: { lower: 0, upper: 0 },
      validations: [{ metric: 'errorMargin.input', value: values.length, threshold: 2, status: 'failed', message: `Need at least 2 values, got ${values.length}`, confidence: 'low' }],
    };
  }

  const mean = calculateMean(values);
  const sd = calculateSD(values, mean);
  const n = values.length;
  const se = sd / Math.sqrt(n);

  const me95 = 1.96 * se;
  const me99 = 2.576 * se;

  const ci95 = { lower: mean - me95, upper: mean + me95 };
  const ci99 = { lower: mean - me99, upper: mean + me99 };

  const validations: ValidationResult[] = [
    makeValidation('errorMargin.se', se, 20, `Standard error of ${se.toFixed(2)}ms — ${se < 10 ? 'precise' : se < 20 ? 'moderate' : 'imprecise'}`),
    makeValidation('errorMargin.me95', me95, 30, `95% margin of error ±${me95.toFixed(1)}ms`),
    makeValidation('errorMargin.n', n, 30, `${n} samples — ${n >= 30 ? 'sufficient' : 'limited'} for CI estimation`),
  ];

  return {
    marginOfError95: me95,
    marginOfError99: me99,
    standardError: se,
    confidenceInterval95: ci95,
    confidenceInterval99: ci99,
    validations,
  };
}
