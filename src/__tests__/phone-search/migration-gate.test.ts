import { describe, it, expect } from 'vitest';
import applySql from '../../../supabase/migrations/00030_phone_search_events.sql?raw';

describe('00030_phone_search_events.sql', () => {
  it('creates phone_search_events table with required columns', () => {
    expect(applySql).toContain('CREATE TABLE IF NOT EXISTS public.phone_search_events');
    expect(applySql).toContain('identity_key');
    expect(applySql).toContain('query_text');
    expect(applySql).toContain('results_count');
    expect(applySql).toContain('context');
    expect(applySql).toContain('recorded_at');
  });

  it('creates phone_search_selections table with required columns', () => {
    expect(applySql).toContain('CREATE TABLE IF NOT EXISTS public.phone_search_selections');
    expect(applySql).toContain('search_event_id');
    expect(applySql).toContain('device_id');
    expect(applySql).toContain('context');
    expect(applySql).toContain('recorded_at');
  });

  it('enforces context CHECK on both tables', () => {
    expect(applySql).toContain("CHECK (context IN ('showroom', 'catalog'))");
  });

  it('has FK from selections to search_events', () => {
    expect(applySql).toContain('REFERENCES public.phone_search_events(id) ON DELETE CASCADE');
  });

  it('creates record_phone_search RPC', () => {
    expect(applySql).toContain('CREATE OR REPLACE FUNCTION public.record_phone_search');
    expect(applySql).toContain('SECURITY DEFINER');
  });

  it('creates record_search_selection RPC', () => {
    expect(applySql).toContain('CREATE OR REPLACE FUNCTION public.record_search_selection');
    expect(applySql).toContain('SECURITY DEFINER');
  });

  it('staff-only RLS on search events', () => {
    expect(applySql).toContain('Staff read search events');
    expect(applySql).toContain("u.role IN ('admin', 'super_admin', 'researcher')");
  });

  it('staff-only RLS on search selections', () => {
    expect(applySql).toContain('Staff read search selections');
  });

  it('does NOT grant INSERT/UPDATE/DELETE to any role', () => {
    const lines = applySql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toContain('GRANT INSERT');
    expect(nonComment).not.toContain('GRANT UPDATE');
    expect(nonComment).not.toContain('GRANT DELETE');
  });

  it('grants EXECUTE on both RPCs to anon and authenticated', () => {
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.record_phone_search');
    expect(applySql).toContain('GRANT EXECUTE ON FUNCTION public.record_search_selection');
  });

  it('enables RLS on both tables', () => {
    expect(applySql).toContain('ALTER TABLE public.phone_search_events ENABLE ROW LEVEL SECURITY');
    expect(applySql).toContain('ALTER TABLE public.phone_search_selections ENABLE ROW LEVEL SECURITY');
  });

  it('record_phone_search has rate limit', () => {
    expect(applySql).toContain('v_rate_limit');
    expect(applySql).toContain('interval \'1 hour\'');
  });

  it('record_phone_search has dedup on identical query within 10 seconds', () => {
    expect(applySql).toContain('interval \'10 seconds\'');
  });

  it('record_phone_search bounds query to 200 chars', () => {
    expect(applySql).toContain('left(trim(p_query_text), 200)');
  });

  it('record_search_selection validates search_event_id exists', () => {
    expect(applySql).toContain('SELECT 1 FROM phone_search_events WHERE id = p_search_event_id');
  });

  it('record_search_selection validates device exists', () => {
    expect(applySql).toContain('SELECT 1 FROM inventory_items WHERE id = p_device_id');
  });
});
