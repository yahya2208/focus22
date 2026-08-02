import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';
import { ScientificDashboard } from '../../research-console/pages/scientific/ScientificDashboard';

function installEmptySupabase(): void {
  resetSupabaseClient();
  createSupabaseClientForTest();
  const client = getSupabaseClient();

  const f: Record<string, unknown> = {};
  Object.defineProperty(f, 'data', { get: () => [] });
  Object.defineProperty(f, 'error', { get: () => null });
  Object.defineProperty(f, 'count', { get: () => 0 });
  (f as Record<string, unknown>).select = () => f;
  (f as Record<string, unknown>).eq = () => f;
  (f as Record<string, unknown>).in = () => f;
  (f as Record<string, unknown>).gte = () => f;
  (f as Record<string, unknown>).lte = () => f;
  (f as Record<string, unknown>).order = () => f;
  (f as Record<string, unknown>).limit = () => f;

  vi.spyOn(client, 'from').mockImplementation((() => f) as never);
}

afterEach(() => {
  cleanup();
  resetSupabaseClient();
  vi.restoreAllMocks();
});

describe('Scientific data quality — empty dataset (no sessions)', () => {
  it('renders zero values, never NaN/Infinity/undefined, and a graceful "No data" histogram', async () => {
    installEmptySupabase();
    render(<ScientificDashboard />);

    await waitFor(() => expect(screen.getAllByText('0.0%').length).toBeGreaterThanOrEqual(1), { timeout: 5000 });

    const bad = ['NaN', 'Infinity', 'undefined', '10000'];
    for (const token of bad) {
      expect(screen.queryByText(new RegExp(token), { exact: false })).toBeNull();
    }

    expect(screen.getAllByText('0ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0.0ms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1);
  });
});
