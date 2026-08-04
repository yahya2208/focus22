import { useState, useEffect, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { RepairTimeline } from '../../components/repair/RepairTimeline';
import { RepairQR } from '../../components/repair/RepairQR';
import { getRepairRepository } from '../../services/repair/repair-repository';
import type { RepairRequest, RepairTimelineEvent, SearchFilter } from '../../services/repair/repair-types';

const STATUS_ARABIC: Record<string, string> = {
  'Pending': 'بانتظار المعاينة', 'Received': 'تم الاستلام',
  'Diagnosing': 'قيد التشخيص', 'Waiting Parts': 'بانتظار قطع الغيار',
  'Repairing': 'قيد التصليح', 'Ready': 'جاهز',
  'Delivered': 'تم التسليم', 'Cancelled': 'ملغي',
};

const STATUS_ENGLISH: Record<string, string> = {
  'Pending': 'Pending Review', 'Received': 'Received',
  'Diagnosing': 'Diagnosing', 'Waiting Parts': 'Waiting Parts',
  'Repairing': 'Repairing', 'Ready': 'Ready',
  'Delivered': 'Delivered', 'Cancelled': 'Cancelled',
};

const STATUS_TURKISH: Record<string, string> = {
  'Pending': 'Beklemede', 'Received': 'Teslim Alındı',
  'Diagnosing': 'Teşhis Ediliyor', 'Waiting Parts': 'Parça Bekleniyor',
  'Repairing': 'Tamir Ediliyor', 'Ready': 'Hazır',
  'Delivered': 'Teslim Edildi', 'Cancelled': 'İptal Edildi',
};

function formatFullDate(iso: string, lang: string): string {
  const d = new Date(iso);
  const locale = lang === 'tr' ? 'tr-TR' : lang === 'en' ? 'en-US' : 'ar-SA';
  const dateStr = d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

export const RepairTrackingScreen = memo(function RepairTrackingScreen() {
  const dispatch = useAppDispatch();
  const { t, dir, locale } = useTranslation();
  const colors = useThemeColors();
  const lang = (locale === 'tr' ? 'tr' : locale === 'en' ? 'en' : 'ar') as string;

  const [searchInput, setSearchInput] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RepairRequest[] | null>(null);
  const [selectedRepair, setSelectedRepair] = useState<RepairRequest | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<RepairTimelineEvent[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setSearchInput(code);
      doSearch(code);
    }
  }, []);

  const doSearch = useCallback(async (input?: string) => {
    const query = (input ?? searchInput).trim();
    if (!query) return;
    setLoading(true);
    setNotFound(false);
    setResults(null);
    setSelectedRepair(null);
    setTimelineEvents([]);
    try {
      const repo = getRepairRepository();
      const found = await repo.search(query, searchFilter);
      if (!found || found.length === 0) { setNotFound(true); return; }
      if (found.length === 1) {
        const repair = found[0]!;
        setSelectedRepair(repair);
        const events = await repo.getTimeline(repair.id);
        setTimelineEvents(events);
      } else {
        setResults(found);
      }
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, [searchInput, searchFilter]);

  const handleSelectRepair = useCallback(async (repair: RepairRequest) => {
    setSelectedRepair(repair);
    setResults(null);
    const repo = getRepairRepository();
    const events = await repo.getTimeline(repair.id);
    setTimelineEvents(events);
  }, []);

  const getStatusLabel = (status: string): string => {
    if (lang === 'en') return STATUS_ENGLISH[status] || status;
    if (lang === 'tr') return STATUS_TURKISH[status] || status;
    return STATUS_ARABIC[status] || status;
  };

  const FILTERS: { key: SearchFilter; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'active', label: 'نشط' },
    { key: 'pending', label: 'بانتظار' },
    { key: 'delivered', label: 'مسلّم' },
    { key: 'archived', label: 'مؤرشف' },
  ];

  const themeBtn = (active = false): React.CSSProperties => ({
    background: active ? colors.accent : colors.bgInput,
    color: active ? '#fff' : colors.textSecondary,
    border: 'none', borderRadius: '12px', padding: '0.7rem 1.5rem',
    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
    cursor: 'pointer', transition: 'all 0.15s ease',
    minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard, borderRadius: '16px',
    border: `1px solid ${colors.borderLight}`,
    padding: '1.25rem', marginBottom: '1rem',
  };

  const badgeStyle = (status: string): React.CSSProperties => {
    const colorMap: Record<string, string> = {
      'Pending': colors.warning, 'Received': colors.info,
      'Diagnosing': colors.info, 'Waiting Parts': colors.warning,
      'Repairing': colors.info, 'Ready': colors.success,
      'Delivered': colors.success, 'Cancelled': colors.danger,
    };
    const bgMap: Record<string, string> = {
      'Pending': colors.warningBg, 'Received': colors.infoBg,
      'Diagnosing': colors.infoBg, 'Waiting Parts': colors.warningBg,
      'Repairing': colors.infoBg, 'Ready': colors.successBg,
      'Delivered': colors.successBg, 'Cancelled': colors.dangerBg,
    };
    return {
      padding: '0.35rem 1rem', borderRadius: '20px', fontSize: '0.75rem',
      fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.5,
      background: bgMap[status] || colors.bgInput,
      color: colorMap[status] || colors.text,
      display: 'inline-flex', alignItems: 'center', minHeight: '32px',
    };
  };

  // --- Search view ---
  if (!selectedRepair && !results && !loading) {
    return (
      <Screen ariaLabel="Repair tracking">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '70dvh', direction: dir, gap: '1rem',
        }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 700, margin: 0, textAlign: 'center' }}>
            {t('repair.trackTitle')}
          </h2>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
            {t('repair.trackHint')}
          </p>
          <div style={{ width: '100%', maxWidth: '320px' }}>
            <input
              style={{
                width: '100%', padding: '0.85rem 1rem', borderRadius: '12px',
                border: `1px solid ${colors.border}`, background: colors.bgInput,
                color: colors.text, fontSize: '0.9rem', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              type="text" inputMode="text" autoComplete="off"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder={t('repair.searchPlaceholder')}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setSearchFilter(f.key)} style={{
                padding: '0.3rem 0.7rem', borderRadius: '8px', border: 'none',
                background: searchFilter === f.key ? colors.accent : colors.bgInput,
                color: searchFilter === f.key ? '#fff' : colors.textSecondary,
                fontSize: '0.7rem', fontWeight: searchFilter === f.key ? 700 : 500,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => doSearch()} style={themeBtn(true)}>
            {t('repair.search')}
          </button>
          <button
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })}
            style={{ ...themeBtn(), background: 'none', border: `1px solid ${colors.borderLight}`, color: colors.textMuted }}
          >
            {t('repair.back')}
          </button>
        </div>
      </Screen>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <Screen ariaLabel="Loading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70dvh', color: colors.textMuted }}>
          {t('repair.loading')}
        </div>
      </Screen>
    );
  }

  // --- Not found ---
  if (notFound) {
    return (
      <Screen ariaLabel="Not found">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '70dvh', direction: dir, gap: '1rem',
        }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 700, margin: 0, textAlign: 'center' }}>
            {t('repair.notFound')}
          </h2>
          <button onClick={() => { setNotFound(false); setSearchInput(''); }} style={themeBtn(true)}>
            {t('repair.tryAgain')}
          </button>
        </div>
      </Screen>
    );
  }

  // --- Multiple results ---
  if (results && results.length > 0) {
    return (
      <Screen ariaLabel="Search results" scroll>
        <div style={{ direction: dir, padding: '1rem 0' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem' }}>
            {t('repair.searchResults')} ({results.length})
          </h2>
          {results.map(req => (
            <div key={req.id} onClick={() => handleSelectRepair(req)} style={{
              ...cardStyle, cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: '0.5rem',
            }}>
              <div>
                <div style={{
                  background: colors.accentGlow, color: colors.accent,
                  padding: '0.15rem 0.6rem', borderRadius: '8px',
                  fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
                  display: 'inline-block', marginBottom: '0.3rem',
                }}>
                  {req.repairCode}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
                  {req.brandName} {req.modelName}
                </div>
                <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>
                  {req.customerName} - {req.customerPhone}
                </div>
                {req.issue && (
                  <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '0.15rem' }}>
                    {req.issue}
                  </div>
                )}
              </div>
              <span style={badgeStyle(req.status)}>
                {getStatusLabel(req.status)}
              </span>
            </div>
          ))}
          <button
            onClick={() => { setResults(null); setNotFound(false); setSearchInput(''); }}
            style={{ ...themeBtn(), width: '100%', background: 'none', border: `1px solid ${colors.borderLight}`, color: colors.textMuted }}
          >
            {t('repair.newSearch')}
          </button>
        </div>
      </Screen>
    );
  }

  // --- Single result ---
  if (!selectedRepair) return null;

  return (
    <Screen ariaLabel="Repair details" scroll>
      <div style={{ direction: dir }}>
        <div style={cardStyle}>
          <h2 style={{
            fontSize: '0.75rem', fontWeight: 600, margin: '0 0 0.5rem',
            textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: colors.textMuted,
          }}>
            {t('repair.repairCode')}
          </h2>
          <p style={{
            color: colors.accent, fontSize: '1.5rem', fontWeight: 800,
            margin: '0 0 0.75rem', textAlign: 'center',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em',
          }}>
            {selectedRepair.repairCode}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <span style={badgeStyle(selectedRepair.status)}>
              {getStatusLabel(selectedRepair.status)}
            </span>
          </div>
          <Stack gap="sm">
            <DetailRow label={t('repair.customerName')} value={selectedRepair.customerName} colors={colors} />
            <DetailRow label={t('repair.customerPhone')} value={selectedRepair.customerPhone} colors={colors} />
            <DetailRow label={t('repair.device')} value={`${selectedRepair.brandName} ${selectedRepair.modelName}`} colors={colors} />
            <DetailRow label={t('repair.issue')} value={selectedRepair.issue} colors={colors} />
            {selectedRepair.condition && <DetailRow label={t('repair.condition')} value={selectedRepair.condition} colors={colors} />}
            <DetailRow label={t('repair.createdAt')} value={formatFullDate(selectedRepair.createdAt, lang)} colors={colors} />
            <DetailRow label={t('repair.updatedAt')} value={formatFullDate(selectedRepair.updatedAt, lang)} colors={colors} />
            {selectedRepair.adminNotes && <DetailRow label={t('repair.adminNotes')} value={selectedRepair.adminNotes} colors={colors} />}
          </Stack>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
            {t('repair.timeline')}
          </h3>
          {timelineEvents.length > 0 ? (
            <RepairTimeline events={timelineEvents} />
          ) : (
            <p style={{ color: colors.textMuted, fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
              {t('repair.noTimelineEvents')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
          <div style={{ width: '100%', maxWidth: '320px' }}>
            <RepairQR repairCode={selectedRepair.repairCode} size={160} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          <button
            onClick={() => { setSelectedRepair(null); setResults(null); setSearchInput(''); }}
            style={themeBtn(true)}
          >
            {t('repair.newSearch')}
          </button>
          <button
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'repair-home' })}
            style={{ ...themeBtn(), background: 'none', border: `1px solid ${colors.borderLight}`, color: colors.textMuted }}
          >
            {t('repair.backToHome')}
          </button>
        </div>
      </div>
    </Screen>
  );
});

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.6rem 0', borderBottom: `1px solid ${colors.borderLight}`,
    }}>
      <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{label}</span>
      <span style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
