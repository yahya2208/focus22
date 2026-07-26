import { FATIGUE } from '../scientific/constants';

export interface FatigueResult {
  readonly blockAverages: readonly number[];
  readonly slope: number;
  readonly fatigueIndex: number;
  readonly hasFatigue: boolean;
  readonly score: number;
}

function linearRegression(points: readonly { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function detectFatigue(correctedRts: readonly number[]): FatigueResult {
  if (correctedRts.length < FATIGUE.MIN_DATA_POINTS) {
    return {
      blockAverages: [],
      slope: 0,
      fatigueIndex: 0,
      hasFatigue: false,
      score: 100,
    };
  }

  const blockSize = Math.ceil(correctedRts.length / FATIGUE.BLOCK_COUNT);
  const blocks: number[] = [];
  for (let i = 0; i < correctedRts.length; i += blockSize) {
    const block = correctedRts.slice(i, i + blockSize);
    const avg = block.reduce((a, b) => a + b, 0) / block.length;
    blocks.push(avg);
  }

  const points = blocks.map((y, x) => ({ x, y }));
  const { slope } = linearRegression(points);

  const fatigueIndex = Math.min(1, Math.max(0, -slope / Math.abs(FATIGUE.SLOPE_THRESHOLD)));
  const hasFatigue = slope < FATIGUE.SLOPE_THRESHOLD;

  const score = Math.round((1 - fatigueIndex) * 100);

  return {
    blockAverages: blocks,
    slope,
    fatigueIndex,
    hasFatigue,
    score,
  };
}
