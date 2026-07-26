import { SCORING, REACTION } from '../scientific/constants';

export interface ScoringInput {
  readonly meanCorrectedMs: number;
  readonly consistencyScore: number;
  readonly fatigueScore: number;
  readonly totalRounds: number;
}

export interface ScoringResult {
  readonly focusScore: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly rtScore: number;
  readonly consistencyScore: number;
  readonly fatigueScore: number;
  readonly breakdown: {
    readonly rtContribution: number;
    readonly consistencyContribution: number;
    readonly fatigueContribution: number;
  };
}

function normalizeRT(meanCorrectedMs: number): number {
  const { min, max } = REACTION.EXPECTED_RANGE;
  const clamped = Math.min(max, Math.max(min, meanCorrectedMs));
  const normalized = 1 - (clamped - min) / (max - min);
  return Math.round(normalized * 100);
}

function determineGrade(score: number): ScoringResult['grade'] {
  if (score >= SCORING.GRADES.A) return 'A';
  if (score >= SCORING.GRADES.B) return 'B';
  if (score >= SCORING.GRADES.C) return 'C';
  if (score >= SCORING.GRADES.D) return 'D';
  return 'F';
}

export function calculateFocusScore(input: ScoringInput): ScoringResult {
  const rtScore = normalizeRT(input.meanCorrectedMs);

  const rtContribution = rtScore * SCORING.WEIGHTS.REACTION_TIME;
  const consistencyContribution = input.consistencyScore * SCORING.WEIGHTS.CONSISTENCY;
  const fatigueContribution = input.fatigueScore * SCORING.WEIGHTS.FATIGUE;

  const focusScore = Math.round(rtContribution + consistencyContribution + fatigueContribution);
  const grade = determineGrade(focusScore);

  return {
    focusScore,
    grade,
    rtScore,
    consistencyScore: input.consistencyScore,
    fatigueScore: input.fatigueScore,
    breakdown: {
      rtContribution,
      consistencyContribution,
      fatigueContribution,
    },
  };
}
