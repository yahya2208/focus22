import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../core/supabase/client';
import { useThemeColors } from '../../hooks/useThemeColors';
import type {
  PhoneIntelligenceData, PhoneDemandOverview, PhoneLowDemandItem,
} from '../types';type TimeRange = '7d' | '30d' | 'all';

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
];

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  const colors = useThemeColors();
  return (
    <div style={{
      background: accent ? colors.bgHover : colors.bgCard,
      border: `1px solid ${colors.border}`,
      borderRadius: '10px', padding: '10px 14px', minWidth: 0,
    }}>
      <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{label}</div>
      <div style={{ color: accent ? colors.accent : colors.text, fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 50 ? '#16a34a22' : score >= 10 ? '#ca8a0422' : '#dc262622';
  const fg = score >= 50 ? '#16a34a' : score >= 10 ? '#ca8a04' : '#dc2626';
  return (
    <span style={{
      background: bg, color: fg, padding: '2px 8px',
      borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
    }}>{score}</span>
  );
}

function ReasonBadge({ reason }: { reason: PhoneLowDemandItem['reason'] }) {
  const fallback = { bg: '#16a34a22', fg: '#16a34a', label: 'OK' };
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    zero_views:              { bg: '#dc262622', fg: '#dc2626', label: 'Zero Views' },
    low_views:               { bg: '#ca8a0422', fg: '#ca8a04', label: 'Low Views' },
    high_views_zero_detail:  { bg: '#ea580c22', fg: '#ea580c', label: 'High Views / No Detail' },
    ok:                      fallback,
  };
  const m = map[reason] ?? fallback;
  return (
    <span style={{
      background: m.bg, color: m.fg, padding: '2px 8px',
      borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
    }}>{m.label}</span>
  );
}

export function PhoneIntelligenceBI() {
  const colors = useThemeColors();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [brand, setBrand] = useState<string>('');
  const [data, setData] = useState<PhoneIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = getSupabaseClient();
    Promise.resolve(client.rpc('get_phone_intelligence', {
      p_time_range: timeRange,
      p_brand: brand || null,
    })).then(({ data: result, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) throw rpcError;
      if (!result || typeof result !== 'object') throw new Error('Invalid RPC response');
      if ('error' in result) throw new Error(String(result.error));
      setData(result as PhoneIntelligenceData);
      // Brand options derive from the SAME RPC response that feeds the screen
      // (brand_aggregation). Technical note: a brand-filtered fetch returns
      // only the selected brand, so options accumulate across responses to
      // keep the full list visible. No second data source is consulted.
      const respBrands = ((result as PhoneIntelligenceData).brand_aggregation ?? [])
        .map((b) => b.brand).filter(Boolean);
      if (respBrands.length > 0) {
        setBrands((prev) => [...new Set([...prev, ...respBrands])].sort());
      }
    }).catch((err: unknown) => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : 'Failed to load analytics';
      setError(msg);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [timeRange, brand]);

  if (loading) {
    return (
      <div style={{ color: colors.textMuted, textAlign: 'center', padding: '4rem' }}>
        Loading Phone Intelligence…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#dc262611', border: '1px solid #dc262633',
        borderRadius: '12px', padding: '2rem', textAlign: 'center', color: '#dc2626',
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠</div>
        <div style={{ fontWeight: 600 }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const overview: PhoneDemandOverview[] = data.demand_overview ?? [];
  const totalViews = overview.reduce((s, r) => s + r.total_views, 0);
  const totalUnique = overview.reduce((s, r) => s + r.unique_views, 0);
  const totalSelections = overview.reduce((s, r) => s + r.selections, 0);
  const totalWA = overview.reduce((s, r) => s + r.whatsapp_intents, 0);
  const totalDevices = overview.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Controls */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '12px 16px',
      }}>
        <span style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: 600 }}>Time Range</span>
        {TIME_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setTimeRange(opt.value)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none',
            background: timeRange === opt.value ? colors.accent : colors.bgInput,
            color: timeRange === opt.value ? '#fff' : colors.textSecondary,
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
          }}>{opt.label}</button>
        ))}
        <div style={{ width: '1px', height: '24px', background: colors.border, margin: '0 4px' }} />
        <span style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: 600 }}>Brand</span>
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: '6px', border: `1px solid ${colors.border}`,
            background: colors.bgInput, color: colors.text, fontSize: '0.75rem',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
        <StatCard label="Devices" value={totalDevices} />
        <StatCard label="Total Views" value={totalViews.toLocaleString()} />
        <StatCard label="Unique Viewers" value={totalUnique.toLocaleString()} />
        <StatCard label="Selections" value={totalSelections.toLocaleString()} />
        <StatCard label="WhatsApp" value={totalWA.toLocaleString()} />
      </div>

      {/* A. Demand Overview */}
      <Section title="Demand Overview" subtitle={`${overview.length} devices`}>
        {overview.length === 0 ? (
          <Empty text="No demand data in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>Views</th><th>Unique</th><th>Detail</th>
                  <th>Sel.</th><th>WA</th><th>Score</th>
                </TrH>
              </thead>
              <tbody>
                {overview.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.total_views}</Td><Td>{r.unique_views}</Td><Td>{r.detail_views}</Td>
                    <Td>{r.selections}</Td><Td>{r.whatsapp_intents}</Td>
                    <Td><ScoreBadge score={r.demand_score} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* B. Zero / Low Demand */}
      <Section title="Zero / Low Demand" subtitle={`${data.low_demand.length} devices flagged`}>
        {data.low_demand.length === 0 ? (
          <Empty text="No low-demand phones." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>Views</th><th>Detail</th><th>Status</th>
                </TrH>
              </thead>
              <tbody>
                {data.low_demand.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.total_views}</Td><Td>{r.detail_views}</Td>
                    <Td><ReasonBadge reason={r.reason} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* C. Search Analytics */}
      <Section title="Search Analytics" subtitle={`${data.search_analytics.length} unique queries`}>
        {data.search_analytics.length === 0 ? (
          <Empty text="No search data in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Query</th><th>Searches</th><th>Avg Results</th>
                  <th>Selections</th><th>Conversion %</th>
                </TrH>
              </thead>
              <tbody>
                {data.search_analytics.map(r => (
                  <tr key={r.query} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.query}</Td><Td>{r.search_count}</Td>
                    <Td>{r.avg_results_count}</Td><Td>{r.selection_count}</Td>
                    <Td>{r.search_to_selection_rate}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* D. Search Without Selection */}
      <Section title="Searches Without Selection" subtitle={`${data.search_without_selection.length} queries`}>
        {data.search_without_selection.length === 0 ? (
          <Empty text="All searches resulted in a selection." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Query</th><th>Searches</th>
                </TrH>
              </thead>
              <tbody>
                {data.search_without_selection.map(r => (
                  <tr key={r.query} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.query}</Td><Td>{r.search_count}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* E. Top Viewed Phones */}
      <Section title="Top Viewed Phones" subtitle={`${(data.top_viewed ?? []).length} devices`}>
        {(data.top_viewed ?? []).length === 0 ? (
          <Empty text="No view data in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>Views</th><th>Unique</th><th>Card</th><th>Detail</th><th>Last Viewed</th>
                </TrH>
              </thead>
              <tbody>
                {data.top_viewed.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.total_views}</Td><Td>{r.unique_views}</Td>
                    <Td>{r.card_views}</Td><Td>{r.detail_views}</Td>
                    <Td>{r.last_viewed_at ? new Date(r.last_viewed_at).toLocaleString() : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* F. Search → Phone */}
      <Section title="Search → Phone" subtitle={`${(data.search_to_phone ?? []).length} devices`}>
        {(data.search_to_phone ?? []).length === 0 ? (
          <Empty text="No search selections in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>Selections</th><th>Assoc. Searches</th><th>Conversion %</th>
                </TrH>
              </thead>
              <tbody>
                {data.search_to_phone.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.selection_count}</Td><Td>{r.associated_search_count}</Td>
                    <Td>{r.search_to_selection_rate}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* G. Detail Engagement */}
      <Section title="Detail Engagement" subtitle={`${(data.detail_engagement ?? []).length} devices`}>
        {(data.detail_engagement ?? []).length === 0 ? (
          <Empty text="No detail engagement in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>Card Views</th><th>Detail Views</th><th>Unique Viewers</th>
                  <th>Unique Detail</th><th>Detail/Card %</th>
                </TrH>
              </thead>
              <tbody>
                {data.detail_engagement.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.card_views}</Td><Td>{r.detail_views}</Td>
                    <Td>{r.unique_viewers}</Td><Td>{r.unique_detail_viewers}</Td>
                    <Td>{r.detail_card_ratio}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* H. WhatsApp Intent */}
      <Section title="WhatsApp Intent" subtitle={`${(data.whatsapp_intent ?? []).length} devices`}>
        {(data.whatsapp_intent ?? []).length === 0 ? (
          <Empty text="No WhatsApp intent in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variant</th>
                  <th>WA Intents</th><th>Clicks</th><th>Ad Views</th>
                </TrH>
              </thead>
              <tbody>
                {data.whatsapp_intent.map(r => (
                  <tr key={r.device_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variant || '—'}</Td>
                    <Td>{r.whatsapp_intents}</Td><Td>{r.clicks}</Td><Td>{r.ad_views}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>

      {/* I. Brand Aggregation */}
      <Section title="Brand Aggregation" subtitle={`${(data.brand_aggregation ?? []).length} brand/model rows`}>
        {(data.brand_aggregation ?? []).length === 0 ? (
          <Empty text="No aggregation data in this period." />
        ) : (
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <TrH colors={colors}>
                  <th>Brand</th><th>Model</th><th>Variants</th>
                  <th>Views</th><th>Unique</th><th>Detail</th>
                  <th>Sel.</th><th>WA</th><th>Score</th>
                </TrH>
              </thead>
              <tbody>
                {data.brand_aggregation.map((r, i) => (
                  <tr key={`${r.brand}-${r.model}-${i}`} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <Td>{r.brand}</Td><Td>{r.model}</Td><Td>{r.variants || '—'}</Td>
                    <Td>{r.total_views}</Td><Td>{r.unique_views}</Td><Td>{r.detail_views}</Td>
                    <Td>{r.selections}</Td><Td>{r.whatsapp_intents}</Td>
                    <Td><ScoreBadge score={r.demand_score} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Section>
    </div>
  );
}

// ── Reusable layout helpers ─────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: '16px',
    }}>
      <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 4px 0' }}>{title}</h3>
      {subtitle && <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginBottom: '12px' }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.8rem' }}>
      {text}
    </div>
  );
}

function TableScroll({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      {children}
    </div>
  );
}

function TrH({ colors, children }: { colors: ReturnType<typeof useThemeColors>; children: React.ReactNode }) {
  return (
    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
      {children}
    </tr>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const colors = useThemeColors();
  return (
    <td style={{
      padding: '6px 8px', color: colors.textSecondary,
      textAlign: 'left', whiteSpace: 'nowrap', ...style,
    }}>{children}</td>
  );
}
