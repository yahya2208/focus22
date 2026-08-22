import { describe, it, expect } from 'vitest';
import React from 'react';
import { ClaimReceipt } from '../../components/challenge/ClaimReceipt';

describe('ClaimReceipt', () => {
  const baseProps = {
    challengeName: 'Speed Focus',
    displayName: 'Alice',
    focusScore: 92,
    grade: 'A',
    rank: 1,
    claimCode: 'A1B2C3D4',
    claimId: 'clm_abc123',
    verificationToken: 'tok_xyz789abcdef',
    issuedAt: '2026-08-21T10:00:00Z',
    expiresAt: '2026-08-22T10:00:00Z',
  };

  it('exports a renderable function component', () => {
    expect(ClaimReceipt).toBeDefined();
    expect(typeof ClaimReceipt).toBe('function');
  });

  it('creates a valid React element with all props', () => {
    const el = React.createElement(ClaimReceipt, baseProps);
    expect(el.type).toBe(ClaimReceipt);
    expect(el.props.challengeName).toBe('Speed Focus');
    expect(el.props.claimCode).toBe('A1B2C3D4');
    expect(el.props.verificationToken).toBe('tok_xyz789abcdef');
  });

  it('accepts different grade values', () => {
    for (const grade of ['A', 'B', 'C', 'D', 'F']) {
      const el = React.createElement(ClaimReceipt, { ...baseProps, grade });
      expect(el.props.grade).toBe(grade);
    }
  });

  it('accepts different rank values', () => {
    for (const rank of [1, 2, 3, 10, 50]) {
      const el = React.createElement(ClaimReceipt, { ...baseProps, rank });
      expect(el.props.rank).toBe(rank);
    }
  });

  it('accepts a long claim code', () => {
    const longCode = 'ABCD1234';
    const el = React.createElement(ClaimReceipt, { ...baseProps, claimCode: longCode });
    expect(el.props.claimCode).toBe(longCode);
  });
});
