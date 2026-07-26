import { CONSISTENCY } from '../scientific/constants';

export interface ConsistencyResult {
  readonly meanMs: number;
  readonly sdMs: number;
  readonly cv: number;
  readonly iqrMs: number;
  readonly outlierCount: number;
  readonly outlierIndices: readonly number[];
  readonly cleanValues: readonly number[];
  readonly rating: 'excellent' | 'good' | 'fair' | 'poor';
  readonly score: number;
}

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

function detectOutliers(values: readonly number[]): { indices: number[]; clean: number[] } {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const lower = q1 - CONSISTENCY.IQR_MULTIPLIER * iqr;
  const upper = q3 + CONSISTENCY.IQR_MULTIPLIER * iqr;

  const indices: number[] = [];
  const clean: number[] = [];
  values.forEach((v, i) => {
    if (v < lower || v > upper) {
      indices.push(i);
    } else {
      clean.push(v);
    }
  });
  return { indices, clean };
}

function rateConsistency(cv: number): ConsistencyResult['rating'] {
  if (cv <= CONSISTENCY.CV_THRESHOLDS.EXCELLENT) return 'excellent';
  if (cv <= CONSISTENCY.CV_THRESHOLDS.GOOD) return 'good';
  if (cv <= CONSISTENCY.CV_THRESHOLDS.FAIR) return 'fair';
  return 'poor';
}

export function analyzeConsistency(correctedRts: readonly number[]): ConsistencyResult {
  if (correctedRts.length === 0) {
    return {
      meanMs: 0,
      sdMs: 0,
      cv: 0,
      iqrMs: 0,
      outlierCount: 0,
      outlierIndices: [],
      cleanValues: [],
      rating: 'poor',
      score: 0,
    };
  }

  const { indices: outlierIndices, clean: cleanValues } = detectOutliers(correctedRts);
  const sorted = [...correctedRts].sort((a, b) => a - b);
  const mean = correctedRts.reduce((a, b) => a + b, 0) / correctedRts.length;
  const sd = calculateSD(correctedRts, mean);
  const cv = mean > 0 ? sd / mean : 0;
  const iqr = calculateIQR(sorted);
  const rating = rateConsistency(cv);

  const scoreMap: Record<ConsistencyResult['rating'], number> = {
    excellent: 95,
    good: 80,
    fair: 60,
    poor: 30,
  };

  return {
    meanMs: mean,
    sdMs: sd,
    cv,
    iqrMs: iqr,
    outlierCount: outlierIndices.length,
    outlierIndices,
    cleanValues,
    rating,
    score: scoreMap[rating],
  };
}
