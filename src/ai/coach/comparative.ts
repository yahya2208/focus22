import type {
  ComparativeResult,
  CognitiveInput,
  ConfidenceResult,
  TrendDirection,
  ConfidenceLevel,
} from './types';

function computeSimpleConfidence(sampleSize: number): ConfidenceResult {
  let level: ConfidenceLevel;
  if (sampleSize >= 10) {
    level = 'high';
  } else if (sampleSize >= 5) {
    level = 'medium';
  } else {
    level = 'low';
  }
  return {
    level,
    score: Math.min(sampleSize / 10, 1),
    factors: [
      { name: 'sampleSize', value: sampleSize, weight: 1, contribution: Math.min(sampleSize / 10, 1) },
    ],
    explanation: `Based on ${sampleSize} samples.`,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trendFromChange(changePercent: number): TrendDirection {
  if (changePercent > 5) return 'improving';
  if (changePercent < -5) return 'regressing';
  return 'plateau';
}

export function comparePeriods(
  current: readonly number[],
  previous: readonly number[],
  dimension: string,
): ComparativeResult {
  const currentMean = mean(current);
  const previousMean = mean(previous);
  const changePercent = previousMean !== 0
    ? ((currentMean - previousMean) / Math.abs(previousMean)) * 100
    : 0;
  const trend = trendFromChange(changePercent);
  const minSamples = Math.min(current.length, previous.length);
  const confidence = computeSimpleConfidence(minSamples);

  return {
    dimension,
    label: `${current.length} vs ${previous.length} samples`,
    baseline: previousMean,
    current: currentMean,
    changePercent,
    trend,
    confidence,
  };
}

export function compareTimeOfDay(
  morningSessions: readonly number[],
  eveningSessions: readonly number[],
  dimension: string,
): ComparativeResult {
  const morningMean = mean(morningSessions);
  const eveningMean = mean(eveningSessions);
  const changePercent = eveningMean !== 0
    ? ((morningMean - eveningMean) / Math.abs(eveningMean)) * 100
    : 0;
  const trend = trendFromChange(changePercent);
  const minSamples = Math.min(morningSessions.length, eveningSessions.length);
  const confidence = computeSimpleConfidence(minSamples);

  return {
    dimension,
    label: 'Morning vs Evening',
    baseline: eveningMean,
    current: morningMean,
    changePercent,
    trend,
    confidence,
  };
}

export function compareSessionLength(
  shortSessions: readonly number[],
  longSessions: readonly number[],
  dimension: string,
): ComparativeResult {
  const shortMean = mean(shortSessions);
  const longMean = mean(longSessions);
  const changePercent = longMean !== 0
    ? ((shortMean - longMean) / Math.abs(longMean)) * 100
    : 0;
  const trend = trendFromChange(changePercent);
  const minSamples = Math.min(shortSessions.length, longSessions.length);
  const confidence = computeSimpleConfidence(minSamples);

  return {
    dimension,
    label: 'Short vs Long Sessions',
    baseline: longMean,
    current: shortMean,
    changePercent,
    trend,
    confidence,
  };
}

export function generateComparisons(input: CognitiveInput): readonly ComparativeResult[] {
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

  const thisWeekStart = now - ONE_WEEK;
  const lastWeekStart = now - 2 * ONE_WEEK;
  const thisMonthStart = now - ONE_MONTH;
  const lastMonthStart = now - 2 * ONE_MONTH;

  const thisWeek = input.sessions.filter((s) => s.timestamp >= thisWeekStart);
  const lastWeek = input.sessions.filter((s) => s.timestamp >= lastWeekStart && s.timestamp < thisWeekStart);
  const thisMonth = input.sessions.filter((s) => s.timestamp >= thisMonthStart);
  const lastMonth = input.sessions.filter((s) => s.timestamp >= lastMonthStart && s.timestamp < thisMonthStart);

  const dimensions: { key: keyof typeof thisWeek[number]; name: string }[] = [
    { key: 'medianRT', name: 'medianRT' },
    { key: 'consistencyScore', name: 'consistencyScore' },
    { key: 'fatigueIndex', name: 'fatigueIndex' },
    { key: 'focusScore', name: 'focusScore' },
    { key: 'accuracy', name: 'accuracy' },
  ];

  const results: ComparativeResult[] = [];

  for (const dim of dimensions) {
    const currentVals = thisWeek.map((s) => s[dim.key] as number);
    const previousVals = lastWeek.map((s) => s[dim.key] as number);
    if (currentVals.length > 0 || previousVals.length > 0) {
      results.push(comparePeriods(currentVals, previousVals, dim.name));
    }
  }

  for (const dim of dimensions) {
    const currentVals = thisMonth.map((s) => s[dim.key] as number);
    const previousVals = lastMonth.map((s) => s[dim.key] as number);
    if (currentVals.length > 0 || previousVals.length > 0) {
      results.push(comparePeriods(currentVals, previousVals, dim.name));
    }
  }

  const shortSessions = input.sessions.filter((s) => s.duration < 5);
  const longSessions = input.sessions.filter((s) => s.duration >= 5);

  for (const dim of dimensions) {
    const shortVals = shortSessions.map((s) => s[dim.key] as number);
    const longVals = longSessions.map((s) => s[dim.key] as number);
    if (shortVals.length > 0 || longVals.length > 0) {
      results.push(compareSessionLength(shortVals, longVals, dim.name));
    }
  }

  const morningSessions = input.sessions.filter((s) => {
    const hour = new Date(s.timestamp).getHours();
    return hour >= 6 && hour < 12;
  });
  const eveningSessions = input.sessions.filter((s) => {
    const hour = new Date(s.timestamp).getHours();
    return hour >= 18 && hour < 24;
  });

  for (const dim of dimensions) {
    const morningVals = morningSessions.map((s) => s[dim.key] as number);
    const eveningVals = eveningSessions.map((s) => s[dim.key] as number);
    if (morningVals.length > 0 || eveningVals.length > 0) {
      results.push(compareTimeOfDay(morningVals, eveningVals, dim.name));
    }
  }

  return results;
}
