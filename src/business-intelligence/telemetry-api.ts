import { getSupabaseClient } from '../core/supabase/client';
import { devError } from '../core/logging';

/**
 * Admin Telemetry Analytics API (T4.2).
 *
 * Single client entry point for the secure telemetry read path. Every call is
 * routed through the SECURITY DEFINER RPC `get_telemetry_analytics` — the ONLY
 * reader of `telemetry_events`. The RPC authorizes the caller server-side
 * (admin / super_admin / researcher) and returns AGGREGATED jsonb (counts and
 * top-N business entity ids). This module NEVER reads raw telemetry rows and
 * never holds raw user/session/anonymous identifiers.
 *
 * Error contract (mirrors get_phone_intelligence precedent):
 *   - RPC transport error            -> returns null (caller shows "RPC failure")
 *   - `{error:'UNAUTHORIZED'}`       -> caller not allowed (permission denied)
 *   - `{error:'INVALID_FILTER'}`     -> a filter value was rejected
 *   - `{error:'INVALID_DATE_RANGE'}` -> date window inverted
 * A successful call returns `error: null` and the aggregate sections below.
 */

export interface TelemetryAnalyticsFilters {
  readonly dateFrom?: string | null;
  readonly dateTo?: string | null;
  readonly domain?: string | null;
  readonly event?: string | null;
  readonly game?: string | null;
  readonly entityId?: string | null;
}

export interface TelemetryTotals {
  readonly total_events: number;
  readonly unique_sessions: number;
  readonly unique_visitors: number;
  readonly unique_users: number;
}

export interface TelemetryCountRow {
  readonly event: string;
  readonly count: number;
}

export interface TelemetryDomainRow {
  readonly domain: string;
  readonly count: number;
}

export interface TelemetryDailyRow {
  readonly date: string;
  readonly count: number;
}

export interface TelemetryEntityRow {
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly count: number;
}

/** Per-domain funnel counters (each key is a closed-content name/count). */
export type TelemetryFunnel = Record<string, number>;

export type TelemetryAnalyticsError = 'UNAUTHORIZED' | 'INVALID_FILTER' | 'INVALID_DATE_RANGE';

export interface TelemetryAnalytics {
  readonly error: TelemetryAnalyticsError | null;
  readonly applied: {
    readonly date_from: string | null;
    readonly date_to: string | null;
    readonly domain: string | null;
    readonly event: string | null;
    readonly game: string | null;
    readonly entity_id: string | null;
  };
  readonly totals: TelemetryTotals | null;
  readonly events_by_event: TelemetryCountRow[];
  readonly events_by_domain: TelemetryDomainRow[];
  readonly daily: TelemetryDailyRow[];
  readonly top_entities: TelemetryEntityRow[];
  readonly category: TelemetryFunnel | null;
  readonly product: TelemetryFunnel | null;
  readonly listing: TelemetryFunnel | null;
  readonly cart: TelemetryFunnel | null;
  readonly request: TelemetryFunnel | null;
  readonly game: TelemetryFunnel | null;
  readonly ad: TelemetryFunnel | null;
  readonly system: TelemetryFunnel | null;
}

/**
 * Fetch aggregated telemetry analytics for the given filters.
 * Returns `null` on a transport/RPC failure (distinct from a permission error,
 * which surfaces as `{error:'UNAUTHORIZED'}` in the returned object).
 */
export async function getTelemetryAnalytics(
  filters: TelemetryAnalyticsFilters = {},
): Promise<TelemetryAnalytics | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_telemetry_analytics', {
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_domain: filters.domain ?? null,
    p_event: filters.event ?? null,
    p_game: filters.game ?? null,
    p_entity_id: filters.entityId ?? null,
  });

  if (error) {
    devError('[telemetry-analytics] RPC failed', error);
    return null;
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return data as TelemetryAnalytics;
  }
  if (data && typeof data === 'object') {
    return data as TelemetryAnalytics;
  }
  devError('[telemetry-analytics] unexpected RPC response');
  return null;
}

/** Convenience: true when the caller is authorized but has no telemetry data. */
export function isTelemetryEmpty(a: TelemetryAnalytics): boolean {
  return a.error === null && (a.totals?.total_events ?? 0) === 0;
}

/** Convenience: true when the RPC returned a permission error. */
export function isTelemetryUnauthorized(a: TelemetryAnalytics | null): boolean {
  return a !== null && a.error === 'UNAUTHORIZED';
}
