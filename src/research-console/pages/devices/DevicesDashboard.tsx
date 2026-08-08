import { useState, useEffect } from 'react';
import { createResearchAPI, type DeviceAnalytics, type DeviceHierarchyGroup, type DeviceBrandGroup, type DeviceModelGroup, type DeviceIntelligence } from '../../../core/research/api-supabase';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart, PieChart } from '../../components/charts/Charts';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rankingColor(r: DeviceIntelligence['health']['ranking']): string {
  const map: Record<string, string> = { excellent: '#22c55e', good: '#3b82f6', average: '#f59e0b', poor: '#ef4444', bad: '#dc2626' };
  return map[r] ?? '#888';
}

function rankingStars(r: DeviceIntelligence['health']['ranking']): string {
  const map: Record<string, string> = { excellent: '★★★★★', good: '★★★★', average: '★★★', poor: '★★', bad: '★' };
  return map[r] ?? '—';
}

function DeviceHardwarePanel({ device }: { readonly device: DeviceIntelligence }) {
  const rows: [string, string | number | null | boolean][] = [
    ['Language', device.language],
    ['Platform', device.platform],
    ['OS Version', device.osVersion],
    ['Browser Version', device.browserVersion],
    ['User Agent', device.userAgent ? device.userAgent.substring(0, 120) : null],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.75rem', background: '#0a0a12', borderRadius: '8px', marginTop: '0.5rem', fontSize: '0.8rem' }}>
      {rows.map(([label, value]) =>
        value !== null && value !== undefined && value !== '' && value !== false ? (
          <div key={label}>
            <span style={{ color: '#888', marginRight: '0.25rem' }}>{label}:</span>
            <span style={{ color: '#ccc' }}>{String(value)}</span>
          </div>
        ) : null
      )}
    </div>
  );
}

function DeviceCard({ device }: { readonly device: DeviceIntelligence }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{device.marketingName || device.model || device.browser || 'Unknown'}</span>
          <span style={{ color: '#888', fontSize: '0.8rem' }}>{device.browser} · {device.os}</span>
          <span style={{ color: rankingColor(device.health.ranking), fontSize: '0.7rem' }}>{rankingStars(device.health.ranking)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ background: '#6366f1', color: '#fff', borderRadius: '999px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}>
            {device.sessionsCount} sessions
          </span>
          <span style={{ color: '#666', fontSize: '0.7rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid #1e1e2e', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div><span style={{ color: '#888' }}>Avg Duration: </span><span style={{ color: '#22c55e', fontWeight: 600 }}>{formatMs(device.avgDuration)}</span></div>
            <div><span style={{ color: '#888' }}>Avg RT: </span><span style={{ color: '#3b82f6', fontWeight: 600 }}>{device.avgRt.toFixed(0)}ms</span></div>
            <div><span style={{ color: '#888' }}>Avg Focus: </span><span style={{ color: '#f59e0b', fontWeight: 600 }}>{device.avgFocusScore.toFixed(1)}</span></div>
            <div><span style={{ color: '#888' }}>Completed: </span><span style={{ color: '#22c55e', fontWeight: 600 }}>{device.completedSessions}</span></div>
            <div><span style={{ color: '#888' }}>Abandoned: </span><span style={{ color: '#ef4444', fontWeight: 600 }}>{device.abandonedSessions}</span></div>
            <div><span style={{ color: '#888' }}>Health: </span><span style={{ color: rankingColor(device.health.ranking), fontWeight: 600 }}>{device.health.ranking} ({rankingStars(device.health.ranking)})</span></div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
            <span style={{ color: '#666' }}>Calibration: <span style={{ color: '#22c55e' }}>{(device.health.avgCalibrationConfidence * 100).toFixed(0)}%</span></span>
            <span style={{ color: '#666' }}>Consistency: <span style={{ color: '#3b82f6' }}>{device.health.reactionConsistency.toFixed(0)}%</span></span>
            <span style={{ color: '#666' }}>Completion: <span style={{ color: '#22c55e' }}>{(device.health.completionRate * 100).toFixed(0)}%</span></span>
            <span style={{ color: '#666' }}>Abandon: <span style={{ color: '#ef4444' }}>{(device.health.abandonRate * 100).toFixed(0)}%</span></span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>
            <span>First: {formatDate(device.firstSeen)}</span>
            <span>Last: {formatDate(device.lastSeen)}</span>
          </div>
          <DeviceHardwarePanel device={device} />
        </div>
      )}
    </div>
  );
}

