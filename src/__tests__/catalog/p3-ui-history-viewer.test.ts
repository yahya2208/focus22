/**
 * P3-C — History Viewer UI Logic Tests
 *
 * Tests history viewer state machine:
 *   - Action badge rendering
 *   - Timestamp formatting
 *   - Pagination offset management
 *   - Empty state handling
 *
 * Pure unit tests. No database connection, no React rendering.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  model_id: string;
  action: string;
  user_id: string;
  details: string | null;
  created_at: string;
}

// ─── Logic ───────────────────────────────────────────────────────────────────

function getActionColor(action: string): 'success' | 'danger' | 'warning' | 'accent' | 'muted' {
  if (action === 'APPROVE') return 'success';
  if (action === 'REJECT') return 'danger';
  if (action === 'REOPEN') return 'warning';
  if (action === 'CREATE') return 'accent';
  return 'muted';
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function canLoadMore(shownCount: number, totalEstimate?: number): boolean {
  if (totalEstimate !== undefined) return shownCount < totalEstimate;
  return shownCount >= 20;
}

function nextOffset(currentOffset: number, limit: number): number {
  return currentOffset + limit;
}

function prevOffset(currentOffset: number, limit: number): number {
  return Math.max(0, currentOffset - limit);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ENTRIES: HistoryEntry[] = [
  { id: 'h1', model_id: 'm1', action: 'CREATE', user_id: 'u1', details: 'Initial creation', created_at: '2024-01-01T10:00:00Z' },
  { id: 'h2', model_id: 'm1', action: 'APPROVE', user_id: 'u2', details: 'Approved by admin', created_at: '2024-01-02T14:30:00Z' },
  { id: 'h3', model_id: 'm1', action: 'REJECT', user_id: 'u2', details: 'Missing specs', created_at: '2024-01-03T09:15:00Z' },
  { id: 'h4', model_id: 'm1', action: 'REOPEN', user_id: 'u1', details: null, created_at: '2024-01-04T16:45:00Z' },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3-C History — Action Badges', () => {
  it('APPROVE returns success color', () => {
    expect(getActionColor('APPROVE')).toBe('success');
  });

  it('REJECT returns danger color', () => {
    expect(getActionColor('REJECT')).toBe('danger');
  });

  it('REOPEN returns warning color', () => {
    expect(getActionColor('REOPEN')).toBe('warning');
  });

  it('CREATE returns accent color', () => {
    expect(getActionColor('CREATE')).toBe('accent');
  });

  it('unknown action returns muted color', () => {
    expect(getActionColor('UPDATE')).toBe('muted');
  });
});

describe('P3-C History — Timestamp Formatting', () => {
  it('formats ISO timestamp', () => {
    const result = formatTimestamp('2024-01-01T10:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('1');
  });

  it('invalid timestamp returns raw string', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('formats different date', () => {
    const result = formatTimestamp('2024-12-25T00:00:00Z');
    expect(result).toContain('Dec');
    expect(result).toContain('25');
  });
});

describe('P3-C History — Pagination', () => {
  it('can load more when 20+ entries shown', () => {
    expect(canLoadMore(20)).toBe(true);
  });

  it('cannot load more when fewer than 20 entries', () => {
    expect(canLoadMore(5)).toBe(false);
  });

  it('next offset increments correctly', () => {
    expect(nextOffset(0, 20)).toBe(20);
    expect(nextOffset(20, 20)).toBe(40);
  });

  it('prev offset decrements correctly', () => {
    expect(prevOffset(20, 20)).toBe(0);
    expect(prevOffset(40, 20)).toBe(20);
  });

  it('prev offset floors at 0', () => {
    expect(prevOffset(5, 20)).toBe(0);
    expect(prevOffset(0, 20)).toBe(0);
  });
});

describe('P3-C History — Empty State', () => {
  it('empty entries returns empty array', () => {
    const entries: HistoryEntry[] = [];
    expect(entries).toHaveLength(0);
  });

  it('entry with null details handled', () => {
    const entry = ENTRIES[3]!;
    expect(entry.details).toBeNull();
  });
});
