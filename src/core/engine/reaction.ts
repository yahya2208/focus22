export interface ReactionResult {
  readonly rawRtMs: readonly number[];
  readonly correctedRtMs: readonly number[];
  readonly meanCorrectedMs: number;
  readonly medianCorrectedMs: number;
  readonly isValid: boolean;
}

export function processReactions(
  rawRts: readonly number[],
  displayLagMs: number,
  inputLagMs: number,
): ReactionResult {
  const corrected = rawRts.map((rt) => Math.max(0, rt - displayLagMs - inputLagMs));
  const validCorrected = corrected.filter((rt) => rt > 0);
  const meanCorrectedMs =
    validCorrected.length > 0
      ? validCorrected.reduce((a, b) => a + b, 0) / validCorrected.length
      : 0;
  const sorted = [...validCorrected].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  let medianCorrectedMs = 0;
  if (sorted.length > 0) {
    if (sorted.length % 2 === 0) {
      const a = sorted[mid - 1] ?? 0;
      const b = sorted[mid] ?? 0;
      medianCorrectedMs = (a + b) / 2;
    } else {
      medianCorrectedMs = sorted[mid] ?? 0;
    }
  }

  return {
    rawRtMs: rawRts,
    correctedRtMs: corrected,
    meanCorrectedMs,
    medianCorrectedMs,
    isValid: validCorrected.length > 0,
  };
}
