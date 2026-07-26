import type { PersonalityConstraints } from './types';

const FORBIDDEN_PATTERNS: readonly string[] = [
  'guarantee',
  'cure',
  'diagnose',
  'medical',
  'definitely will',
  'you must',
  'you should always',
  'fear',
  'danger',
  'worse than',
  "you're broken",
  'pathological',
  'abnormal',
];

const REQUIRED_DISCLAIMERS: readonly string[] = [
  'This analysis is based on your personal data and is not medical advice.',
  'Results may vary based on testing conditions.',
];

export function getPersonalityConstraints(): PersonalityConstraints {
  return {
    tone: 'professional',
    forbiddenPatterns: [...FORBIDDEN_PATTERNS],
    requiredDisclaimers: [...REQUIRED_DISCLAIMERS],
  };
}

export function validateMessage(message: string): {
  readonly valid: boolean;
  readonly violations: readonly string[];
} {
  const lower = message.toLowerCase();
  const violations: string[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      violations.push(pattern);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function applyPersonality(text: string): string {
  let result = text;

  const replacements: Record<string, string> = {
    guarantee: 'suggest',
    cure: 'improve',
    diagnose: 'assess',
    medical: 'health-related',
    'definitely will': 'may',
    'you must': 'you might consider',
    'you should always': 'it can help to',
    fear: 'challenge',
    danger: 'risk',
    'worse than': 'different from',
    "you're broken": 'there is room for growth',
    pathological: 'notable',
    abnormal: 'unusual',
  };

  const lower = result.toLowerCase();
  for (const [pattern, replacement] of Object.entries(replacements)) {
    if (lower.includes(pattern)) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, replacement);
    }
  }

  result = result.replace(/!{2,}/g, '!');

  result = result.trimEnd();
  if (result.length > 0 && !/[.!?]$/.test(result)) {
    result += '.';
  }

  return result;
}
