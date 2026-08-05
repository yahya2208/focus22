import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../../core/supabase/client';
import { getDataService, type Campaign, type QRCode, type QRConfig, type CampaignTimelineEntry } from '../../../core/supabase/data-service';
import QRCodeLib from 'qrcode';
import { QRDesigner } from './QRDesigner';
import { PrintCenter } from './PrintCenter';
import { CampaignAnalytics } from './CampaignAnalytics';
import { useTranslation } from '../../../hooks/useTranslation';
import type { TranslationKey } from '../../../i18n';

type DetailTab = 'overview' | 'designer' | 'analytics' | 'print';

interface Props {
  campaign: Campaign;
  onBack: () => void;
  onUpdate: () => void;
}

const STATUS_COLORS: Record<string, string> = { active: '#22c55e', draft: '#888', paused: '#f59e0b', finished: '#3b82f6', archived: '#ef4444' };
const btnSmall: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' };

export function CampaignDetailView({ campaign: c, onBack, onUpdate }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(c.notes ?? '');
  const [sessionStats, setSessionStats] = useState<{ started: number; completed: number }>({ started: 0, completed: 0 });
  const [scanCount, setScanCount] = useState(0);

  const basePath = import.meta.env.BASE_URL || '/';
  const shortCode = c.short_code || c.id || '';
  const campaignUrl = `${window.location.origin}${basePath}c/${shortCode}`;

  useEffect(() => {
    const load = async () => {
      const ds = getDataService(getSupabaseClient());
      const [result, scans] = await Promise.all([
        ds.getQRCodes({ campaign_id: c.id }),
        ds.countQrScans({ campaignId: c.id }),
      ]);
      setQRCodes(result.data);
      setScanCount(scans);
    };
    load();
  }, [c.id]);

  useEffect(() => {
    const load = async () => {
      const client = getSupabaseClient();
      const { data } = await client
        .from('sessions')
        .select('id, status')
        .eq('campaign_id', c.id);
      const list = data ?? [];
      setSessionStats({
        started: list.length,
        completed: list.filter(s => s.status === 'completed').length,
      });
    };
    load();
  }, [c.id]);

  useEffect(() => {
    QRCodeLib.toDataURL(campaignUrl, { width: 300, margin: 2, color: { dark: '#1e1e2e', light: '#ffffff' } })
      .then(setQrImage)
      .catch(() => setQrImage(null));
  }, [campaignUrl]);

  const handleStatusChange = async (newStatus: string) => {
    const ds = getDataService(getSupabaseClient());
    await ds.updateCampaign(c.id!, { status: newStatus, is_active: newStatus === 'active' });
    await ds.addTimelineEntry(c.id!, `status_changed_to_${newStatus}`);
    setEditingStatus(false);
    onUpdate();
  };

  const handleSaveNotes = async () => {
    const ds = getDataService(getSupabaseClient());
    await ds.updateCampaign(c.id!, { notes: notesValue });
    setEditingNotes(false);
    onUpdate();
  };

  const handleSaveQRConfig = async (config: QRConfig) => {
    const ds = getDataService(getSupabaseClient());
    await ds.updateCampaign(c.id!, { qr_config: config });
    await ds.addTimelineEntry(c.id!, 'qr_design_updated');
    onUpdate();
  };

  const stats = {
    scans: scanCount,
    started: sessionStats.started,
    completed: sessionStats.completed,
    registered: qrCodes.reduce((s, q) => s + q.registration_count, 0),
  };

  const timeline = (c.timeline ?? []) as CampaignTimelineEntry[];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: '#f0f0f0', fontSize: '1.1rem' }}>{c.name}</h3>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#666' }}>
            focus.app/c/{shortCode}
            <span style={{ marginLeft: '0.5rem', padding: '1px 6px', borderRadius: '4px', background: STATUS_COLORS[c.status ?? 'active'] ?? '#333', color: '#fff', fontSize: '0.65rem', fontWeight: 600 }}>{c.status ?? 'active'}</span>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2px', marginBottom: '1rem', borderBottom: '2px solid #1e1e2e', paddingBottom: '2px' }}>
        {([
          { id: 'overview' as DetailTab, icon: '📊' },
          { id: 'designer' as DetailTab, icon: '🎨' },
          { id: 'analytics' as DetailTab, icon: '📈' },
          { id: 'print' as DetailTab, icon: '🖨' },
        ]).map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
            padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', background: tab === tabItem.id ? '#1e1e2e' : 'transparent',
            color: tab === tabItem.id ? '#f0f0f0' : '#666', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === tabItem.id ? 600 : 400,
          }}>{tabItem.icon} {t(`campaign.${tabItem.id}` as TranslationKey)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: '#f0f0f0', fontSize: '0.9rem' }}>{t('campaign.information')}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {[
                  { label: t('campaign.goal'), value: c.goal?.replace(/_/g, ' ') ?? '-' },
                  { label: t('campaign.type'), value: c.campaign_type ?? '-' },
                  { label: t('campaign.material'), value: c.material ?? '-' },
                  { label: t('campaign.country'), value: c.country ?? '-' },
                  { label: t('campaign.state'), value: c.state_name ?? '-' },
                  { label: t('campaign.city'), value: c.city ?? '-' },
                  { label: t('campaign.district'), value: c.district ?? '-' },
                  { label: t('campaign.venue'), value: c.venue ?? '-' },
                  { label: t('campaign.budget'), value: c.budget ? `${c.budget} ${c.budget_currency ?? ''}` : '-' },
                  { label: t('campaign.createdDate'), value: c.created_at ? new Date(c.created_at).toLocaleDateString() : '-' },
                  { label: t('campaign.startDate'), value: c.start_date ? new Date(c.start_date).toLocaleDateString() : '-' },
                  { label: t('campaign.endDate'), value: c.end_date ? new Date(c.end_date).toLocaleDateString() : '-' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ color: '#666', fontSize: '0.65rem', margin: '0 0 0.1rem', textTransform: 'uppercase' as const }}>{label}</p>
                    <p style={{ color: '#f0f0f0', fontSize: '0.8rem', margin: 0, wordBreak: 'break-word' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: '#f0f0f0', fontSize: '0.9rem' }}>{t('campaign.description')} & {t('campaign.notes')}</h4>
              <p style={{ color: '#ccc', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{c.description || t('campaign.noDescription')}</p>
              {editingNotes ? (
                <div>
                  <textarea style={{ width: '100%', minHeight: '60px', background: '#1e1e2e', color: '#f0f0f0', border: '1px solid #333', borderRadius: '6px', padding: '0.5rem', fontSize: '0.82rem', resize: 'vertical', boxSizing: 'border-box' }} value={notesValue} onChange={e => setNotesValue(e.target.value)} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button onClick={handleSaveNotes} style={{ ...btnSmall, background: '#6366f1', color: '#fff', border: 'none' }}>{t('campaign.save')}</button>
                    <button onClick={() => setEditingNotes(false)} style={btnSmall}>{t('common.cancel')}</button>
                  </div>
                </div>
              ) : (
                <p onClick={() => setEditingNotes(true)} style={{ color: '#888', fontSize: '0.78rem', margin: 0, cursor: 'pointer', fontStyle: c.notes ? 'normal' : 'italic' }}>
                  {c.notes || t('campaign.clickToAddNotes')}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <p style={{ color: '#f0f0f0', fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{t('campaign.focusTest')}</p>
              {qrImage && <img src={qrImage} alt="QR" style={{ borderRadius: '8px', border: '1px solid #1e1e2e', maxWidth: '200px' }} />}
              <p style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.5rem', fontWeight: 600 }}>focus.app/c/{shortCode}</p>
            </div>

            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#f0f0f0', fontSize: '0.85rem' }}>{t('campaign.performance')}</h4>
              {[
                { label: t('campaign.scans'), value: stats.scans, color: '#6366f1' },
                { label: t('campaign.started'), value: stats.started, color: '#3b82f6' },
                { label: t('campaign.completed'), value: stats.completed, color: '#22c55e' },
                { label: t('campaign.registered'), value: stats.registered, color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.8rem' }}>
                  <span style={{ color: '#888' }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#f0f0f0', fontSize: '0.85rem' }}>{t('campaign.status')}</h4>
              {editingStatus ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {(['active', 'draft', 'paused', 'finished', 'archived'] as string[]).map(s => (
                    <button key={s} onClick={() => handleStatusChange(s)} style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', background: STATUS_COLORS[s], color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>{t(`campaign.${s}` as TranslationKey)}</button>
                  ))}
                </div>
              ) : (
                <p onClick={() => setEditingStatus(true)} style={{ color: STATUS_COLORS[c.status ?? 'active'], fontSize: '0.85rem', margin: 0, cursor: 'pointer', fontWeight: 600 }}>{t(`campaign.${c.status ?? 'active'}` as TranslationKey)} ({t('campaign.statusChange')})</p>
              )}
            </div>

            {timeline.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#f0f0f0', fontSize: '0.85rem' }}>{t('campaign.timeline')}</h4>
                {timeline.slice(-5).reverse().map((entry, i) => (
                  <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.75rem' }}>
                    <span style={{ color: '#ccc' }}>{entry.action.replace(/_/g, ' ')}</span>
                    <span style={{ color: '#555', marginLeft: '0.5rem' }}>{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'designer' && (
        <QRDesigner campaignId={c.id!} campaignUrl={campaignUrl} qrConfig={c.qr_config} onSave={handleSaveQRConfig} />
      )}

      {tab === 'analytics' && (
        <CampaignAnalytics campaign={c} qrCodes={qrCodes} sessionStats={sessionStats} scanCount={scanCount} />
      )}

      {tab === 'print' && (
        <PrintCenter campaignName={c.name} campaignUrl={campaignUrl} qrImage={qrImage} logoUrl={c.logo_url} />
      )}
    </div>
  );
}
