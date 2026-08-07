import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../../core/supabase/client';
import {
  getDataService,
  type Placement,
  type PlacementHistory,
  type QRCode,
} from '../../../core/supabase/data-service';
import QRCodeLib from 'qrcode';
import { useTranslation } from '../../../hooks/useTranslation';

const btnPrimary: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const btnSmall: React.CSSProperties = { padding: '0.35rem 0.7rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.75rem' };
const inputStyle: React.CSSProperties = { padding: '0.5rem', borderRadius: '8px', border: '1px solid #333', background: '#12121a', color: '#f0f0f0', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { color: '#888', fontSize: '0.72rem', marginBottom: '0.25rem', display: 'block' };

const STATUS_COLORS: Record<string, string> = { active: '#22c55e', removed: '#ef4444', paused: '#f59e0b' };

interface Props {
  campaignId: string;
  shortCode: string;
  qrCodes: QRCode[];
  onUpdate: () => void;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'loc';
}

export function PlacementsTab({ campaignId, shortCode, qrCodes, onUpdate }: Props) {
  const { t } = useTranslation();
  const basePath = import.meta.env.BASE_URL || '/';

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [history, setHistory] = useState<Record<string, PlacementHistory[]>>({});
  const [creating, setCreating] = useState(false);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '',
    code: '',
    city: '',
    district: '',
    venue: '',
    building: '',
    floor: '',
    notes: '',
  });

  const placementUrl = useCallback((placement: Placement) => {
    return `${window.location.origin}${basePath}c/${shortCode}?p=${placement.code}`;
  }, [basePath, shortCode]);

  const load = useCallback(async () => {
    const ds = getDataService(getSupabaseClient());
    const list = await ds.getPlacements(campaignId);
    setPlacements(list);
    const hist: Record<string, PlacementHistory[]> = {};
    for (const p of list) {
      hist[p.id!] = await ds.getPlacementHistory(p.id!);
    }
    setHistory(hist);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddPlacement = async () => {
    const name = form.name.trim();
    if (!name) return;
    const ds = getDataService(getSupabaseClient());
    const code = form.code.trim() || slugify(name);
    await ds.createPlacement({
      campaign_id: campaignId,
      code,
      name,
      city: form.city || undefined,
      district: form.district || undefined,
      venue: form.venue || undefined,
      building: form.building || undefined,
      floor: form.floor || undefined,
      notes: form.notes || undefined,
      status: 'active',
      installed_at: new Date().toISOString(),
    });
    setCreating(false);
    setForm({ name: '', code: '', city: '', district: '', venue: '', building: '', floor: '', notes: '' });
    await load();
    onUpdate();
  };

  const handleAssignQr = async (qrId: string, placementId: string) => {
    const ds = getDataService(getSupabaseClient());
    await ds.assignQRToPlacement(qrId, placementId);
    await load();
    onUpdate();
  };

  const handleCreateQrForPlacement = async (placement: Placement) => {
    const ds = getDataService(getSupabaseClient());
    const url = placementUrl(placement);
    await ds.createQRCode({
      campaign_id: campaignId,
      placement_id: placement.id,
      code: shortCode,
      url,
      game_start_count: 0,
      game_complete_count: 0,
      registration_count: 0,
      is_active: true,
    });
    await load();
    onUpdate();
  };

  const handlePrintQr = async (placement: Placement) => {
    const url = placementUrl(placement);
    let image = qrImages[placement.id!];
    if (!image) {
      const generated = await QRCodeLib.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      image = generated;
      setQrImages(prev => ({ ...prev, [placement.id!]: generated }));
    }
    const a = document.createElement('a');
    a.href = image;
    a.download = `${campaignId}-${placement.code}-qr.png`;
    a.click();
  };

  const assignedQrFor = (placement: Placement): QRCode | undefined => {
    return qrCodes.find(q => q.placement_id === placement.id && q.is_active);
  };

  const unassignedQrs = qrCodes.filter(q => !q.placement_id && q.is_active);

  const renderHistory = (placement: Placement) => {
    const entries = history[placement.id!] ?? [];
    if (entries.length === 0) {
      return <p style={{ color: '#555', fontSize: '0.72rem', margin: '0.25rem 0 0' }}>—</p>;
    }
    return (
      <div style={{ marginTop: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
        {entries.map((entry, i) => (
          <div key={entry.id ?? i} style={{ fontSize: '0.7rem', color: '#888', padding: '0.15rem 0', borderBottom: '1px solid #1a1a24' }}>
            <span style={{ color: '#ccc' }}>{entry.action.replace(/_/g, ' ')}</span>
            <span style={{ color: '#555', marginLeft: '0.5rem' }}>{new Date(entry.created_at ?? '').toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>{t('campaign.placements')}</p>
        <button onClick={() => setCreating(v => !v)} style={btnPrimary}>{t('campaign.newPlacement')}</button>
      </div>

      {creating && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
            {([
              { key: 'name', label: t('campaign.placementName') },
              { key: 'code', label: t('campaign.placementCode') },
              { key: 'city', label: t('campaign.city') },
              { key: 'district', label: t('campaign.district') },
              { key: 'venue', label: t('campaign.venue') },
              { key: 'building', label: t('campaign.building') },
              { key: 'floor', label: t('campaign.floor') },
            ] as { key: keyof typeof form; label: string }[]).map(field => (
              <div key={field.key}>
                <label style={labelStyle}>{field.label}</label>
                <input
                  style={inputStyle}
                  value={form[field.key]}
                  onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>{t('campaign.notes')}</label>
              <input
                style={inputStyle}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button onClick={handleAddPlacement} style={btnPrimary}>{t('campaign.addPlacement')}</button>
            <button onClick={() => setCreating(false)} style={btnSmall}>{t('campaign.close')}</button>
          </div>
        </div>
      )}

      {placements.length === 0 && !creating && (
        <div style={{ background: '#12121a', border: '1px dashed #2a2a3a', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '0.82rem', margin: 0 }}>{t('campaign.noPlacements')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {placements.map(placement => {
          const assigned = assignedQrFor(placement);
          return (
            <div key={placement.id} style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#f0f0f0', fontWeight: 600, fontSize: '0.9rem' }}>{placement.name}</span>
                <span style={{ background: '#1e1e2e', padding: '1px 7px', borderRadius: '4px', color: '#888', fontSize: '0.7rem', fontFamily: 'monospace' }}>{placement.code}</span>
                <span style={{ padding: '1px 7px', borderRadius: '4px', background: STATUS_COLORS[placement.status] ?? '#333', color: '#fff', fontSize: '0.65rem', fontWeight: 600 }}>{placement.status}</span>
                <span style={{ color: '#555', fontSize: '0.72rem', flex: 1 }}>
                  {[placement.city, placement.district, placement.venue, placement.building && `B${placement.building}`, placement.floor && `F${placement.floor}`].filter(Boolean).join(' · ') || '—'}
                </span>
                <button onClick={() => handlePrintQr(placement)} style={btnSmall} disabled={!assigned}>{t('campaign.printQr')}</button>
              </div>

              {placement.notes && <p style={{ color: '#777', fontSize: '0.75rem', margin: '0.4rem 0 0' }}>{placement.notes}</p>}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.6rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#555', fontSize: '0.75rem' }}>{t('campaign.qrForPlacement')}:</span>
                  {assigned ? (
                    <span style={{ color: '#22c55e', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{placementUrl(placement)}</span>
                  ) : (
                    <button onClick={() => handleCreateQrForPlacement(placement)} style={btnSmall}>{t('campaign.createQrForPlacement')}</button>
                  )}
                </div>

                {!assigned && unassignedQrs.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) handleAssignQr(e.target.value, placement.id!); }}
                    style={{ ...inputStyle, width: 'auto', padding: '0.35rem', fontSize: '0.75rem' }}
                  >
                    <option value="">{t('campaign.assignQrToPlacement')}</option>
                    {unassignedQrs.map(q => (
                      <option key={q.id} value={q.id}>{q.code}</option>
                    ))}
                  </select>
                )}

                {assigned && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) handleAssignQr(e.target.value, placement.id!); }}
                    style={{ ...inputStyle, width: 'auto', padding: '0.35rem', fontSize: '0.75rem' }}
                  >
                    <option value="">{t('campaign.moveQr')}</option>
                    {qrCodes.filter(q => q.id !== assigned.id).map(q => (
                      <option key={q.id} value={q.id}>{q.code} ({q.placement_id ? 'moved' : 'unassigned'})</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ marginTop: '0.6rem' }}>
                <p style={{ color: '#888', fontSize: '0.72rem', margin: 0 }}>{t('campaign.placementHistory')}</p>
                {renderHistory(placement)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
