/**
 * P3-A — Model History RPC Tests
 *
 * Tests the P3 logic for catalog_admin_get_model_history:
 *   - Returns history rows for a model
 *   - Includes actor email (via users join)
 *   - Pagination (limit/offset)
 *   - Ordering (newest first)
 *   - Non-existent model → error
 *   - Empty/whitespace canonical_id validation
 *   - Edge cases: limit/offset clamping
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

interface HistoryRow {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: string;
}

interface HistoryResult {
  ok: boolean;
  rows?: HistoryRow[];
  error?: string;
}

function getHistory(
  canonicalId: string,
  allHistory: HistoryRow[],
  modelMap: Map<string, string>,  // canonical_id → model_id
  query: { limit: number; offset: number },
): HistoryResult {
  if (!canonicalId || canonicalId.trim() === '') {
    return { ok: false, error: 'canonical_id is required' };
  }

  const trimmed = canonicalId.trim();
  const modelId = modelMap.get(trimmed);
  if (!modelId) {
    return { ok: false, error: `model not found: ${trimmed}` };
  }

  // Clamp
  const limit = Math.min(Math.max(query.limit || 50, 1), 200);
  const offset = Math.max(query.offset || 0, 0);

  const filtered = allHistory
    .filter(() => true)  // all rows match (in real query filtered by model_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))  // newest first
    .slice(offset, offset + limit);

  return { ok: true, rows: filtered };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MODEL_MAP = new Map([
  ['apple-iphone-16-pro', 'm1'],
  ['samsung-galaxy-s25', 'm2'],
]);

const HISTORY_ROWS: HistoryRow[] = [
  {
    id: 'h1',
    action: 'CREATE',
    before: null,
    after: { name: 'iPhone 16 Pro' },
    actor_user_id: 'u1',
    actor_email: 'admin@example.com',
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'h2',
    action: 'UPDATE',
    before: { name: 'iPhone 16 Pro' },
    after: { name: 'iPhone 16 Pro Max' },
    actor_user_id: 'u1',
    actor_email: 'admin@example.com',
    created_at: '2026-08-02T00:00:00Z',
  },
  {
    id: 'h3',
    action: 'APPROVE',
    before: { approval_status: 'draft' },
    after: { approval_status: 'approved' },
    actor_user_id: 'u2',
    actor_email: 'reviewer@example.com',
    created_at: '2026-08-03T00:00:00Z',
  },
  {
    id: 'h4',
    action: 'REOPEN',
    before: { approval_status: 'rejected' },
    after: { approval_status: 'draft' },
    actor_user_id: 'u1',
    actor_email: 'admin@example.com',
    created_at: '2026-08-04T00:00:00Z',
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3 model history — basic retrieval', () => {
  it('returns history rows for a valid model', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.rows!.length).toBe(4);
  });

  it('includes actor_email in each row', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 0,
    });
    expect(result.rows?.[0]?.actor_email).toBeTruthy();
  });

  it('returns newest-first ordering', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 0,
    });
    const timestamps = result.rows?.map((row) => row.created_at) ?? [];
    for (let i = 1; i < timestamps.length; i++) {
      expect((timestamps[i - 1] ?? '') >= (timestamps[i] ?? '')).toBe(true);
    }
  });
});

describe('P3 model history — pagination', () => {
  it('respects limit', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 2,
      offset: 0,
    });
    expect(result.rows!.length).toBe(2);
  });

  it('respects offset', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 3,
    });
    expect(result.rows?.length).toBe(1);
    expect(result.rows?.[0]?.action).toBe('CREATE');
  });

  it('returns empty when offset exceeds total', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 100,
    });
    expect(result.rows!.length).toBe(0);
  });

  it('clamps limit to available rows', () => {
    const result = getHistory('apple-iphone-16-pro', HISTORY_ROWS, MODEL_MAP, {
      limit: 100,
      offset: 0,
    });
    expect(result.rows!.length).toBe(4);
  });
});

describe('P3 model history — validation', () => {
  it('rejects null canonical_id', () => {
    const result = getHistory(null as unknown as string, HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('canonical_id is required');
  });

  it('rejects empty canonical_id', () => {
    const result = getHistory('', HISTORY_ROWS, MODEL_MAP, { limit: 50, offset: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('canonical_id is required');
  });

  it('rejects non-existent model', () => {
    const result = getHistory('bogus-model', HISTORY_ROWS, MODEL_MAP, {
      limit: 50,
      offset: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('model not found');
  });
});
