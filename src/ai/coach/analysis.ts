import type {
  PerformanceAnalysis,
  DimensionAnalysis,
  CognitiveInput,
  TrendDirection,
  ConfidenceResult,
  SessionSnapshot,
} from './types';

function computeVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return sqDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function computeSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function computeTrend(
  history: readonly number[],
  higherIsBetter: boolean
): TrendDirection {
  if (history.length < 3) return 'plateau';

  const midpoint = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, midpoint);
  const secondHalf = history.slice(midpoint);

  const slope = computeSlope(history);

  if (higherIsBetter) {
    if (slope > 0.05) return 'improving';
    if (slope < -0.05) {
      if (computeSlope(secondHalf) > 0.02) return 'recovering';
      return 'regressing';
    }
  } else {
    if (slope < -0.05) return 'improving';
    if (slope > 0.05) {
      if (computeSlope(secondHalf) < -0.02) return 'recovering';
      return 'regressing';
    }
  }

  const absSlope = Math.abs(slope);
  if (absSlope < 0.02) {
    const firstVariance = computeVariance(firstHalf);
    const secondVariance = computeVariance(secondHalf);
    if (firstVariance > 0 && secondVariance > 2 * firstVariance) return 'unstable';
    return 'plateau';
  }

  return 'plateau';
}

function normalizeScore(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function analyzeDimension(params: {
  readonly value: number;
  readonly history: readonly number[];
  readonly goodThreshold: number;
  readonly excellentThreshold: number;
  readonly higherIsBetter: boolean;
  readonly confidence: ConfidenceResult;
  readonly dimensionName: string;
}): DimensionAnalysis {
  const { value, history, goodThreshold, excellentThreshold, higherIsBetter, confidence, dimensionName } = params;

  let rating: string;
  if (higherIsBetter) {
    if (value >= excellentThreshold) rating = 'Excellent';
    else if (value >= goodThreshold) rating = 'Good';
    else if (value >= goodThreshold * 0.7) rating = 'Fair';
    else rating = 'Needs Improvement';
  } else {
    if (value <= excellentThreshold) rating = 'Excellent';
    else if (value <= goodThreshold) rating = 'Good';
    else if (value <= goodThreshold * 1.3) rating = 'Fair';
    else rating = 'Needs Improvement';
  }

  const trend = computeTrend(history, higherIsBetter);

  const explanation = `${dimensionName} is ${rating} with a ${trend} trend.`;

  return {
    current: value,
    rating,
    trend,
    confidence,
    explanation,
  };
}

function createFallbackConfidence(): ConfidenceResult {
  return {
    level: 'low',
    score: 0.3,
    factors: [],
    explanation: 'Insufficient data for confidence assessment.',
  };
}

function extractHistory(
  sessions: readonly SessionSnapshot[],
  extractor: (s: SessionSnapshot) => number
): readonly number[] {
  return sessions.map(extractor);
}

export function analyzePerformance(input: CognitiveInput): PerformanceAnalysis {
  const { sessions, calibrationConfidence } = input;
  const latestSession = sessions[sessions.length - 1]!;

  const rtConfidence: ConfidenceResult = createFallbackConfidence();
  const conConfidence: ConfidenceResult = createFallbackConfidence();
  const fatConfidence: ConfidenceResult = createFallbackConfidence();
  const calConfidence: ConfidenceResult = createFallbackConfidence();
  const focusConfidence: ConfidenceResult = createFallbackConfidence();
  const accConfidence: ConfidenceResult = createFallbackConfidence();

  const reactionTimeHistory = extractHistory(sessions, (s) => s.medianRT);
  const consistencyHistory = extractHistory(sessions, (s) => s.consistencyScore);
  const fatigueHistory = extractHistory(sessions, (s) => s.fatigueIndex);
  const calibrationHistory = extractHistory(sessions, (s) => s.calibrationConfidence);
  const focusHistory = extractHistory(sessions, (s) => s.focusScore);
  const accuracyHistory = extractHistory(sessions, (s) => s.accuracy);

  const reactionTime = analyzeDimension({
    value: latestSession.medianRT,
    history: reactionTimeHistory,
    goodThreshold: 300,
    excellentThreshold: 250,
    higherIsBetter: false,
    confidence: rtConfidence,
    dimensionName: 'Reaction time',
  });

  const consistency = analyzeDimension({
    value: latestSession.consistencyScore,
    history: consistencyHistory,
    goodThreshold: 0.7,
    excellentThreshold: 0.85,
    higherIsBetter: true,
    confidence: conConfidence,
    dimensionName: 'Consistency',
  });

  const fatigue = analyzeDimension({
    value: latestSession.fatigueIndex,
    history: fatigueHistory,
    goodThreshold: 0.3,
    excellentThreshold: 0.1,
    higherIsBetter: false,
    confidence: fatConfidence,
    dimensionName: 'Fatigue',
  });

  const calibration = analyzeDimension({
    value: calibrationConfidence,
    history: calibrationHistory,
    goodThreshold: 0.7,
    excellentThreshold: 0.9,
    higherIsBetter: true,
    confidence: calConfidence,
    dimensionName: 'Calibration',
  });

  const focusScore = analyzeDimension({
    value: latestSession.focusScore,
    history: focusHistory,
    goodThreshold: 60,
    excellentThreshold: 80,
    higherIsBetter: true,
    confidence: focusConfidence,
    dimensionName: 'Focus',
  });

  const accuracy = analyzeDimension({
    value: latestSession.accuracy,
    history: accuracyHistory,
    goodThreshold: 0.7,
    excellentThreshold: 0.85,
    higherIsBetter: true,
    confidence: accConfidence,
    dimensionName: 'Accuracy',
  });

  const rtNormalized = normalizeScore(reactionTime.current, 500, 150);
  const conNormalized = normalizeScore(consistency.current, 0, 1);
  const fatNormalized = normalizeScore(fatigue.current, 1, 0);
  const calNormalized = normalizeScore(calibration.current, 0, 1);
  const focNormalized = normalizeScore(focusScore.current, 0, 100);
  const accNormalized = normalizeScore(accuracy.current, 0, 1);

  const overallValue = (rtNormalized + conNormalized + fatNormalized + calNormalized + focNormalized + accNormalized) / 6;

  const overall = analyzeDimension({
    value: overallValue,
    history: [],
    goodThreshold: 65,
    excellentThreshold: 80,
    higherIsBetter: true,
    confidence: createFallbackConfidence(),
    dimensionName: 'Overall',
  });

  return {
    reactionTime,
    consistency,
    fatigue,
    calibration,
    focusScore,
    accuracy,
    overall,
  };
}
