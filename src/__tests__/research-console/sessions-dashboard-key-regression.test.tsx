import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SessionsDashboard } from '../../research-console/pages/sessions/SessionsDashboard';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';

const SESSIONS = [
  {
    id: 's1', user_id: 'u1', device_id: null, plugin_id: 'focus', status: 'completed',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    measurements: { corrected_rts: [250, 260, 270, 280, 290, 300, 310], total_rounds: 7 },
    scientific_results: { grade: 'A', focus_score: 88, consistency_rating: 'excellent' },
    metadata: { version: '2.0' }, campaign_id: null,
  },
  {
    id: 's2', user_id: 'u2', device_id: null, plugin_id: 'focus', status: 'completed',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    measurements: { corrected_rts: [300, 310, 320], total_rounds: 3 },
    scientific_results: { grade: 'B', focus_score: 70, consistency_rating: 'good' },
    metadata: { version: '2.0' }, campaign_id: 'c1',
  },
  {
    id: 's3', user_id: 'u3', device_id: null, plugin_id: 'focus', status: 'running',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    measurements: { corrected_rts: [240, 245] }, scientific_results: null,
    metadata: { version: '2.0' }, campaign_id: null,
  },
] as const;

function installFakeSupabase(): void {
  resetSupabaseClient();
  createSupabaseClientForTest();
  const client = getSupabaseClient();

  vi.spyOn(client, 'from').mockImplementation(((table: string) => {
    const mods: { inVals?: unknown[]; limit?: number } = {};
    const f: Record<string, unknown> = {};

    Object.defineProperty(f, 'data', {
      get: () => {
        if (table === 'sessions') {
          if (mods.inVals && mods.inVals.includes('u1')) return [];
          return [...SESSIONS];
        }
        if (table === 'users') return [];
        if (table === 'devices') return [];
        return [];
      },
    });
    Object.defineProperty(f, 'error', { get: () => null });
    Object.defineProperty(f, 'count', { get: () => undefined });

    (f as Record<string, unknown>).select = () => f;
    (f as Record<string, unknown>).eq = () => f;
    (f as Record<string, unknown>).in = (_col: string, vals: unknown[]) => { mods.inVals = vals; return f; };
    (f as Record<string, unknown>).order = () => f;
    (f as Record<string, unknown>).limit = (n: number) => { mods.limit = n; return f; };
    (f as Record<string, unknown>).maybeSingle = async () => ({ data: null, error: null });
    (f as Record<string, unknown>).single = async () => ({ data: null, error: null });
    (f as Record<string, unknown>).not = () => f;
    (f as Record<string, unknown>).gte = () => f;
    (f as Record<string, unknown>).lte = () => f;
    return f as never;
  }) as never);
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  resetSupabaseClient();
  vi.restoreAllMocks();
});

describe('SessionsDashboard — React key warning regression', () => {
  it('renders rows with data, expands a row (conditional render), and never emits a key warning', async () => {
    installFakeSupabase();

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    const { container } = render(<SessionsDashboard />);

    await waitFor(() => {
      expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    });

    const keyWarningsBefore = errors.filter((e) => /each child in a list|unique "key"/i.test(e));
    expect(keyWarningsBefore).toEqual([]);

    const firstRow = container.querySelector('tbody tr')!;
    fireEvent.click(firstRow);
    fireEvent.click(firstRow);

    const keyWarningsAfter = errors.filter((e) => /each child in a list|unique "key"/i.test(e));
    expect(keyWarningsAfter).toEqual([]);

    spy.mockRestore();
  });
});