function ModelGroup({ modelGroup }: { readonly modelGroup: DeviceModelGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginLeft: '1rem', borderLeft: '2px solid #2d2d3d', paddingLeft: '0.75rem', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.35rem 0' }} onClick={() => setExpanded(!expanded)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}>
        <span style={{ fontSize: '0.75rem', color: '#666' }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 500 }}>{modelGroup.marketingName || modelGroup.model}</span>
        <span style={{ background: '#1e1e2e', color: '#888', borderRadius: '999px', padding: '0.05rem 0.5rem', fontSize: '0.7rem' }}>{modelGroup.count} devices</span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
          {modelGroup.devices.map(device => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}

function BrandGroup({ brandGroup }: { readonly brandGroup: DeviceBrandGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginLeft: '0.75rem', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.4rem 0' }} onClick={() => setExpanded(!expanded)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600 }}>{brandGroup.brand}</span>
        <span style={{ background: '#2d2d3d', color: '#aaa', borderRadius: '999px', padding: '0.08rem 0.5rem', fontSize: '0.7rem' }}>{brandGroup.count} devices</span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {brandGroup.models.map(mg => (
            <ModelGroup key={mg.model} modelGroup={mg} />
          ))}
        </div>
      )}
    </div>
  );
}

function OsGroup({ group }: { readonly group: DeviceHierarchyGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: '#0e0e18', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', cursor: 'pointer', background: '#12121a' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1.05rem' }}>{group.os}</span>
          <span style={{ background: '#6366f140', color: '#818cf8', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{group.count} devices</span>
        </div>
        <span style={{ color: '#666', fontSize: '0.75rem' }}>{expanded ? '▲ Collapse' : '▼ Expand'}</span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.75rem' }}>
          {group.brands.map(bg => (
            <BrandGroup key={bg.brand} brandGroup={bg} />
          ))}
          {group.brands.length === 0 && <p style={{ color: '#555', padding: '1rem', textAlign: 'center' }}>No brand data</p>}
        </div>
      )}
    </div>
  );
}

export function DevicesDashboard() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<DeviceAnalytics | null>(null);
  const [hierarchy, setHierarchy] = useState<readonly DeviceHierarchyGroup[]>([]);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getDeviceAnalytics(filters).then(setAnalytics);
    api.getDeviceIntelligence(filters).then(setHierarchy);
  }, [filters]);

  const totalDevices = (analytics?.osDistribution ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <>
      <DashboardHeader title={t('devices.title')} subtitle={t('devices.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {analytics && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('devices.totalDevices')} value={totalDevices} color="#6366f1" />
            <StatCard label={t('devices.osTypes')} value={analytics.osDistribution.length} color="#22c55e" />
            <StatCard label={t('devices.browserTypes')} value={analytics.browserDistribution.length} color="#3b82f6" />
            <StatCard label={t('devices.refreshRates')} value={analytics.refreshRateDistribution.length} />
            <StatCard label={t('devices.inputTypes')} value={analytics.inputTypeDistribution.length} color="#f59e0b" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {analytics.osDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart data={analytics.osDistribution.map(d => ({ label: d.os, value: d.count }))} title={t('devices.osDistribution')} />
              </div>
            )}
            {analytics.browserDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart data={analytics.browserDistribution.map(d => ({ label: d.browser, value: d.count }))} title={t('devices.browserDistribution')} />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            {analytics.refreshRateDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart data={analytics.refreshRateDistribution.map(d => ({ label: `${d.rate}Hz`, value: d.count, color: '#6366f1' }))} title={t('devices.refreshRatesChart')} />
              </div>
            )}
            {analytics.inputTypeDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart data={analytics.inputTypeDistribution.map(d => ({ label: d.type, value: d.count, color: '#f59e0b' }))} title={t('devices.inputTypesChart')} />
              </div>
            )}
          </div>
        </>
      )}

      <h2 style={{ color: '#e2e8f0', fontSize: '1.25rem', marginBottom: '1rem', marginTop: '1rem' }}>
        Device Explorer <span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 400 }}>— OS → Brand → Model → Device</span>
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {hierarchy.map(group => <OsGroup key={group.os} group={group} />)}
        {hierarchy.length === 0 && <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No devices found</p>}
      </div>
    </>
  );
}