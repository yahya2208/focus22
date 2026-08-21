import { describe, expect, it } from 'vitest';

/**
 * #4 Phone View Counter — Migration gate tests.
 *
 * Verifies that migration 00029 contains the required schema objects.
 * Structural checks only — validates the SQL file content, not execution.
 */

const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const migration29 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00029_phone_view_counters.sql'),
)?.[1] as string;

describe('00029_phone_view_counters.sql', () => {
  it('creates phone_view_counts table with required columns', () => {
    expect(migration29).toContain('CREATE TABLE IF NOT EXISTS public.phone_view_counts');
    expect(migration29).toContain('device_id');
    expect(migration29).toContain('total_views');
    expect(migration29).toContain('unique_views');
    expect(migration29).toContain('last_viewed_at');
    expect(migration29).toContain('updated_at');
  });

  it('creates phone_view_events table with required columns', () => {
    expect(migration29).toContain('CREATE TABLE IF NOT EXISTS public.phone_view_events');
    expect(migration29).toContain('id');
    expect(migration29).toContain('device_id');
    expect(migration29).toContain('identity_key');
    expect(migration29).toContain('event_type');
    expect(migration29).toContain('is_unique');
    expect(migration29).toContain('recorded_at');
  });

  it('has CHECK constraint for event_type', () => {
    expect(migration29).toContain("CHECK (event_type IN ('card_view', 'detail_view'))");
  });

  it('creates dedup index on (device_id, identity_key, recorded_at) — no event_type', () => {
    expect(migration29).toContain('idx_view_events_dedup');
    expect(migration29).toContain('device_id, identity_key, recorded_at');
  });

  it('creates separate rate_limit index with event_type', () => {
    expect(migration29).toContain('idx_view_events_rate_limit');
    expect(migration29).toContain('device_id, identity_key, event_type, recorded_at');
  });

  it('creates device_time index for analytics', () => {
    expect(migration29).toContain('idx_view_events_device_time');
  });

  it('creates recorded_at index for cleanup', () => {
    expect(migration29).toContain('idx_view_events_recorded_at');
  });

  it('enables RLS on both tables', () => {
    expect(migration29).toContain('ALTER TABLE public.phone_view_counts ENABLE ROW LEVEL SECURITY');
    expect(migration29).toContain('ALTER TABLE public.phone_view_events ENABLE ROW LEVEL SECURITY');
  });

  it('creates public read policy on phone_view_counts', () => {
    expect(migration29).toContain('Public read view counts');
    expect(migration29).toContain('phone_view_counts FOR SELECT');
  });

  it('creates staff-only read policy on phone_view_events', () => {
    expect(migration29).toContain('Staff read view events');
    expect(migration29).toContain('phone_view_events FOR SELECT');
  });

  it('creates record_phone_view SECURITY DEFINER RPC', () => {
    expect(migration29).toContain('CREATE OR REPLACE FUNCTION public.record_phone_view');
    expect(migration29).toContain('SECURITY DEFINER');
    expect(migration29).toContain('LANGUAGE plpgsql');
  });

  it('record_phone_view returns jsonb', () => {
    expect(migration29).toContain('RETURNS jsonb');
  });

  it('record_phone_view validates device exists', () => {
    expect(migration29).toContain('inventory_items');
    expect(migration29).toContain('INVALID_DEVICE');
  });

  it('record_phone_view uses auth.uid() for authenticated identity', () => {
    expect(migration29).toContain('auth.uid()');
  });

  it('record_phone_view validates visitor_hash format for guests', () => {
    expect(migration29).toContain("'^[a-f0-9]{16,64}$'");
    expect(migration29).toContain('INVALID_VISITOR');
  });

  it('record_phone_view has rate limiting', () => {
    expect(migration29).toContain('RATE_LIMITED');
    expect(migration29).toContain('LIMIT 1 OFFSET');
  });

  it('record_phone_view dedup check excludes event_type (unique per identity+phone)', () => {
    expect(migration29).toContain('NOT EXISTS');
    expect(migration29).toContain('interval');
    // The dedup SELECT must NOT filter on event_type — only device_id + identity_key + recorded_at
    const dedupStart = migration29.indexOf('SELECT NOT EXISTS');
    const dedupEnd = migration29.indexOf('INTO v_is_unique');
    const dedupSql = migration29.substring(dedupStart, dedupEnd);
    // Extract only the WHERE clause (skip comments)
    const whereMatch = dedupSql.match(/WHERE[\s\S]*$/);
    expect(whereMatch).toBeTruthy();
    const whereClause = whereMatch![0];
    expect(whereClause).toContain('device_id');
    expect(whereClause).toContain('identity_key');
    expect(whereClause).toContain('recorded_at');
    expect(whereClause).not.toMatch(/AND\s+event_type/);
  });

  it('record_phone_view inserts event and upserts counter atomically', () => {
    expect(migration29).toContain('INSERT INTO phone_view_events');
    expect(migration29).toContain('INSERT INTO phone_view_counts');
    expect(migration29).toContain('ON CONFLICT (device_id) DO UPDATE SET');
  });

  it('record_phone_view returns ok, total, unique, is_unique', () => {
    expect(migration29).toContain("'ok'");
    expect(migration29).toContain("'total'");
    expect(migration29).toContain("'unique'");
    expect(migration29).toContain("'is_unique'");
  });

  it('creates get_phone_view_counts SECURITY DEFINER RPC', () => {
    expect(migration29).toContain('CREATE OR REPLACE FUNCTION public.get_phone_view_counts');
    expect(migration29).toContain('SECURITY DEFINER');
    expect(migration29).toContain('STABLE');
  });

  it('get_phone_view_counts accepts text[] and returns jsonb', () => {
    expect(migration29).toContain('p_device_ids text[]');
    expect(migration29).toContain('RETURNS jsonb');
  });

  it('revokes PUBLIC execute and grants to anon + authenticated', () => {
    expect(migration29).toContain('REVOKE ALL ON FUNCTION public.record_phone_view');
    expect(migration29).toContain('REVOKE ALL ON FUNCTION public.get_phone_view_counts');
    expect(migration29).toContain('GRANT EXECUTE ON FUNCTION public.record_phone_view');
    expect(migration29).toContain('GRANT EXECUTE ON FUNCTION public.get_phone_view_counts');
  });
});
