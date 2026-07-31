import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDataService,
  resetDataService,
  type CampaignLookupResult,
} from '../../core/supabase/data-service';

interface RpcErrorLike {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

function clientWith(rpcResult: { data: unknown; error: RpcErrorLike | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(rpcResult);
  const rpc = vi.fn(() => ({ maybeSingle }));
  return { client: { rpc, maybeSingle } as unknown as SupabaseClient, rpc, maybeSingle };
}

function service(client: SupabaseClient) {
  resetDataService();
  return getDataService(client);
}

const campaignRow: CampaignLookupResult = {
  id: 'a0626da4-d89c-45a9-84e8-0d71b531d08b',
  short_code: 'test01',
  name: 'P3 Test Campaign',
  is_active: true,
};

afterEach(() => {
  resetDataService();
  vi.restoreAllMocks();
});

describe('getCampaignByShortCode', () => {
  it('returns the CampaignLookupResult when the campaign exists', async () => {
    const { client, rpc, maybeSingle } = clientWith({ data: campaignRow, error: null });
    const ds = service(client);

    const result = await ds.getCampaignByShortCode('test01');

    expect(rpc).toHaveBeenCalledWith('lookup_campaign_by_short_code', { p_code: 'test01' });
    expect(maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(campaignRow);
  });

  it('returns null when no campaign exists', async () => {
    const { client, rpc } = clientWith({ data: null, error: null });
    const ds = service(client);

    const result = await ds.getCampaignByShortCode('does-not-exist');

    expect(rpc).toHaveBeenCalledWith('lookup_campaign_by_short_code', { p_code: 'does-not-exist' });
    expect(result).toBeNull();
  });

  it('throws with a clear message when the RPC is missing (PGRST202)', async () => {
    const error = { code: 'PGRST202', message: 'Could not find the function public.lookup_campaign_by_short_code' };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = clientWith({ data: null, error });
    const ds = service(client);

    await expect(ds.getCampaignByShortCode('test01')).rejects.toMatchObject({ code: 'PGRST202' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'lookup_campaign_by_short_code RPC is missing. Run the database migration.',
    );
  });

  it('throws when multiple rows are returned (data corruption / missing index)', async () => {
    const error = {
      code: 'PGRST116',
      details: 'The result contains 2 rows',
      message: 'JSON object requested, multiple (or no) rows returned',
      hint: null,
    };
    const { client } = clientWith({ data: null, error });
    const ds = service(client);

    await expect(ds.getCampaignByShortCode('dup')).rejects.toMatchObject({ code: 'PGRST116' });
  });

  it('throws on permission denied (42501) instead of returning null', async () => {
    const error = { code: '42501', message: 'permission denied for function lookup_campaign_by_short_code', details: null, hint: null };
    const { client } = clientWith({ data: null, error });
    const ds = service(client);

    await expect(ds.getCampaignByShortCode('test01')).rejects.toMatchObject({ code: '42501' });
  });
});
