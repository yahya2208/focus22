import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import { useTranslation } from '../../hooks/useTranslation';

interface RepairTimelineEvent {
  id: string;
  status: string;
  note: string;
  createdAt: string;
  actor: string;
}

interface RepairTimelineProps {
  events: RepairTimelineEvent[];
}

const STATUS_ICONS: Record<string, string> = {
  'Pending': '📝', 'Received': '📦', 'Diagnosing': '🔍',
  'Waiting Parts': '⏳', 'Repairing': '🔧', 'Ready': '✅',
  'Delivered': '🚚', 'Cancelled': '❌',
};

function formatFullDate(iso: string, lang: string): string {
  const d = new Date(iso);
  const locale = lang === 'tr' ? 'tr-TR' : lang === 'en' ? 'en-US' : 'ar-SA';
  const dateStr = d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

export const RepairTimeline = memo(function RepairTimeline({ events }: RepairTimelineProps) {
  const colors = useThemeColors();
  const styles = useThemeStyles();
  const { dir, locale } = useTranslation();
  const lang = locale as string;

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getStatusColor = (status: string): string => {
    const map: Record<string, string> = {
      'Pending': colors.warning, 'Received': colors.info,
      'Diagnosing': colors.info, 'Waiting Parts': colors.warning,
      'Repairing': colors.info, 'Ready': colors.success,
      'Delivered': colors.success, 'Cancelled': colors.danger,
    };
    return map[status] || colors.textMuted;
  };

  const getActorLabel = (actor: string): string => {
    if (actor === 'customer') return lang === 'en' ? 'Customer' : lang === 'tr' ? 'Müşteri' : 'عميل';
    if (actor === 'admin') return lang === 'en' ? 'Admin' : lang === 'tr' ? 'Yönetici' : 'إدارة';
    if (actor === 'courier') return lang === 'en' ? 'Courier' : lang === 'tr' ? 'Kurye' : 'مندوب';
    return actor;
  };

  const isRtl = dir === 'rtl';

  if (sorted.length === 0) {
    return (
      <div style={{ ...styles.textMuted, textAlign: 'center', padding: '1rem', fontSize: '0.8rem' }}>
        {lang === 'en' ? 'No events yet' : lang === 'tr' ? 'Henüz olay yok' : 'لا توجد أحداث بعد'}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', padding: isRtl ? '0 32px 0 0' : '0 0 0 32px' }}>
      {sorted.map((event, i) => {
        const statusColor = getStatusColor(event.status);
        const icon = STATUS_ICONS[event.status] || '📌';
        const isLast = i === sorted.length - 1;

        return (
          <div key={event.id} style={{ position: 'relative', paddingBottom: isLast ? '0' : '28px' }}>
            {!isLast && (
              <div style={{
                position: 'absolute',
                [isRtl ? 'right' : 'left']: '11px',
                top: '26px',
                width: '2px',
                height: 'calc(100% - 8px)',
                background: statusColor + '30',
              }} />
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: statusColor + '18',
                border: `2.5px solid ${statusColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: '0.7rem', boxShadow: `0 0 0 4px ${statusColor}10`,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1, textAlign: isRtl ? 'right' : 'left', minWidth: 0 }}>
                <div style={{
                  fontWeight: 700, fontSize: '0.85rem', color: colors.text,
                  lineHeight: 1.4,
                }}>
                  {STATUS_ICONS[event.status] ? (
                    lang === 'en' ? event.status : event.status
                  ) : event.status}
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    {event.status === 'Pending' ? (lang === 'en' ? ' (Pending Review)' : lang === 'tr' ? ' (Beklemede)' : ' (بانتظار المعاينة)') : ''}
                  </span>
                </div>
                {event.note && (
                  <div style={{
                    fontSize: '0.8rem', color: colors.textSecondary,
                    marginTop: '2px', lineHeight: 1.4,
                  }}>
                    {event.note}
                  </div>
                )}
                <div style={{
                  display: 'flex', gap: '10px', marginTop: '6px',
                  fontSize: '0.7rem', color: colors.textMuted,
                  flexDirection: isRtl ? 'row-reverse' : 'row',
                  alignItems: 'center', flexWrap: 'wrap',
                }}>
                  <span style={{
                    ...styles.chip,
                    borderRadius: '6px', fontSize: '0.65rem',
                  }}>
                    {getActorLabel(event.actor)}
                  </span>
                  <span>{formatFullDate(event.createdAt, lang)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
