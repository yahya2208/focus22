import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewCounter } from '../../hooks/useViewCounter';

const KEY = 'showroom_view_counts';

describe('Phase 3B §6 — useViewCounter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('increments once per session and persists the count', async () => {
    const first = renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'rec_1' } });
    expect(first.result.current.count).toBe(1);
    first.unmount();

    const second = renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'rec_1' } });
    expect(second.result.current.count).toBe(1);

    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(stored['rec_1']).toBe(1);
  });

  it('dedupes within the same session (no double count on remount)', () => {
    const { unmount } = renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'rec_x' } });
    unmount();
    const second = renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'rec_x' } });
    unmount();
    expect(second.result.current.count).toBe(1);
  });

  it('returns 0 for unknown/absent ids without touching storage', () => {
    const { result } = renderHook(() => useViewCounter(null));
    expect(result.current.count).toBe(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('counts distinct records separately', () => {
    renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'a' } });
    renderHook(({ id }) => useViewCounter(id), { initialProps: { id: 'b' } });
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(stored['a']).toBe(1);
    expect(stored['b']).toBe(1);
  });
});
