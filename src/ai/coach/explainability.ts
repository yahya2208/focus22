import type { Explanation, Evidence, ConfidenceResult, ResearchTag } from './types';

export function createEvidence(params: {
  readonly metric: string;
  readonly previous: number;
  readonly current: number;
  readonly unit: string;
}): Evidence {
  const { metric, previous, current, unit } = params;
  const changePercent = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const direction: Evidence['direction'] =
    changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'stable';

  return { metric, previous, current, unit, changePercent, direction };
}

export function createExplanation(params: {
  readonly observation: string;
  readonly evidence: readonly Evidence[];
  readonly confidence: ConfidenceResult;
  readonly recommendation: string;
  readonly researchTag?: ResearchTag;
}): Explanation {
  const { observation, evidence, confidence, recommendation, researchTag } = params;

  return {
    observation,
    evidence,
    confidence,
    recommendation,
    researchTag: researchTag ?? 'scientific',
  };
}

export function formatExplanation(explanation: Explanation): string {
  const evidenceLines = explanation.evidence
    .map((e) => `${e.metric}: ${e.previous}${e.unit} → ${e.current}${e.unit} (${e.changePercent > 0 ? '+' : ''}${e.changePercent.toFixed(1)}%)`)
    .join('\n  ');

  return [
    `Observation: ${explanation.observation}`,
    `Evidence: ${evidenceLines}`,
    `Confidence: ${explanation.confidence.level} (${explanation.confidence.score}%)`,
    `Recommendation: ${explanation.recommendation}`,
  ].join('\n');
}
