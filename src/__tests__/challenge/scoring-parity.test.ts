import { describe, it, expect } from 'vitest';
import { analyzeConsistency } from '../../core/engine/consistency';
import { detectFatigue } from '../../core/engine/fatigue';
import { calculateFocusScore } from '../../core/engine/scoring';

/**
 * Scoring-parity test vectors.
 *
 * Each vector mirrors the EXACT pipeline used by:
 *   src/screens/results/ResultsScreen.tsx (lines 106-117)
 *   src/core/engine/reaction.ts           (correctReactionTime → Math.max(0, raw - display - input))
 *   src/core/engine/consistency.ts        (analyzeConsistency — mean/SD on ALL corrected values incl. zeros)
 *   src/core/engine/fatigue.ts            (detectFatigue — block regression)
 *   src/core/engine/scoring.ts            (calculateFocusScore — weighted sum)
 *
 * The same inputs MUST produce identical outputs from the PL/pgSQL
 * compute_challenge_score() function in supabase/challenge-system/02-challenge-scoring.sql.
 */

interface TestVector {
  readonly name: string;
  readonly rawRts: readonly number[];
  readonly displayLagMs: number;
  readonly inputLagMs: number;
  readonly expected: {
    readonly focusScore: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly rtScore: number;
    readonly consistencyScore: number;
    readonly fatigueScore: number;
  };
}

const VECTORS: TestVector[] = [
  {
    name: 'Perfect game — all 200ms RTs, standard calibration',
    rawRts: [200, 200, 200, 200, 200, 200, 200],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 95,
      grade: 'A',
      rtScore: 91,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'Slow consistent player — all 350ms',
    rawRts: [350, 350, 350, 350, 350, 350, 350],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 71,
      grade: 'C',
      rtScore: 31,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'Fatigue pattern — RTs increasing over rounds',
    rawRts: [180, 190, 200, 220, 250, 300, 380],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 68,
      grade: 'D',
      rtScore: 73,
      consistencyScore: 30,
      fatigueScore: 100,
    },
  },
  {
    name: 'Improving pattern — RTs decreasing over rounds',
    rawRts: [380, 300, 250, 220, 200, 190, 180],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 38,
      grade: 'F',
      rtScore: 73,
      consistencyScore: 30,
      fatigueScore: 0,
    },
  },
  {
    name: 'Zero in corrected RT — high calibration offsets',
    rawRts: [100, 200, 210, 220, 230, 240, 250],
    displayLagMs: 60,
    inputLagMs: 40,
    expected: {
      focusScore: 79,
      grade: 'C',
      rtScore: 100,
      consistencyScore: 30,
      fatigueScore: 100,
    },
  },
  {
    name: 'Minimum boundary RTs — 150ms with zero calibration',
    rawRts: [150, 150, 150, 150, 150, 150, 150],
    displayLagMs: 0,
    inputLagMs: 0,
    expected: {
      focusScore: 99,
      grade: 'A',
      rtScore: 100,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'Maximum boundary RTs — 500ms clamps RT score to 0',
    rawRts: [500, 500, 500, 500, 500, 500, 500],
    displayLagMs: 0,
    inputLagMs: 0,
    expected: {
      focusScore: 59,
      grade: 'F',
      rtScore: 0,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'Mixed moderate game — tight variance',
    rawRts: [200, 220, 190, 210, 230, 200, 220],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 93,
      grade: 'A',
      rtScore: 87,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'CV = 0.1 boundary — exactly excellent consistency',
    rawRts: [200, 200, 200, 240, 240, 240, 220],
    displayLagMs: 20,
    inputLagMs: 0,
    expected: {
      focusScore: 91,
      grade: 'A',
      rtScore: 80,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
  {
    name: 'Uniform moderate — B grade',
    rawRts: [250, 250, 250, 250, 250, 250, 250],
    displayLagMs: 16,
    inputLagMs: 12,
    expected: {
      focusScore: 87,
      grade: 'B',
      rtScore: 71,
      consistencyScore: 95,
      fatigueScore: 100,
    },
  },
];

/**
 * Mirror the exact pipeline from ResultsScreen.tsx:
 *   correctedRts = rawRts.map(rt => Math.max(0, rt - displayLagMs - inputLagMs))
 *   consistency = analyzeConsistency(correctedRts)     ← mean/SD on ALL values
 *   fatigue = detectFatigue(correctedRts)
 *   score = calculateFocusScore({ meanCorrectedMs: consistency.meanMs, ... })
 */
function runClientPipeline(
  rawRts: readonly number[],
  displayLagMs: number,
  inputLagMs: number,
) {
  const correctedRts = rawRts.map((rt) => Math.max(0, rt - displayLagMs - inputLagMs));
  const consistency = analyzeConsistency(correctedRts);
  const fatigue = detectFatigue(correctedRts);
  const score = calculateFocusScore({
    meanCorrectedMs: consistency.meanMs,
    consistencyScore: consistency.score,
    fatigueScore: fatigue.score,
    totalRounds: rawRts.length,
  });
  return { consistency, fatigue, score };
}

describe('Challenge scoring parity — client pipeline', () => {
  for (const v of VECTORS) {
    it(v.name, () => {
      const { consistency, fatigue, score } = runClientPipeline(
        v.rawRts,
        v.displayLagMs,
        v.inputLagMs,
      );

      expect(score.focusScore).toBe(v.expected.focusScore);
      expect(score.grade).toBe(v.expected.grade);
      expect(score.rtScore).toBe(v.expected.rtScore);
      expect(score.consistencyScore).toBe(v.expected.consistencyScore);
      expect(score.fatigueScore).toBe(v.expected.fatigueScore);
      expect(consistency.score).toBe(v.expected.consistencyScore);
      expect(fatigue.score).toBe(v.expected.fatigueScore);
    });
  }

  it('correctedRts includes zeros (not filtered) for consistency', () => {
    const rawRts = [100, 200, 210, 220, 230, 240, 250];
    const displayLagMs = 60;
    const inputLagMs = 40;
    const correctedRts = rawRts.map((rt) => Math.max(0, rt - displayLagMs - inputLagMs));

    expect(correctedRts[0]).toBe(0);

    const consistency = analyzeConsistency(correctedRts);
    const validMean = correctedRts.filter((r) => r > 0).reduce((a, b) => a + b, 0) / correctedRts.filter((r) => r > 0).length;
    expect(consistency.meanMs).not.toBe(validMean);
    expect(consistency.meanMs).toBe(750 / 7);
  });

  it('fatigue = 100 for N < 5', () => {
    const shortRts = [200, 200, 200, 200];
    const correctedRts = shortRts.map((rt) => Math.max(0, rt - 16 - 12));
    const fatigue = detectFatigue(correctedRts);
    expect(fatigue.score).toBe(100);
  });

  it('consistency CV thresholds are exact', () => {
    const vals = [180, 180, 180, 220, 220, 220, 200];
    const consistency = analyzeConsistency(vals);
    expect(consistency.cv).toBeCloseTo(0.1, 5);
    expect(consistency.score).toBe(95);

    const valsPoor = [100, 100, 300, 300, 100, 300, 200];
    const consistencyPoor = analyzeConsistency(valsPoor);
    expect(consistencyPoor.cv).toBeGreaterThan(0.3);
    expect(consistencyPoor.score).toBe(30);
  });
});
