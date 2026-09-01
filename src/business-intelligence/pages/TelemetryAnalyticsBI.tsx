import { useState, useEffect, useMemo, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  getTelemetryAnalytics,
  isTelemetryEmpty,
  isTelemetryUnauthorized,
  type TelemetryAnalytics,
  type TelemetryAnalyticsFilters,
  type TelemetryFunnel,
} from '../telemetry-api';

/**
 * T4.2 Phase 3-5 — Admin Telemetry Analytics dashboard.
 *
 * Consumes ONLY the aggregated output of the secure RPC `get_telemetry_analytics`
 * (via `getTelemetryAnalytics`). No raw rows, no user/session/anonymous ids.
 *
 * State handled here:
 *   loadError      -> RPC transport failure (null from the API)
 *   permissionDenied -> RPC returned {error:'UNAUTHORIZED'}
 *   empty          -> authorized, zero events
 *   unwired        -> a funnel/key exists in the contract but emits no data yet
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'rpc-failure' }
  | { kind: 'unauthorized' }
  | { kind: 'empty' }
  | { kind: 'ready'; data: TelemetryAnalytics };

/** Contract events that the app does NOT wire yet (from T4.1 inventory).
 *  These may show "Not wired" instead of a measured 0. */
const NOT_WIRED: Record<string, string[]> = {
  product: ['image_view', 'variant_select', 'details_expand', 'favorite', 'contact', 'back'],
  listing: ['create_start', 'create_submit', 'create_success', 'create_failed', 'share', 'edit_start', 'edit_success', 'publish'],
  ad: ['ad_impression', 'ad_click', 'ad_contact'],
  game: ['pause', 'resume'],
  system: ['rpc_error', 'network_error', 'validation_error', 'ui_error', 'unhandled_error', 'permission_denied'],
};

const DOMAIN_SECTIONS: { key: keyof TelemetryAnalytics; title: string; color: string }[] = [
  { key: 'category', title: 'Category funnel', color: '#3b82f6' },
  { key: 'product', title: 'Product detail', color: '#8b5cf6' },
  { key: 'listing', title: 'Listing lifecycle', color: '#f59e0b' },
  { key: 'cart', title: 'Cart', color: '#22c55e' },
  { key: 'request', title: 'Requests', color: '#ef4444' },
  { key: 'game', title: 'Games', color: '#4cc4f0' },
  { key: 'ad', title: 'Ads', color: '#ffa94d' },
  { key: 'system', title: 'System / errors', color: '#ff6b7a' },
];

const cardStyle = (colors: ReturnType<typeof useThemeColors>): React.CSSProperties => ({
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  padding: '16px',
});

