import { useState, useEffect, useCallback } from 'react';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { getSupabaseClient } from '../../../core/supabase/client';
import { getDataService, type Campaign } from '../../../core/supabase/data-service';
import { CampaignWizard } from './CampaignWizard';
import { CampaignDetailView } from './CampaignDetailView';
import { useTranslation } from '../../../hooks/useTranslation';
import type { TranslationKey } from '../../../i18n';

interface CampaignRow extends Campaign {
  scan_count: number;
  game_start_count: number;
  game_complete_count: number;
  registration_count: number;
  qr_count: number;
}

type StatusFilter = 'all' | 'active' | 'draft' | 'paused' | 'finished' | 'archived';

const STATUS_COLORS: Record<string, string> = { active: '#22c55e', draft: '#888', paused: '#f59e0b', finished: '#3b82f6', archived: '#ef4444' };
const TH_STYLE: React.CSSProperties = { padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' };
const ROW_STYLE: React.CSSProperties = { padding: '0.65rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.82rem', color: '#ccc', whiteSpace: 'nowrap' };
const btnPrimary: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const btnDanger: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', cursor: 'pointer', fontSize: '0.78rem' };
const btnSmall: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' };

export function CampaignsDashboard() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());
  const [showWizard, setShowWizard] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const client = getSupabaseClient();
      const ds = getDataService(client);
      const [campaignsResult, qrResult, sessionsResult] = await Promise.all([
        ds.getCampaigns({ limit: 100 }),
        ds.getQRCodes({ limit: 500 }),
        client.from('sessions').select('campaign_id, status').not('campaign_id', 'is', null),
      ]);
      const sessionList = sessionsResult.data ?? [];
      const rows: CampaignRow[] = campaignsResult.data.map(c => {
        const cQrs = qrResult.data.filter(qr => qr.campaign_id === c.id);
        const cSessions = sessionList.filter(s => s.campaign_id === c.id);
        const scanCount = cQrs.reduce((s, q) => s + q.scan_count, 0);
        const startedCount = cSessions.length;
        const completeCount = cSessions.filter(s => s.status === 'completed').length;
        const regCount = cQrs.reduce((s, q) => s + q.registration_count, 0);
        return {
          ...c,
          scan_count: scanCount,
          game_complete_count: completeCount,
          game_start_count: startedCount,
          registration_count: regCount,
          qr_count: cQrs.length,
        };
      });
      setCampaigns(rows);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleArchive = async (id: string) => {
    if (!confirm(t('campaign.archiveConfirm'))) return;
    const ds = getDataService(getSupabaseClient());
    await ds.deleteCampaign(id);
    setSelectedId(null);
    loadData();
  };

  const handleRestore = async (id: string) => {
    const ds = getDataService(getSupabaseClient());
    await ds.restoreCampaign(id);
    loadData();
  };

  const selected = selectedId ? campaigns.find(c => c.id === selectedId) ?? null : null;
  const filtered = statusFilter === 'all' ? campaigns : campaigns.filter(c => (c.status ?? 'active') === statusFilter);
  const totalScans = campaigns.reduce((s, c) => s + c.scan_count, 0);
  const totalCompleted = campaigns.reduce((s, c) => s + c.game_complete_count, 0);
  const totalRegistered = campaigns.reduce((s, c) => s + c.registration_count, 0);

  if (selected) {
    return (
      <>
        <CampaignDetailView campaign={selected} onBack={() => setSelectedId(null)} onUpdate={loadData} />
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title={t('campaign.title')}
        subtitle={`${campaigns.length} ${t('campaign.title').toLowerCase()}`}
        actions={<button onClick={() => setShowWizard(true)} style={btnPrimary}>+ {t('campaign.new').replace('+ ', '')}</button>}
      />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <StatCard label={t('campaign.title')} value={campaigns.length} color="#6366f1" />
        <StatCard label={t('campaign.scans')} value={totalScans} color="#22c55e" />
        <StatCard label={t('campaign.completed')} value={totalCompleted} color="#3b82f6" />
        <StatCard label={t('campaign.registered')} value={totalRegistered} color="#f59e0b" />
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem' }}>
        {(['all', 'active', 'draft', 'paused', 'finished', 'archived'] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem',
            background: statusFilter === s ? '#6366f1' : '#1e1e2e',
            color: statusFilter === s ? '#fff' : '#888',
            border: `1px solid ${statusFilter === s ? '#6366f1' : '#333'}`,
            cursor: 'pointer',
          }}>{t(`campaign.${s}` as TranslationKey)}</button>
        ))}
      </div>

      <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>{t('campaign.name')}</th>
                <th style={TH_STYLE}>{t('campaign.goal')}</th>
                <th style={TH_STYLE}>{t('campaign.type')}</th>
                <th style={TH_STYLE}>{t('campaign.city')}</th>
                <th style={TH_STYLE}>{t('campaign.scans')}</th>
                <th style={TH_STYLE}>{t('campaign.completed')}</th>
                <th style={TH_STYLE}>{t('campaign.registered')}</th>
                <th style={TH_STYLE}>{t('campaign.conversion')}</th>
                <th style={TH_STYLE}>{t('campaign.status')}</th>
                <th style={TH_STYLE}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const conversion = c.scan_count > 0 ? ((c.registration_count / c.scan_count) * 100).toFixed(1) : '0';
                const status = c.status ?? 'active';
                return (
                  <tr key={c.id} style={{ cursor: 'pointer', background: selectedId === c.id ? '#1a1a2e' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#16162a'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedId === c.id ? '#1a1a2e' : 'transparent'; }}>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{c.name}</td>
                    <td style={{ ...ROW_STYLE, fontSize: '0.75rem' }} onClick={() => setSelectedId(c.id!)}>{c.goal?.replace(/_/g, ' ') ?? '-'}</td>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{c.campaign_type ?? '-'}</td>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{[c.city, c.country].filter(Boolean).join(', ') || '-'}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }} onClick={() => setSelectedId(c.id!)}>{c.scan_count}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }} onClick={() => setSelectedId(c.id!)}>{c.game_complete_count}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }} onClick={() => setSelectedId(c.id!)}>{c.registration_count}</td>
                    <td style={{ ...ROW_STYLE, color: parseFloat(conversion) >= 20 ? '#22c55e' : parseFloat(conversion) >= 10 ? '#f59e0b' : '#888' }} onClick={() => setSelectedId(c.id!)}>{conversion}%</td>
                    <td style={{ ...ROW_STYLE }}>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', background: STATUS_COLORS[status] ?? '#333', color: '#fff', fontSize: '0.65rem', fontWeight: 600 }}>{status}</span>
                    </td>
                    <td style={ROW_STYLE}>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {status === 'archived' ? (
                          <button onClick={(e) => { e.stopPropagation(); handleRestore(c.id!); }} style={btnSmall}>{t('campaign.restore')}</button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); handleArchive(c.id!); }} style={btnDanger}>{t('campaign.archive')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>{t('campaign.noCampaigns')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showWizard && <CampaignWizard onClose={() => setShowWizard(false)} onCreated={loadData} />}
    </>
  );
}
