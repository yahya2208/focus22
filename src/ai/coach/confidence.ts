import type { ConfidenceInput, ConfidenceResult, ConfidenceFactor, ConfidenceLevel } from './types';

function scoreSessionCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 5) return 20;
  if (count <= 20) return 60;
  if (count <= 50) return 80;
  return 95;
}

function scoreVariance(variance: number): number {
  if (variance > 100) return 20;
  if (variance >= 50) return 50;
  if (variance >= 20) return 75;
  return 95;
}

function scoreRecentSessions(count: number): number {
  if (count <= 0) return 0;
  if (count <= 3) return 40;
  if (count <= 10) return 75;
  return 95;
}

function scoreDaysActive(days: number): number {
  if (days <= 0) return 0;
  if (days <= 3) return 25;
  if (days <= 14) return 60;
  if (days <= 30) return 80;
  return 95;
}

const FACTORS: readonly {
  readonly name: string;
  readonly weight: number;
  readonly scorer: (input: ConfidenceInput) => number;
}[] = [
  { name: 'sessionCount', weight: 0.25, scorer: (i) => scoreSessionCount(i.sessionCount) },
  { name: 'calibrationConfidence', weight: 0.20, scorer: (i) => i.calibrationConfidence },
  { name: 'deviceStability', weight: 0.15, scorer: (i) => i.deviceStability },
  { name: 'variance', weight: 0.15, scorer: (i) => scoreVariance(i.variance) },
  { name: 'recentSessions', weight: 0.15, scorer: (i) => scoreRecentSessions(i.recentSessions) },
  { name: 'daysActive', weight: 0.10, scorer: (i) => scoreDaysActive(i.daysActive) },
];

function getLevel(score: number): ConfidenceLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildExplanation(score: number, level: ConfidenceLevel, factors: readonly ConfidenceFactor[]): string {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const top = factors.slice().sort((a, b) => b.contribution - a.contribution);
  const topName = top[0]!.name.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  const topContribution = Math.round(top[0]!.contribution);

  return `Overall confidence is ${level} (${score}/100). ` +
    `Weighted score across ${factors.length} factors (total weight ${Math.round(totalWeight * 100)}%). ` +
    `Top factor: ${topName} contributed ${topContribution} points.`;
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const factors: ConfidenceFactor[] = FACTORS.map((f) => {
    const value = f.scorer(input);
    const contribution = Math.round(value * f.weight);
    return {
      name: f.name,
      value,
      weight: f.weight,
      contribution: Math.min(contribution, 100),
    } as const;
  });

  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.min(Math.max(Math.round(rawScore), 0), 100);
  const level = getLevel(score);
  const explanation = buildExplanation(score, level, factors);

  return { level, score, factors, explanation } as const;
}

export function createConfidenceEngine(): { evaluate: (input: ConfidenceInput) => ConfidenceResult } {
  return {
    evaluate(input: ConfidenceInput): ConfidenceResult {
      return calculateConfidence(input);
    },
  };
}
