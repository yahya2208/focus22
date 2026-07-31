import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, HStack, Stack, Grid } from '../../design-system/layout';
import { getRepairRepository } from '../../services/repair/repair-repository';
import { getNextValidStatuses, type RepairRequestStatus } from '../../services/repair/repair-types';
import type { RepairQuote, RepairRequest, Courier, Technician } from '../../services/repair/repair-types';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'منذ دقائق';
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

const STATUS_ARABIC: Record<string, string> = {
  'Pending': 'بانتظار المعاينة',
  'Received': 'تم الاستلام',
  'Diagnosing': 'قيد التشخيص',
  'Waiting Parts': 'بانتظار القطع',
  'Repairing': 'قيد التصليح',
  'Ready': 'جاهز',
  'Delivered': 'تم التسليم',
  'Archived': 'مؤرشف',
  'Cancelled': 'ملغي',
};

const KANBAN_STATUSES: RepairRequestStatus[] = [
  'Pending', 'Received', 'Diagnosing', 'Waiting Parts', 'Repairing', 'Ready', 'Delivered', 'Archived',
];

export const RepairAdminDashboard = memo(function RepairAdminDashboard() {
  const dispatch = useAppDispatch();
  const { t: translate, dir } = useTranslation();
  const t = translate as (key: string) => string;
  const colors = useThemeColors();

  const [allRequests, setAllRequests] = useState<RepairRequest[]>([]);
  const [allQuotes, setAllQuotes] = useState<RepairQuote[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quotePrice, setQuotePrice] = useState('');
  const [quoteDays, setQuoteDays] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [recommendedAction, setRecommendedAction] = useState<'repair' | 'replace' | 'exchange_offer' | ''>('');
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [statusNote, setStatusNote] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<RepairRequestStatus | ''>('');

  const loadData = useCallback(async () => {
    const repo = getRepairRepository();
    const [requests, c, t] = await Promise.all([
      repo.getAllRequests(),
      repo.getAllCouriers(),
      repo.getAllTechnicians(),
    ]);
    setAllRequests(requests);
    setCouriers(c);
    setTechnicians(t);
    const qResults: RepairQuote[] = [];
    for (const r of requests) {
      try {
        const quote = await repo.getQuote(r.id);
        if (quote) qResults.push(quote);
      } catch {}
    }
    setAllQuotes(qResults);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const groupedRequests = useMemo(() => {
    const groups: Record<string, RepairRequest[]> = {};
    for (const s of KANBAN_STATUSES) groups[s] = [];
    for (const r of allRequests) {
      if (groups[r.status]) groups[r.status]!.push(r);
    }
    return groups;
  }, [allRequests]);

  const pending = allRequests.filter(r => r.status === 'Pending').length;
  const inWorkshop = allRequests.filter(r => ['Diagnosing', 'Repairing', 'Waiting Parts'].includes(r.status)).length;
  const waitingParts = allRequests.filter(r => r.status === 'Waiting Parts').length;
  const ready = allRequests.filter(r => r.status === 'Ready').length;
  const delivered = allRequests.filter(r => r.status === 'Delivered').length;
  const archived = allRequests.filter(r => r.status === 'Archived').length;

  const handleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setQuotePrice('');
    setQuoteDays('');
    setQuoteNotes('');
    setRecommendedAction('');
    setSelectedCourierId('');
    setSelectedTechnicianId('');
    setStatusNote('');
    setSelectedStatus('');
  }, []);

  const handleSendQuote = useCallback(async (repairId: string) => {
    const price = parseFloat(quotePrice);
    const days = parseInt(quoteDays, 10);
    if (isNaN(price) || isNaN(days)) return;
    const repo = getRepairRepository();
    await repo.createQuote(repairId, price, days, quoteNotes, recommendedAction || null);
    setExpandedId(null);
    await loadData();
  }, [quotePrice, quoteDays, quoteNotes, recommendedAction, loadData]);

  const handleAssignCourier = useCallback(async (repairId: string) => {
    if (!selectedCourierId) return;
    const courier = couriers.find(c => c.id === selectedCourierId);
    if (!courier) return;
    const repo = getRepairRepository();
    await repo.assignCourier(repairId, selectedCourierId, courier.name);
    setExpandedId(null);
    await loadData();
  }, [selectedCourierId, couriers, loadData]);

  const handleAssignTechnician = useCallback(async (repairId: string) => {
    if (!selectedTechnicianId) return;
    const tech = technicians.find(t => t.id === selectedTechnicianId);
    if (!tech) return;
    const repo = getRepairRepository();
    await repo.assignTechnician(repairId, selectedTechnicianId, tech.name);
    setExpandedId(null);
    await loadData();
  }, [selectedTechnicianId, technicians, loadData]);

  const handleUpdateStatus = useCallback(async (repairId: string) => {
    if (!selectedStatus) return;
    const repo = getRepairRepository();
    await repo.updateStatus(repairId, selectedStatus as RepairRequestStatus, statusNote || undefined);
    setExpandedId(null);
    await loadData();
  }, [selectedStatus, statusNote, loadData]);

  const getStatusColor = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warning,
      'Received': colors.info,
      'Diagnosing': colors.info,
      'Waiting Parts': colors.warning,
      'Repairing': colors.info,
      'Ready': colors.success,
      'Delivered': colors.success,
      'Cancelled': colors.danger,
    };
    return map[status] || colors.textMuted;
  };

  const getStatusBg = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warningBg,
      'Received': colors.infoBg,
      'Diagnosing': colors.infoBg,
      'Waiting Parts': colors.warningBg,
      'Repairing': colors.infoBg,
      'Ready': colors.successBg,
      'Delivered': colors.successBg,
      'Cancelled': colors.dangerBg,
    };
    return map[status] || colors.bgInput;
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: colors.textSecondary, marginBottom: '0.3rem',
  };

  const inputStyle: React.CSSProperties = {
    background: colors.bgInput, border: `1px solid ${colors.border}`,
    color: colors.text, borderRadius: '10px', padding: '0.7rem 0.9rem',
    width: '100%', fontFamily: 'inherit', fontSize: '0.85rem',
    boxSizing: 'border-box', outline: 'none',
  };

  const btnPrimary: React.CSSProperties = {
    background: colors.accent, color: '#fff', border: 'none',
    borderRadius: '12px', padding: '0.7rem 1.5rem', fontSize: '0.85rem',
    fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  };

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '14px',
    border: `1px solid ${colors.borderLight}`, padding: '1rem',
    marginBottom: '0.75rem',
  };

  return (
    <Screen ariaLabel="Repair admin dashboard" scroll>
      <div style={{ direction: dir }}>
        <HStack justify="space-between" align="center" style={{ marginBottom: '1rem' }}>
          <h1 style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
            {t('repair.adminDashboard') || 'لوحة الصيانة'}
          </h1>
          <button onClick={() => loadData()} style={{
            background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
            color: colors.textSecondary, borderRadius: '10px', padding: '0.5rem 1rem',
            fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {t('repair.refresh') || 'تحديث'}
          </button>
        </HStack>

        <Grid columns={6} gap="sm" style={{ marginBottom: '1rem' }}>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid ${colors.warningBg}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.warning }}>{pending}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.pending') || 'بانتظار'}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid ${colors.accentGlow}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.accent }}>{inWorkshop}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.inWorkshop') || 'قيد الإصلاح'}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid ${colors.dangerBg}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.danger }}>{waitingParts}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.waitingParts') || 'قطع'}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid ${colors.successBg}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.success }}>{ready}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.ready') || 'جاهز'}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid #3b82f666` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6' }}>{delivered}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.delivered') || 'مسلّم'}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: 'center', border: `1px solid #8b5cf666` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#8b5cf6' }}>{archived}</div>
            <div style={{ fontSize: '0.65rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
              {t('repair.archived') || 'مؤرشف'}
            </div>
          </div>
        </Grid>

        {delivered > 0 && (
          <HStack justify="flex-start" style={{ marginBottom: '0.75rem' }}>
            <button onClick={async () => {
              if (!window.confirm(`أرشفة جميع الطلبات التي تم تسليمها (${delivered})؟`)) return;
              const repo = getRepairRepository();
              await repo.archiveAllDelivered();
              loadData();
            }} style={{
              padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid #8b5cf666',
              background: 'transparent', color: '#8b5cf6',
              fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              أرشفة الكل
            </button>
          </HStack>
        )}

        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.75rem',
          direction: 'ltr',
        }}>
          {KANBAN_STATUSES.map(status => {
            const requests = groupedRequests[status] || [];
            return (
              <div key={status} style={{
                minWidth: '240px', maxWidth: '280px', flex: '1 0 auto',
                background: colors.bgInput, borderRadius: '14px',
                padding: '0.75rem', direction: dir,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '0.6rem', padding: '0 0.25rem',
                }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700, color: colors.text,
                    fontFamily: 'inherit',
                  }}>
                    {STATUS_ARABIC[status] || status}
                  </span>
                  <span style={{
                    background: getStatusBg(status), color: getStatusColor(status),
                    padding: '0.15rem 0.55rem', borderRadius: '10px',
                    fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit',
                  }}>
                    {requests.length}
                  </span>
                </div>
                {requests.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1rem 0', color: colors.textFaint, fontSize: '0.7rem' }}>
                    لا توجد
                  </div>
                )}
                {requests.map(req => {
                  const isExpanded = expandedId === req.id;
                  return (
                    <div key={req.id} style={{
                      background: colors.bgCard, borderRadius: '12px',
                      border: isExpanded ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
                      padding: '0.6rem', marginBottom: '0.5rem', cursor: 'pointer',
                    }} onClick={() => handleExpand(req.id)}>
                      <div style={{
                        background: colors.accentGlow, color: colors.accent,
                        padding: '0.1rem 0.5rem', borderRadius: '6px',
                        fontSize: '0.65rem', fontWeight: 700, fontFamily: 'inherit',
                        display: 'inline-block', marginBottom: '0.3rem',
                      }}>
                        {req.repairCode}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.text, marginBottom: '0.15rem' }}>
                        {req.customerName}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>
                        {req.brandName} {req.modelName}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: colors.textFaint, marginTop: '0.15rem' }}>
                        {formatTimeAgo(req.createdAt)}
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${colors.borderLight}` }}>
                          {req.status === 'Pending' && (
                            <Stack gap="sm">
                              {(() => {
                                const quote = allQuotes.find(q => q.repairId === req.id);
                                return (
                                  <>
                                    {quote && (
                                      <div style={{ background: colors.bgCard, borderRadius: '8px', padding: '0.5rem', marginBottom: '0.3rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>
                                          {t('repair.currentPrice') || 'السعر الحالي'}: <strong style={{ color: colors.text }}>{quote.estimatedPrice} د.ج</strong>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>
                                          {t('repair.estimatedDays') || 'المدة'}: <strong style={{ color: colors.text }}>{quote.estimatedDays} يوم</strong>
                                        </div>
                                      </div>
                                    )}
                                    <div>
                                      <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.price') || 'السعر'}</label>
                                      <input style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem' }} type="number" value={quotePrice} onChange={e => setQuotePrice(e.target.value)} placeholder="0.00 د.ج" />
                                    </div>
                                    <div>
                                      <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.days') || 'المدة'}</label>
                                      <input style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem' }} type="number" value={quoteDays} onChange={e => setQuoteDays(e.target.value)} placeholder={t('repair.daysPlaceholder') || 'عدد الأيام'} />
                                    </div>
                                    <button onClick={() => handleSendQuote(req.id)} style={{ ...btnPrimary, padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                                      {t('repair.sendQuote') || 'إرسال السعر'}
                                    </button>
                                  </>
                                );
                              })()}
                            </Stack>
                          )}

                          {req.status !== 'Pending' && (
                            <Stack gap="sm">
                              <div>
                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.courier') || 'المندوب'}</label>
                                <select style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem' }} value={selectedCourierId} onChange={e => setSelectedCourierId(e.target.value)}>
                                  <option value="">{t('repair.selectCourier') || 'اختر المندوب...'}</option>
                                  {couriers.filter(c => c.status === 'active').map(c => (
                                    <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                                  ))}
                                </select>
                              </div>
                              <button onClick={() => handleAssignCourier(req.id)} style={{ ...btnPrimary, padding: '0.5rem 1rem', fontSize: '0.75rem' }} disabled={!selectedCourierId}>
                                {t('repair.assignCourier') || 'تعيين مندوب'}
                              </button>
                              <div>
                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.technician') || 'الفني'}</label>
                                <select style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem' }} value={selectedTechnicianId} onChange={e => setSelectedTechnicianId(e.target.value)}>
                                  <option value="">{t('repair.selectTechnician') || 'اختر الفني...'}</option>
                                  {technicians.filter(t => t.status === 'active').map(t => (
                                    <option key={t.id} value={t.id}>{t.name} — {t.phone}</option>
                                  ))}
                                </select>
                              </div>
                              <button onClick={() => handleAssignTechnician(req.id)} style={{ ...btnPrimary, padding: '0.5rem 1rem', fontSize: '0.75rem' }} disabled={!selectedTechnicianId}>
                                {t('repair.assignTechnician') || 'تعيين فني'}
                              </button>
                              <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: '0.5rem' }}>
                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.nextStatus') || 'الحالة التالية'}</label>
                                <select style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem' }} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as RepairRequestStatus)}>
                                  <option value="">{t('repair.selectStatus') || 'اختر الحالة...'}</option>
                                  {getNextValidStatuses(req.status).map(s => (
                                    <option key={s} value={s}>{STATUS_ARABIC[s] || s}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{t('repair.statusNote') || 'ملاحظة'}</label>
                                <textarea style={{ ...inputStyle, padding: '0.5rem 0.7rem', fontSize: '0.75rem', minHeight: '50px', resize: 'vertical' }} value={statusNote} onChange={e => setStatusNote(e.target.value)} />
                              </div>
                              <button onClick={() => handleUpdateStatus(req.id)} style={{ ...btnPrimary, padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                                {t('repair.updateStatus') || 'تحديث الحالة'}
                              </button>
                            </Stack>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {allRequests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted, fontSize: '0.85rem' }}>
            {t('repair.noRequests') || 'لا توجد طلبات'}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-personnel' })}
          style={{
            background: colors.accent, border: 'none', borderRadius: '14px',
            padding: '0.75rem 1.5rem', color: '#fff', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('repair.managePersonnel') || 'إدارة المندوبين والفنيين'}
        </button>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })}
          style={{
            background: 'none',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '14px',
            padding: '0.75rem 2rem',
            color: colors.textMuted,
            fontSize: '0.9rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {dir === 'rtl' ? '← العودة للوحة الصيانة' : '← Back to Repair'}
        </button>
      </div>
    </Screen>
  );
});
