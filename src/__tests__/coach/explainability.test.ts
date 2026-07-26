import { describe, it, expect } from 'vitest';
import {
  createEvidence,
  createExplanation,
  formatExplanation,
} from '../../ai/coach/explainability';
import type {
  ConfidenceResult,
  Evidence,
} from '../../ai/coach/types';

function makeConfidence(overrides: Partial<ConfidenceResult> = {}): ConfidenceResult {
  return {
    level: 'medium',
    score: 50,
    factors: [],
    explanation: 'Base confidence.',
    ...overrides,
  };
}

describe('createEvidence', () => {
  it('should compute changePercent correctly', () => {
    const evidence = createEvidence({
      metric: 'Reaction Time',
      previous: 100,
      current: 120,
      unit: 'ms',
    });
    expect(evidence.changePercent).toBeCloseTo(20, 1);
  });

  it('should set direction to up for positive change', () => {
    const evidence = createEvidence({
      metric: 'Score',
      previous: 50,
      current: 75,
      unit: 'pts',
    });
    expect(evidence.direction).toBe('up');
    expect(evidence.changePercent).toBeGreaterThan(0);
  });

  it('should set direction to down for negative change', () => {
    const evidence = createEvidence({
      metric: 'Fatigue',
      previous: 0.8,
      current: 0.5,
      unit: '',
    });
    expect(evidence.direction).toBe('down');
    expect(evidence.changePercent).toBeLessThan(0);
  });

  it('should set direction to stable when values are equal', () => {
    const evidence = createEvidence({
      metric: 'Consistency',
      previous: 0.7,
      current: 0.7,
      unit: '',
    });
    expect(evidence.direction).toBe('stable');
    expect(evidence.changePercent).toBe(0);
  });

  it('should handle previous value of zero', () => {
    const evidence = createEvidence({
      metric: 'Accuracy',
      previous: 0,
      current: 50,
      unit: '%',
    });
    expect(evidence.changePercent).toBe(0);
    expect(evidence.direction).toBe('stable');
  });

  it('should preserve all fields', () => {
    const evidence = createEvidence({
      metric: 'Focus',
      previous: 60,
      current: 80,
      unit: 'score',
    });
    expect(evidence.metric).toBe('Focus');
    expect(evidence.previous).toBe(60);
    expect(evidence.current).toBe(80);
    expect(evidence.unit).toBe('score');
  });
});

describe('createExplanation', () => {
  it('should default researchTag to scientific', () => {
    const explanation = createExplanation({
      observation: 'Test observation',
      evidence: [],
      confidence: makeConfidence(),
      recommendation: 'Keep going',
    });
    expect(explanation.researchTag).toBe('scientific');
  });

  it('should use custom researchTag when provided', () => {
    const explanation = createExplanation({
      observation: 'Test observation',
      evidence: [],
      confidence: makeConfidence(),
      recommendation: 'Keep going',
      researchTag: 'experimental',
    });
    expect(explanation.researchTag).toBe('experimental');
  });

  it('should accept informational tag', () => {
    const explanation = createExplanation({
      observation: 'General note',
      evidence: [],
      confidence: makeConfidence(),
      recommendation: 'Stay hydrated',
      researchTag: 'informational',
    });
    expect(explanation.researchTag).toBe('informational');
  });

  it('should preserve evidence array', () => {
    const evidence: Evidence[] = [
      { metric: 'RT', previous: 300, current: 250, unit: 'ms', changePercent: -16.67, direction: 'down' },
    ];
    const explanation = createExplanation({
      observation: 'Improved',
      evidence,
      confidence: makeConfidence(),
      recommendation: 'Continue',
    });
    expect(explanation.evidence.length).toBe(1);
    expect(explanation.evidence[0]!.metric).toBe('RT');
  });

  it('should preserve all input fields', () => {
    const confidence = makeConfidence({ level: 'high', score: 85 });
    const explanation = createExplanation({
      observation: 'You are doing great',
      evidence: [],
      confidence,
      recommendation: 'Maintain your routine',
      researchTag: 'scientific',
    });
    expect(explanation.observation).toBe('You are doing great');
    expect(explanation.confidence).toBe(confidence);
    expect(explanation.recommendation).toBe('Maintain your routine');
  });
});

describe('formatExplanation', () => {
  it('should produce a string with all sections', () => {
    const explanation = createExplanation({
      observation: 'Your RT improved.',
      evidence: [
        { metric: 'RT', previous: 300, current: 250, unit: 'ms', changePercent: -16.67, direction: 'down' },
      ],
      confidence: makeConfidence({ level: 'high', score: 80 }),
      recommendation: 'Keep practicing.',
    });
    const formatted = formatExplanation(explanation);
    expect(formatted).toContain('Observation:');
    expect(formatted).toContain('Evidence:');
    expect(formatted).toContain('Confidence:');
    expect(formatted).toContain('Recommendation:');
  });

  it('should include confidence level in output', () => {
    const explanation = createExplanation({
      observation: 'Test',
      evidence: [],
      confidence: makeConfidence({ level: 'medium', score: 55 }),
      recommendation: 'Do more.',
    });
    const formatted = formatExplanation(explanation);
    expect(formatted).toContain('medium');
    expect(formatted).toContain('55');
  });

  it('should format evidence with change percentages', () => {
    const explanation = createExplanation({
      observation: 'Test',
      evidence: [
        { metric: 'Consistency', previous: 0.6, current: 0.8, unit: '', changePercent: 33.33, direction: 'up' },
      ],
      confidence: makeConfidence(),
      recommendation: 'Good.',
    });
    const formatted = formatExplanation(explanation);
    expect(formatted).toContain('Consistency');
    expect(formatted).toContain('+33.3%');
  });

  it('should handle multiple evidence items', () => {
    const explanation = createExplanation({
      observation: 'Multiple changes.',
      evidence: [
        { metric: 'RT', previous: 300, current: 250, unit: 'ms', changePercent: -16.67, direction: 'down' },
        { metric: 'Accuracy', previous: 0.7, current: 0.85, unit: '', changePercent: 21.43, direction: 'up' },
      ],
      confidence: makeConfidence(),
      recommendation: 'Keep up.',
    });
    const formatted = formatExplanation(explanation);
    expect(formatted).toContain('RT');
    expect(formatted).toContain('Accuracy');
  });

  it('should handle empty evidence array', () => {
    const explanation = createExplanation({
      observation: 'No data yet.',
      evidence: [],
      confidence: makeConfidence({ level: 'low', score: 10 }),
      recommendation: 'Collect more data.',
    });
    const formatted = formatExplanation(explanation);
    expect(formatted).toContain('Observation: No data yet.');
    expect(formatted).toContain('low');
  });
});
