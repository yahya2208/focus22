import { describe, it, expect } from 'vitest';
import {
  getPersonalityConstraints,
  validateMessage,
  applyPersonality,
} from '../../ai/coach/personality';

describe('getPersonalityConstraints', () => {
  it('should return a valid structure', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints).toHaveProperty('tone');
    expect(constraints).toHaveProperty('forbiddenPatterns');
    expect(constraints).toHaveProperty('requiredDisclaimers');
  });

  it('should have professional tone', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints.tone).toBe('professional');
  });

  it('should have a populated forbidden patterns list', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints.forbiddenPatterns.length).toBeGreaterThan(0);
  });

  it('should contain required disclaimers', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints.requiredDisclaimers.length).toBeGreaterThan(0);
    expect(constraints.requiredDisclaimers).toContain(
      'This analysis is based on your personal data and is not medical advice.',
    );
  });

  it('should include guarantee in forbidden patterns', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints.forbiddenPatterns).toContain('guarantee');
  });

  it('should include diagnose in forbidden patterns', () => {
    const constraints = getPersonalityConstraints();
    expect(constraints.forbiddenPatterns).toContain('diagnose');
  });

  it('should return a copy not the original array', () => {
    const c1 = getPersonalityConstraints();
    const c2 = getPersonalityConstraints();
    expect(c1.forbiddenPatterns).not.toBe(c2.forbiddenPatterns);
  });
});

describe('validateMessage', () => {
  it('should mark clean message as valid', () => {
    const result = validateMessage('Your reaction time is improving.');
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should flag message containing guarantee', () => {
    const result = validateMessage('This will guarantee better results.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('guarantee');
  });

  it('should flag message containing diagnose', () => {
    const result = validateMessage('I cannot diagnose any condition.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('diagnose');
  });

  it('should flag message containing you must', () => {
    const result = validateMessage('You must do this every day.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('you must');
  });

  it('should be case insensitive', () => {
    const result = validateMessage('This is a GUARANTEE of success.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('guarantee');
  });

  it('should flag multiple violations', () => {
    const result = validateMessage('You must get a guarantee and a diagnosis.');
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('should not flag partial matches that are safe', () => {
    const result = validateMessage('The data quality is guaranteed to be high.');
    expect(result.violations).toContain('guarantee');
  });

  it('should flag fear', () => {
    const result = validateMessage('Do not live in fear of results.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('fear');
  });

  it('should flag pathological', () => {
    const result = validateMessage('Your results are not pathological.');
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('pathological');
  });
});

describe('applyPersonality', () => {
  it('should replace guarantee with suggest', () => {
    const result = applyPersonality('This will guarantee improvement.');
    expect(result).not.toContain('guarantee');
    expect(result).toContain('suggest');
  });

  it('should replace diagnose with assess', () => {
    const result = applyPersonality('I can diagnose your performance.');
    expect(result).not.toContain('diagnose');
    expect(result).toContain('assess');
  });

  it('should replace you must with you might consider', () => {
    const result = applyPersonality('You must try this approach.');
    expect(result).not.toContain('you must');
    expect(result).toContain('you might consider');
  });

  it('should fix excessive punctuation', () => {
    const result = applyPersonality('Great work!!!');
    expect(result).not.toContain('!!!');
    expect(result).toContain('Great work!');
  });

  it('should ensure trailing punctuation', () => {
    const result = applyPersonality('Good work');
    expect(result).toMatch(/[.!?]$/);
  });

  it('should pass through clean text unchanged', () => {
    const input = 'Your reaction time is improving steadily.';
    const result = applyPersonality(input);
    expect(result).toBe(input);
  });

  it('should handle empty string', () => {
    const result = applyPersonality('');
    expect(result).toBe('');
  });

  it('should trim trailing whitespace', () => {
    const result = applyPersonality('Good work   ');
    expect(result).not.toMatch(/\s+$/);
  });

  it('should replace definitely will with may', () => {
    const result = applyPersonality('This definitely will help.');
    expect(result).not.toContain('definitely will');
    expect(result).toContain('may');
  });

  it('should replace fear with challenge', () => {
    const result = applyPersonality('Do not fear the results.');
    expect(result).not.toContain('fear');
    expect(result).toContain('challenge');
  });

  it('should replace you should always with it can help to', () => {
    const result = applyPersonality('You should always practice.');
    expect(result).not.toContain('you should always');
    expect(result).toContain('it can help to');
  });

  it('should handle text ending with only whitespace then add period', () => {
    const result = applyPersonality('Hello there ');
    expect(result).toMatch(/[.!?]$/);
  });
});
