import { useState, useEffect, useCallback } from 'react';
import { StatCard, DashboardHeader } from '../../layout/ResearchLayout';
import { listCampaigns, deleteCampaign, restoreCampaign, type Campaign } from './campaign-service';
import { CampaignWizard } from './CampaignWizard';
import { CampaignDetailView } from './CampaignDetailView';
import { useTranslation } from '../../../hooks/useTranslation';
import type { TranslationKey } from '../../../i18n';

type StatusFilter = 'all' | 'active' | 'draft' | 'paused' | 'finished' | 'archived';

const STATUS_COLORS: Record<string, string> = { active: '#22c55e', draft: '#888', paused: '#f59e0b', finished: '#3b82f6', archived: '#ef4444' };
const TH_STYLE: React.CSSProperties = { padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' };
const ROW_STYLE: React.CSSProperties = { padding: '0.65rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.82rem', color: '#ccc', whiteSpace: 'nowrap' };
const btnPrimary: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const btnDanger: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', cursor: 'pointer', fontSize: '0.78rem' };
const btnSmall: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' };

export function CampaignsDashboard() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const loadData = useCallback(async () => {
    const result = await listCampaigns({ limit: 200 });
    setCampaigns(result.data);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleArchive = async (id: string) => {
    if (!confirm(t('campaign.archiveConfirm'))) return;
    await deleteCampaign(id);
    setSelectedId(null);
    loadData();
  };

  const handleRestore = async (id: string) => {
    await restoreCampaign(id);
    loadData();
  };

  const selected = selectedId ? campaigns.find((c) => c.id === selectedId) ?? null : null;
  const filtered = statusFilter === 'all' ? campaigns : campaigns.filter((c) => (c.status ?? 'active') === statusFilter);
  const countBy = (s: string) => campaigns.filter((c) => (c.status ?? 'active') === s).length;

  if (selected) {
    return <CampaignDetailView campaign={selected} onBack={() => setSelectedId(null)} onUpdate={loadData} />;
  }

  return (
    <>
      <DashboardHeader
        title={t('campaign.title')}
        subtitle={`${campaigns.length} ${t('campaign.title').toLowerCase()}`}
        actions={<button onClick={() => setShowWizard(true)} style={btnPrimary}>{t('campaign.new')}</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <StatCard label={t('campaign.title')} value={campaigns.length} color="#6366f1" />
        <StatCard label={t('campaign.active')} value={countBy('active')} color="#22c55e" />
        <StatCard label={t('campaign.draft')} value={countBy('draft') + countBy('paused')} color="#f59e0b" />
        <StatCard label={t('campaign.archived')} value={countBy('archived')} color="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {(['all', 'active', 'draft', 'paused', 'finished', 'archived'] as StatusFilter[]).map((s) => (
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
                <th style={TH_STYLE}>{t('campaign.shortUrl')}</th>
                <th style={TH_STYLE}>{t('campaign.createdDate')}</th>
                <th style={TH_STYLE}>{t('campaign.status')}</th>
                <th style={TH_STYLE}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const status = c.status ?? 'active';
                return (
                  <tr key={c.id} style={{ cursor: 'pointer', background: selectedId === c.id ? '#1a1a2e' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#16162a'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedId === c.id ? '#1a1a2e' : 'transparent'; }}>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{c.name}</td>
                    <td style={{ ...ROW_STYLE, fontSize: '0.75rem' }} onClick={() => setSelectedId(c.id!)}>{c.goal?.replace(/_/g, ' ') ?? '-'}</td>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{c.campaign_type ?? '-'}</td>
                    <td style={ROW_STYLE} onClick={() => setSelectedId(c.id!)}>{[c.city, c.country].filter(Boolean).join(', ') || '-'}</td>
                    <td style={{ ...ROW_STYLE, color: '#22c55e', fontSize: '0.75rem' }} onClick={() => setSelectedId(c.id!)}>{c.short_code ? `c/${c.short_code}` : '-'}</td>
                    <td style={{ ...ROW_STYLE, fontSize: '0.75rem' }} onClick={() => setSelectedId(c.id!)}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                    <td style={ROW_STYLE}>
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
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>{t('campaign.noCampaigns')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showWizard && <CampaignWizard onClose={() => setShowWizard(false)} onCreated={loadData} />}
    </>
  );
}
