import type { TrendResult, CognitiveInput, TrendDirection, ConfidenceResult, ConfidenceLevel } from './types';

interface DataPoint {
  readonly date: string;
  readonly value: number;
}

function linearRegression(values: readonly number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const indices = values.map((_, i) => i);
  const meanX = indices.reduce((s, x) => s + x, 0) / n;
  const meanY = values.reduce((s, y) => s + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (indices[i]! - meanX) * (values[i]! - meanY);
    denominator += (indices[i]! - meanX) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  if (m === 0) return Infinity;
  return stdDev(values) / Math.abs(m);
}

function isMonotonicallyIncreasing(values: readonly number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i]! <= values[i - 1]!) return false;
  }
  return true;
}

export function detectTrend(values: readonly DataPoint[]): TrendDirection {
  if (values.length < 3) return 'plateau';

  const numericValues = values.map((v) => v.value);
  const { slope } = linearRegression(numericValues);
  const normalizedSlope = mean(numericValues) !== 0 ? slope / Math.abs(mean(numericValues)) : 0;
  const cv = coefficientOfVariation(numericValues);

  if (cv > 0.3) return 'unstable';

  if (normalizedSlope > 0.05) {
    if (numericValues.length >= 6) {
      const firstHalf = numericValues.slice(0, Math.floor(numericValues.length / 2));
      const secondHalf = numericValues.slice(Math.floor(numericValues.length / 2));
      const firstVar = coefficientOfVariation(firstHalf);
      const secondVar = coefficientOfVariation(secondHalf);
      if (secondVar > firstVar * 1.5) return 'decelerating';
      if (secondVar < firstVar * 0.7) return 'accelerating';
    }
    return 'improving';
  }

  if (normalizedSlope < -0.05) {
    if (numericValues.length >= 6) {
      const lastThree = numericValues.slice(-3);
      if (isMonotonicallyIncreasing(lastThree)) return 'recovering';
    }
    return 'regressing';
  }

  if (Math.abs(normalizedSlope) < 0.02) return 'plateau';

  if (normalizedSlope > 0) return 'improving';
  return 'regressing';
}

export function computeStatisticalSignificance(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return m === 0 ? 0 : 1;
  const tStatistic = m / (s / Math.sqrt(n));
  const absT = Math.abs(tStatistic);
  if (absT > 3.5) return 0.001;
  if (absT > 2.8) return 0.01;
  if (absT > 2.0) return 0.05;
  if (absT > 1.5) return 0.1;
  return 0.25;
}

function computeConfidence(pointCount: number): ConfidenceResult {
  let level: ConfidenceLevel;
  let score: number;
  if (pointCount > 10) {
    level = 'high';
    score = 90;
  } else if (pointCount >= 5) {
    level = 'medium';
    score = 60;
  } else {
    level = 'low';
    score = 30;
  }
  return {
    level,
    score,
    factors: [
      {
        name: 'dataPointCount',
        value: pointCount,
        weight: 1.0,
        contribution: score,
      },
    ],
    explanation: `${pointCount} data points available for trend analysis. Confidence: ${level}.`,
  };
}

function computeMagnitude(dataPoints: readonly DataPoint[]): number {
  if (dataPoints.length < 2) return 0;
  const third = Math.max(1, Math.floor(dataPoints.length / 3));
  const firstThird = dataPoints.slice(0, third).map((d) => d.value);
  const lastThird = dataPoints.slice(-third).map((d) => d.value);
  const firstMean = mean(firstThird);
  const lastMean = mean(lastThird);
  if (firstMean === 0) return 0;
  return ((lastMean - firstMean) / Math.abs(firstMean)) * 100;
}

interface DimensionConfig {
  readonly dimension: string;
  readonly accessor: (session: CognitiveInput['sessions'][number]) => number;
}

const DIMENSIONS: readonly DimensionConfig[] = [
  { dimension: 'reactionTime', accessor: (s) => s.medianRT },
  { dimension: 'consistency', accessor: (s) => s.consistencyScore },
  { dimension: 'fatigue', accessor: (s) => s.fatigueIndex },
  { dimension: 'focusScore', accessor: (s) => s.focusScore },
  { dimension: 'accuracy', accessor: (s) => s.accuracy },
  { dimension: 'sessionDuration', accessor: (s) => s.duration },
];

function buildDataPoints(
  sessions: readonly CognitiveInput['sessions'][number][],
  accessor: (session: CognitiveInput['sessions'][number]) => number,
): readonly DataPoint[] {
  return sessions
    .map((s) => ({
      date: new Date(s.timestamp).toISOString().split('T')[0] ?? '',
      value: accessor(s),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function analyzeDimension(
  sessions: readonly CognitiveInput['sessions'][number][],
  config: DimensionConfig,
): TrendResult {
  const dataPoints = buildDataPoints(sessions, config.accessor);
  const numericValues = dataPoints.map((d) => d.value);
  const direction = detectTrend(dataPoints);
  const magnitude = computeMagnitude(dataPoints);
  const significance = computeStatisticalSignificance(numericValues);
  const confidence = computeConfidence(numericValues.length);

  return {
    dimension: config.dimension,
    direction,
    magnitude,
    confidence,
    dataPoints,
    statisticalSignificance: significance,
  };
}

export function analyzeTrends(input: CognitiveInput): readonly TrendResult[] {
  const sorted = [...input.sessions].sort((a, b) => a.timestamp - b.timestamp);
  return DIMENSIONS.map((config) => analyzeDimension(sorted, config));
}