function FunnelSection({
  funnel,
  title,
  color,
  emptyMessage,
}: {
  funnel: TelemetryFunnel | null;
  title: string;
  color: string;
  emptyMessage: string;
}) {
  const colors = useThemeColors();
  const entries = Object.entries(funnel ?? {});
  if (entries.length === 0) {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0' }}>{title}</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{emptyMessage}</span>
      </div>
    );
  }
  return (
    <div style={cardStyle(colors)}>
      <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color }}>●</span>
        <span>{title}</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {entries.map(([name, count]) => {
          const unwired = (NOT_WIRED[title_Key(title)] ?? []).includes(name) && count === 0;
          return (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>{name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {unwired && (
                  <span style={{ fontSize: '0.6rem', color: colors.warning, border: `1px solid ${colors.warning}`, borderRadius: '4px', padding: '0 4px' }}>
                    Not wired
                  </span>
                )}
                <span style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {count}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function title_Key(title: string): string {
  const map: Record<string, string> = {
    'Product detail': 'product',
    'Listing lifecycle': 'listing',
    'Ads': 'ad',
    'Games': 'game',
    'System / errors': 'system',
  };
  return map[title] ?? title.toLowerCase();
}

export function TelemetryAnalyticsBI() {
  const colors = useThemeColors();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filters, setFilters] = useState<TelemetryAnalyticsFilters>({});

  const load = useCallback(async (next: TelemetryAnalyticsFilters) => {
    setState({ kind: 'loading' });
    const result = await getTelemetryAnalytics(next);
    if (result === null) {
      setState({ kind: 'rpc-failure' });
      return;
    }
    if (isTelemetryUnauthorized(result)) {
      setState({ kind: 'unauthorized' });
      return;
    }
    if (isTelemetryEmpty(result)) {
      setState({ kind: 'empty' });
      return;
    }
    setState({ kind: 'ready', data: result });
  }, []);

  useEffect(() => {
    load(filters);
  }, [load, filters]);

  const setFilter = useCallback(<K extends keyof TelemetryAnalyticsFilters>(key: K, value: TelemetryAnalyticsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value || null }));
  }, []);

  const setDate = useCallback((which: 'from' | 'to', value: string) => {
    setFilter(which === 'from' ? 'dateFrom' : 'dateTo', value || null);
  }, [setFilter]);

  const totals = state.kind === 'ready' ? state.data.totals : null;

  const domains = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.data.events_by_domain.map(d => d.domain);
  }, [state]);

  const events = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.data.events_by_event.map(e => e.event);
  }, [state]);

  if (state.kind === 'loading') {
    return <div style={{ color: colors.textMuted, padding: '2rem', textAlign: 'center' }}>Loading telemetry analytics…</div>;
  }
  if (state.kind === 'rpc-failure') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.danger, margin: '0 0 8px 0' }}>RPC failure</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          Telemetry could not be loaded. This is a transport error; permission and filters were not evaluated.
        </span>
      </div>
    );
  }
  if (state.kind === 'unauthorized') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.danger, margin: '0 0 8px 0' }}>Access denied</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          Your role does not allow reading telemetry analytics.
        </span>
      </div>
    );
  }
  if (state.kind === 'empty') {
    return (
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.text, margin: '0 0 8px 0' }}>No telemetry data</h3>
        <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
          Authorized, but there are no events matching the current filters.
        </span>
      </div>
    );
  }

  const data = state.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div style={cardStyle(colors)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>From</span>
            <input type="date" value={filters.dateFrom ?? ''} onChange={e => setDate('from', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>To</span>
            <input type="date" value={filters.dateTo ?? ''} onChange={e => setDate('to', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Domain</span>
            <select value={filters.domain ?? ''} onChange={e => setFilter('domain', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }}>
              <option value="">All</option>
              {domains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Event</span>
            <select value={filters.event ?? ''} onChange={e => setFilter('event', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }}>
              <option value="">All</option>
              {events.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Game</span>
            <input value={filters.game ?? ''} placeholder="e.g. ttt" onChange={e => setFilter('game', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Entity id</span>
            <input value={filters.entityId ?? ''} placeholder="business id" onChange={e => setFilter('entityId', e.target.value)}
              style={{ background: colors.bgInput, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', padding: '6px 8px' }} />
          </label>
        </div>
      </div>

      {/* Overview totals */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {[
            { label: 'Total events', value: totals.total_events, color: colors.accent },
            { label: 'Sessions', value: totals.unique_sessions, color: '#3b82f6' },
            { label: 'Visitors', value: totals.unique_visitors, color: '#22c55e' },
            { label: 'Users', value: totals.unique_users, color: '#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={{ ...cardStyle(colors) }}>
              <div style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Busiest day sparkline from daily series */}
      {data.daily.length > 0 && (
        <div style={cardStyle(colors)}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>Events per day</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100px' }}>
            {data.daily.map(d => {
              const max = Math.max(...data.daily.map(x => x.count), 1);
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} title={`${d.date}: ${d.count}`}>
                  <div style={{
                    width: '100%', height: `${Math.max((d.count / max) * 100, 2)}%`,
                    background: d.count > 0 ? colors.accent : colors.border,
                    borderRadius: '2px 2px 0 0', opacity: d.count > 0 ? 0.6 + (d.count / max) * 0.4 : 0.3,
                  }} />
                  <span style={{ color: colors.textMuted, fontSize: '0.5rem' }}>{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top entities (business ids only, counts) */}
      {data.top_entities.length > 0 && (
        <div style={cardStyle(colors)}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0' }}>Top entities</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {data.top_entities.map((e, i) => (
              <div key={`${e.entity_id}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>{e.entity_type ?? 'unknown'} · {e.entity_id ?? '—'}</span>
                <span style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Domain analytics sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {DOMAIN_SECTIONS.map(section => (
          <FunnelSection
            key={section.key}
            funnel={data[section.key] as TelemetryFunnel | null}
            title={section.title}
            color={section.color}
            emptyMessage="No events recorded for this domain yet."
          />
        ))}
      </div>
    </div>
  );
}
