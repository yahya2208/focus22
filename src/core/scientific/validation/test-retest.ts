import type { TestRetestResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

function calculateMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateSD(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = calculateMean(x);
  const my = calculateMean(y);
  const sx = calculateSD(x, mx);
  const sy = calculateSD(y, my);
  if (sx === 0 || sy === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += ((x[i] ?? 0) - mx) * ((y[i] ?? 0) - my);
  }
  return sum / ((n - 1) * sx * sy);
}

function makeValidation(metric: string, value: number, threshold: number, message: string, inverted = false): ValidationResult {
  const passed = inverted ? value >= threshold : value <= threshold;
  const status: ValidationStatus = passed ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = passed ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validateTestRetest(
  session1Means: readonly number[],
  session2Means: readonly number[],
): TestRetestResult {
  const n = Math.min(session1Means.length, session2Means.length);

  if (n < 2) {
    return {
      pearsonR: 0,
      intraclassCorrelation: 0,
      coefficientOfRepeatability: 0,
      meanDifference: 0,
      limitsOfAgreement: { lower: 0, upper: 0 },
      rating: 'poor',
      validations: [{ metric: 'testRetest.input', value: n, threshold: 2, status: 'failed', message: `Need at least 2 paired observations, got ${n}`, confidence: 'low' }],
    };
  }

  const x = session1Means.slice(0, n);
  const y = session2Means.slice(0, n);
  const r = pearsonCorrelation(x, y);

  const diffs = x.map((v, i) => v - (y[i] ?? 0));
  const meanDiff = calculateMean(diffs);
  const sdDiff = calculateSD(diffs, meanDiff);
  const cr = 1.96 * Math.sqrt(2) * sdDiff;

  const lower = meanDiff - 1.96 * Math.sqrt(2) * sdDiff;
  const upper = meanDiff + 1.96 * Math.sqrt(2) * sdDiff;

  const icc = Math.max(0, r);

  let rating: TestRetestResult['rating'];
  if (r >= 0.9) rating = 'excellent';
  else if (r >= 0.75) rating = 'good';
  else if (r >= 0.5) rating = 'acceptable';
  else rating = 'poor';

  const validations: ValidationResult[] = [
    makeValidation('testRetest.pearsonR', r, 0.75, `Pearson r=${r.toFixed(3)} — ${rating} test-retest correlation`, true),
    makeValidation('testRetest.icc', icc, 0.75, `ICC=${icc.toFixed(3)} — intraclass correlation`, true),
    makeValidation('testRetest.cr', cr, 50, `Coefficient of Repeatability=${cr.toFixed(1)}ms`),
    makeValidation('testRetest.bias', Math.abs(meanDiff), 15, `Mean difference=${meanDiff.toFixed(1)}ms — ${Math.abs(meanDiff) < 15 ? 'low bias' : 'systematic shift detected'}`),
  ];

  return {
    pearsonR: r,
    intraclassCorrelation: icc,
    coefficientOfRepeatability: cr,
    meanDifference: meanDiff,
    limitsOfAgreement: { lower, upper },
    rating,
    validations,
  };
}
