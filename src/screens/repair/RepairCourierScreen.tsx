import { useState, useEffect, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, HStack } from '../../design-system/layout';
import { getRepairRepository } from '../../services/repair/repair-repository';
import type { CourierJobStatus, CourierJob } from '../../services/repair/repair-types';

const STATUS_ARABIC: Record<string, string> = {
  'Pending': 'بانتظار',
  'Trip Started': 'بدأ التوصيل',
  'Arrived': 'وصلت',
  'Collected': 'تم الاستلام',
  'Heading To Store': 'متجه للمتجر',
  'Delivered To Store': 'تم التوصيل للمتجر',
  'Returning': 'رجوع',
  'Returned': 'تم التسليم',
};

const STATUS_ACTIONS: Record<string, CourierJobStatus> = {
  'Pending': 'Trip Started',
  'Trip Started': 'Arrived',
  'Arrived': 'Collected',
  'Collected': 'Heading To Store',
  'Heading To Store': 'Delivered To Store',
};

const RETURN_ACTIONS: Record<string, CourierJobStatus> = {
  'Delivered To Store': 'Returning',
  'Returning': 'Returned',
};

const ACTION_LABELS: Record<string, string> = {
  'Trip Started': 'بدء التوصيل',
  'Arrived': 'وصلت',
  'Collected': 'استلام الجهاز',
  'Heading To Store': 'متجه للمتجر',
  'Delivered To Store': 'تم التوصيل للمتجر',
  'Returning': 'توصيل للعميل',
  'Returned': 'تم التوصيل',
};

export const RepairCourierScreen = memo(function RepairCourierScreen() {
  const dispatch = useAppDispatch();
  const { t: translate, dir } = useTranslation();
  const t = translate as (key: string) => string;
  const colors = useThemeColors();

  const [jobs, setJobs] = useState<CourierJob[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const loadJobs = useCallback(async () => {
    const repo = getRepairRepository();
    const data = await repo.getAllCourierJobs();
    setJobs(data);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleUpdateStatus = useCallback(async (jobId: string, status: CourierJobStatus) => {
    const repo = getRepairRepository();
    await repo.updateCourierJobStatus(jobId, status);
    await loadJobs();
  }, [loadJobs]);

  const getStatusColor = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warning,
      'Trip Started': colors.accent,
      'Arrived': colors.info,
      'Collected': colors.accent,
      'Heading To Store': colors.info,
      'Delivered To Store': colors.success,
      'Returning': colors.accent,
      'Returned': colors.success,
    };
    return map[status] || colors.textMuted;
  };

  const getStatusBg = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warningBg,
      'Trip Started': colors.accentGlow,
      'Arrived': colors.infoBg,
      'Collected': colors.accentGlow,
      'Heading To Store': colors.infoBg,
      'Delivered To Store': colors.successBg,
      'Returning': colors.accentGlow,
      'Returned': colors.successBg,
    };
    return map[status] || colors.bgInput;
  };

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '14px',
    border: `1px solid ${colors.borderLight}`, padding: '1rem',
    marginBottom: '0.75rem',
  };

  const badgeStyle = (status: string): React.CSSProperties => ({
    padding: '0.25rem 0.8rem', borderRadius: '12px', fontSize: '0.75rem',
    fontWeight: 700, fontFamily: 'inherit',
    background: getStatusBg(status), color: getStatusColor(status),
    display: 'inline-block',
  });

  const btnStyle: React.CSSProperties = {
    background: colors.accent, color: '#fff', border: 'none',
    borderRadius: '10px', padding: '0.6rem 1.2rem', fontSize: '0.8rem',
    fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <Screen ariaLabel="Courier dashboard" scroll>
      <div style={{ direction: dir }}>
        <div style={{ marginBottom: '1rem' }}>
          <h1 style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.25rem' }}>
            {t('repair.courierTasks') || 'مهام التوصيل'}
          </h1>
          <div style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{today}</div>
        </div>

        <HStack justify="space-between" align="center" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
            {t('repair.totalJobs') || 'إجمالي المهام'}: {jobs.length}
          </div>
          <button onClick={() => loadJobs()} style={{
            background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
            color: colors.textSecondary, borderRadius: '10px', padding: '0.5rem 1rem',
            fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {t('repair.refresh') || 'تحديث'}
          </button>
        </HStack>

        {jobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted, fontSize: '0.85rem' }}>
            {t('repair.noJobs') || 'لا توجد مهام'}
          </div>
        )}

        {jobs.map(job => {
          const isExpanded = expandedId === job.id;
          const nextAction = STATUS_ACTIONS[job.status] || RETURN_ACTIONS[job.status];

          return (
            <div key={job.id} style={cardStyle}>
              <div
                onClick={() => setExpandedId(prev => prev === job.id ? null : job.id)}
                style={{ cursor: 'pointer' }}
              >
                <HStack justify="space-between" align="center" style={{ marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.text }}>
                    {t('repair.repairCode') || 'كود التصليح'}: {job.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={badgeStyle(job.status)}>
                    {STATUS_ARABIC[job.status] || job.status}
                  </span>
                </HStack>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
                  {t('repair.customer') || 'العميل'}: {job.customerName}
                </div>
                <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
                  {t('repair.phone') || 'الهاتف'}: {job.customerPhone}
                </div>
                {job.customerAddress && (
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '0.2rem' }}>
                    {t('repair.address') || 'العنوان'}: {job.customerAddress}
                  </div>
                )}
                {job.distance !== null ? (
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '0.2rem' }}>
                    {t('repair.distance') || 'المسافة'}: {job.distance} km
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '0.2rem' }}>
                    {t('repair.distance') || 'المسافة'}: {t('repair.notAvailable') || 'غير متاح'}
                  </div>
                )}
              </div>

              {isExpanded && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${colors.borderLight}` }}>
                  {job.googleMapsLink && (
                    <a
                      href={job.googleMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block', color: colors.accent, fontSize: '0.8rem',
                        textDecoration: 'none', marginBottom: '0.75rem', wordBreak: 'break-all',
                      }}
                    >
                      📍 {t('repair.openMaps') || 'فتح في خرائط جوجل'}
                    </a>
                  )}

                  {nextAction && (
                    <button
                      onClick={() => handleUpdateStatus(job.id, nextAction)}
                      style={btnStyle}
                    >
                      {ACTION_LABELS[nextAction] || nextAction}
                    </button>
                  )}

                  {!nextAction && (
                    <div style={{ fontSize: '0.75rem', color: colors.success, fontWeight: 600 }}>
                      {t('repair.jobCompleted') || 'المهمة مكتملة'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '1rem' }}>
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
