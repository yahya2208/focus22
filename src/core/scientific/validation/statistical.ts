import type { StatisticalValidationResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

function calculateMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateSD(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rankValues(values: readonly number[]): readonly number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);
  for (let rank = 0; rank < sorted.length; rank++) {
    ranks[sorted[rank]!.i] = rank + 1;
  }
  return ranks;
}

function shapiroWilkApproximation(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = calculateMean(sorted);
  const sd = calculateSD(sorted, mean);
  if (sd === 0) return 1;

  let numerator = 0;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const ai = sorted[n - 1 - i]! - sorted[i]!;
    const rankDiff = (n - 1 - 2 * i) + 1;
    numerator += ai * rankDiff;
  }
  numerator = numerator * numerator;

  const denominator = (n - 1) * sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0);

  const W = denominator > 0 ? numerator / denominator : 1;
  return Math.min(1, Math.max(0, W));
}

function mannWhitneyUTest(x: readonly number[], y: readonly number[]): number {
  const n1 = x.length;
  const n2 = y.length;
  if (n1 === 0 || n2 === 0) return 1;

  const combined = [
    ...x.map((v) => ({ v, group: 0 })),
    ...y.map((v) => ({ v, group: 1 })),
  ].sort((a, b) => a.v - b.v);

  const ranks = rankValues(combined.map((c) => c.v));
  let r1 = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i]!.group === 0) r1 += ranks[i]!;
  }

  const U1 = r1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  const meanU = (n1 * n2) / 2;
  const sdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  if (sdU === 0) return 1;
  const z = (U - meanU) / sdU;
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return Math.max(0, Math.min(1, p));
}

function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * absZ);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);
  return 0.5 * (1 + sign * y);
}

function cohensD(x: readonly number[], y: readonly number[]): number {
  const mx = calculateMean(x);
  const my = calculateMean(y);
  const sx = calculateSD(x, mx);
  const sy = calculateSD(y, my);
  const pooledSD = Math.sqrt(((x.length - 1) * sx * sx + (y.length - 1) * sy * sy) / (x.length + y.length - 2));
  if (pooledSD === 0) return 0;
  return (mx - my) / pooledSD;
}

function makeValidation(metric: string, value: number, threshold: number, message: string, inverted = false): ValidationResult {
  const passed = inverted ? value >= threshold : value <= threshold;
  const status: ValidationStatus = passed ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = passed ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validateStatistical(
  values: readonly number[],
  comparisonGroup?: readonly number[],
): StatisticalValidationResult {
  if (values.length < 3) {
    return {
      shapiroWilkP: 0,
      isNormal: false,
      mannWhitneyU: null,
      effectSize: 0,
      powerAnalysis: { requiredN: 0, achievedPower: 0 },
      validations: [{ metric: 'statistical.input', value: values.length, threshold: 3, status: 'failed', message: `Need at least 3 values, got ${values.length}`, confidence: 'low' }],
    };
  }

  const W = shapiroWilkApproximation(values);
  const isNormal = W > 0.05;

  const mwU = comparisonGroup && comparisonGroup.length > 0
    ? mannWhitneyUTest(values, comparisonGroup)
    : null;

  const d = comparisonGroup && comparisonGroup.length > 0
    ? cohensD(values, comparisonGroup)
    : 0;

  const effectAbs = Math.abs(d);
  let achievedPower = 0;
  if (comparisonGroup && comparisonGroup.length > 0) {
    const n1 = values.length;
    const n2 = comparisonGroup.length;
    achievedPower = Math.min(1, effectAbs * Math.sqrt((n1 * n2) / (n1 + n2)) / 2.8);
  }
  const requiredN = d !== 0 ? Math.ceil(16 / (d * d)) : 0;

  const validations: ValidationResult[] = [
    makeValidation('statistical.normality', 1 - W, 0.95, `Shapiro-Wilk W=${W.toFixed(3)} — ${isNormal ? 'normal distribution' : 'non-normal (consider non-parametric tests)'}`, true),
  ];

  if (mwU !== null) {
    validations.push(
      makeValidation('statistical.mannWhitneyP', mwU, 0.05, `Mann-Whitney U p=${mwU.toFixed(4)} — ${mwU < 0.05 ? 'statistically significant' : 'not significant'}`),
      makeValidation('statistical.effectSize', effectAbs, 0.8, `Cohen's d=${d.toFixed(3)} — ${effectAbs < 0.2 ? 'negligible' : effectAbs < 0.5 ? 'small' : effectAbs < 0.8 ? 'medium' : 'large'} effect`),
    );
  }

  return {
    shapiroWilkP: W,
    isNormal,
    mannWhitneyU: mwU,
    effectSize: d,
    powerAnalysis: { requiredN, achievedPower },
    validations,
  };
}
