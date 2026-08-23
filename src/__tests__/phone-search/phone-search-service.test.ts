import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock }),
}));

vi.mock('../../services/intent-tracking', () => ({
  getVisitorHash: () => 'abc123def456',
}));

import { recordPhoneSearch, recordSearchSelection } from '../../services/phone-search-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordPhoneSearch', () => {
  it('calls record_phone_search RPC with correct params', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, search_event_id: 7, deduped: false },
      error: null,
    });

    const result = await recordPhoneSearch('iphone 15', 3, 'showroom');

    expect(rpcMock).toHaveBeenCalledWith('record_phone_search', {
      p_query_text: 'iphone 15',
      p_results_count: 3,
      p_visitor_hash: 'abc123def456',
      p_context: 'showroom',
    });
    expect(result).toEqual({ searchEventId: 7, deduped: false });
  });

  it('returns null on RPC error without throwing', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    const result = await recordPhoneSearch('test', 1, 'showroom');
    expect(result).toBeNull();
  });

  it('returns null when RPC throws', async () => {
    rpcMock.mockRejectedValue(new Error('network'));

    const result = await recordPhoneSearch('test', 1, 'showroom');
    expect(result).toBeNull();
  });

  it('returns null when data contains error field', async () => {
    rpcMock.mockResolvedValue({ data: { error: 'RATE_LIMITED' }, error: null });

    const result = await recordPhoneSearch('test', 1, 'showroom');
    expect(result).toBeNull();
  });

  it('returns null when data is null (rate limited)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await recordPhoneSearch('test', 1, 'showroom');
    expect(result).toBeNull();
  });
});

describe('recordSearchSelection', () => {
  it('calls record_search_selection RPC with correct params', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });

    await recordSearchSelection(42, 'device-abc', 'showroom');

    expect(rpcMock).toHaveBeenCalledWith('record_search_selection', {
      p_search_event_id: 42,
      p_device_id: 'device-abc',
      p_context: 'showroom',
    });
  });

  it('does not throw on error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'fail' } });

    await expect(recordSearchSelection(1, 'x', 'catalog')).resolves.toBeUndefined();
  });

  it('does not throw on exception', async () => {
    rpcMock.mockRejectedValue(new Error('boom'));

    await expect(recordSearchSelection(1, 'x', 'catalog')).resolves.toBeUndefined();
  });
});
