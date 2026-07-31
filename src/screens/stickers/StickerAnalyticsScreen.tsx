import { useState, useEffect, memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import { Screen } from '../../design-system/layout';
import { computeSummary, getAISuggestions } from '../../services/sticker/sticker-analytics';
import type { AnalyticsSummary, AISuggestion } from '../../services/sticker/sticker-analytics';
import { getAllScans, getHeatMap, getBestStickerToday, getBestWisdom, getWorstWisdom } from '../../services/sticker/sticker-database';
import type { CampaignHeatMapEntry, StickerAnalyticsRow, WisdomAnalytics } from '../../services/sticker/sticker-types';
import { STICKER_CTA_LABEL_KEYS } from '../../services/sticker/sticker-types';
import type { StickerCTA } from '../../services/sticker/sticker-types';

type SortKey = 'serial' | 'scans';

export const StickerAnalyticsScreen = memo(function StickerAnalyticsScreen() {
  const { t, dir } = useTranslation();
  const colors = useThemeColors();
  const styles = useThemeStyles();

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [heatMap, setHeatMap] = useState<CampaignHeatMapEntry[]>([]);
  const [analyticsRows, setAnalyticsRows] = useState<StickerAnalyticsRow[]>([]);
  const [bestToday, setBestToday] = useState<{ serialNumber: string; scans: number } | null>(null);
  const [bestWisdom, setBestWisdom] = useState<WisdomAnalytics | null>(null);
  const [worstWisdom, setWorstWisdom] = useState<WisdomAnalytics | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('scans');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const scans = getAllScans();
    const s = computeSummary(scans);
    setSummary(s);
    setSuggestions(getAISuggestions(s));
    setHeatMap(getHeatMap());
    setBestToday(getBestStickerToday());
    setBestWisdom(getBestWisdom());
    setWorstWisdom(getWorstWisdom());

    const serialMap = new Map<string, number>();
    for (const scan of scans) {
      serialMap.set(scan.serialNumber, (serialMap.get(scan.serialNumber) || 0) + 1);
    }
    const rows: StickerAnalyticsRow[] = Array.from(serialMap.entries()).map(([serialNumber, scans]) => ({
      serialNumber, scans, gameStarted: 0, gameCompleted: 0, whatsapp: 0, repair: 0, purchase: 0, exchange: 0,
    }));
    setAnalyticsRows(rows);
  }, []);

  const sortedRows = [...analyticsRows].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === 'serial') return mul * a.serialNumber.localeCompare(b.serialNumber);
    return mul * (a.scans - b.scans);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const ctaEntries = summary ? Object.entries(summary.ctaBreakdown).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a) : [];
  const maxCtaEntry = ctaEntries[0];
  const maxCta = maxCtaEntry ? maxCtaEntry[1] : 1;

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    borderRadius: '16px',
    border: `1px solid ${colors.borderLight}`,
    padding: '1.25rem',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: 'inherit',
  };

  const suggestionIcon: Record<string, string> = {
    insight: '💡',
    recommendation: '⭐',
    tip: '💬',
  };

  const suggestionBg: Record<string, string> = {
    insight: colors.infoBg,
    recommendation: colors.warningBg,
    tip: colors.successBg,
  };

  const suggestionText: Record<string, string> = {
    insight: colors.infoText,
    recommendation: colors.warningText,
    tip: colors.successText,
  };

  const starColor = (rating: number) => {
    if (rating >= 4) return colors.success;
    if (rating >= 3) return colors.warning;
    return colors.textMuted;
  };

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '2rem' }} dir={dir}>

        <h1 style={{ color: colors.text, fontSize: '1.25rem', fontWeight: 800, margin: 0, fontFamily: 'inherit' }}>
          {t('sticker.analytics.title')}
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          <div style={cardStyle}>
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit' }}>
              {t('sticker.analytics.totalScans')}
            </div>
            <div style={{ color: colors.accent, fontSize: '1.75rem', fontWeight: 800, fontFamily: 'inherit', marginTop: '0.25rem' }}>
              {summary?.totalScans ?? 0}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit' }}>
              {t('sticker.analytics.uniqueStickers')}
            </div>
            <div style={{ color: colors.accent, fontSize: '1.75rem', fontWeight: 800, fontFamily: 'inherit', marginTop: '0.25rem' }}>
              {summary?.uniqueSerials ?? 0}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: 500, fontFamily: 'inherit' }}>
              {t('sticker.analytics.bestCampaign')}
            </div>
            <div style={{ color: colors.accent, fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit', marginTop: '0.25rem' }}>
              {summary?.topCampaigns[0]?.campaign ?? t('sticker.analytics.noData')}
            </div>
            {summary?.topCampaigns[0] && (
              <div style={{ color: colors.textMuted, fontSize: '0.7rem', fontFamily: 'inherit', marginTop: '0.15rem' }}>
                {summary.topCampaigns[0].scans} {t('sticker.analytics.scans')}
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...styles.flexBetween, marginBottom: '0.75rem' }}>
            <span style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit' }}>
              {t('sticker.analytics.analyticsTable')}
            </span>
            <button
              onClick={() => toggleSort(sortKey === 'serial' ? 'scans' : 'serial')}
              style={{
                background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
                color: colors.textSecondary, borderRadius: '8px', padding: '0.35rem 0.75rem',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem',
              }}
            >
              {sortKey === 'serial' ? t('sticker.analytics.sortScans') : t('sticker.analytics.sortSerial')}
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.borderLight}`, color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th
                  style={{ padding: '0.5rem 0.25rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  onClick={() => toggleSort('serial')}
                >
                  {t('sticker.analytics.serialNumber')} {sortKey === 'serial' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  style={{ padding: '0.5rem 0.25rem', textAlign: 'right', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  onClick={() => toggleSort('scans')}
                >
                  {t('sticker.analytics.scans')} {sortKey === 'scans' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center', padding: '2rem 0', color: colors.textMuted, fontFamily: 'inherit' }}>
                    {t('sticker.analytics.noData')}
                  </td>
                </tr>
              ) : sortedRows.map((row) => (
                <tr key={row.serialNumber} style={{ borderBottom: `1px solid ${colors.border}`, fontFamily: 'inherit' }}>
                  <td style={{ padding: '0.5rem 0.25rem', color: colors.text, fontFamily: 'inherit' }}>{row.serialNumber}</td>
                  <td style={{ padding: '0.5rem 0.25rem', textAlign: 'right', color: colors.accent, fontWeight: 700, fontFamily: 'inherit' }}>{row.scans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={cardStyle}>
          <div style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: 'inherit' }}>
            {t('sticker.analytics.heatMap')}
          </div>
          {heatMap.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.analytics.noData')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.borderLight}`, color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.5rem 0.25rem', textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 }}>{t('sticker.analytics.location')}</th>
                  <th style={{ padding: '0.5rem 0.25rem', textAlign: 'right', fontFamily: 'inherit', fontWeight: 600 }}>{t('sticker.analytics.scans')}</th>
                  <th style={{ padding: '0.5rem 0.25rem', textAlign: 'right', fontFamily: 'inherit', fontWeight: 600 }}>{t('sticker.analytics.rating')}</th>
                </tr>
              </thead>
              <tbody>
                {heatMap.map((entry) => (
                  <tr key={entry.location} style={{ borderBottom: `1px solid ${colors.border}`, fontFamily: 'inherit' }}>
                    <td style={{ padding: '0.5rem 0.25rem', color: colors.text, fontFamily: 'inherit' }}>{entry.location}</td>
                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'right', color: colors.text, fontFamily: 'inherit' }}>{entry.scans}</td>
                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'right', color: starColor(entry.rating), fontFamily: 'inherit' }}>
                      {'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'inherit' }}>
            {t('sticker.analytics.bestStickerToday')}
          </div>
          {bestToday ? (
            <div>
              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit' }}>
                {t('sticker.analytics.serialNumber')}: <span style={{ color: colors.accent, fontWeight: 700 }}>{bestToday.serialNumber}</span>
              </div>
              <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginTop: '0.25rem', fontFamily: 'inherit' }}>
                {t('sticker.analytics.scans')}: <span style={{ color: colors.accent, fontWeight: 700 }}>{bestToday.scans}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.analytics.noDataYet')}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: 'inherit' }}>
            {t('sticker.analytics.ctaBreakdown')}
          </div>
          {ctaEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.analytics.noData')}
            </div>
          ) : (
            <div style={styles.flexCol}>
              {ctaEntries.map(([cta, count]) => (
                <div key={cta} style={styles.flexRow}>
                  <span style={{ color: colors.textSecondary, fontSize: '0.8rem', minWidth: '100px', fontFamily: 'inherit' }}>
                    {t(STICKER_CTA_LABEL_KEYS[cta as StickerCTA] as any)}
                  </span>
                  <div style={{
                    flex: 1, height: '8px', background: colors.bgInput, borderRadius: '4px', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(count / maxCta) * 100}%`,
                      height: '100%',
                      background: colors.accent,
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ color: colors.accent, fontWeight: 700, fontSize: '0.8rem', minWidth: '30px', textAlign: 'right', fontFamily: 'inherit' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: 'inherit' }}>
            {t('sticker.analytics.wisdomAnalytics')}
          </div>
          {bestWisdom || worstWisdom ? (
            <div style={{ ...styles.flexCol, gap: '0.75rem' }}>
              {bestWisdom && (
                <div style={{
                  background: colors.successBg, borderRadius: '12px', padding: '0.75rem',
                  border: `1px solid ${colors.success}`,
                }}>
                  <div style={{ ...styles.flexRow, marginBottom: '0.25rem' }}>
                    <span style={badgeStyle}>{t('sticker.analytics.best')}</span>
                  </div>
                  <div style={{ color: colors.successText, fontSize: '0.85rem', fontFamily: 'inherit' }}>{bestWisdom.text}</div>
                  <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '0.25rem', fontFamily: 'inherit' }}>
                    {bestWisdom.scans} {t('sticker.analytics.scans')}
                  </div>
                </div>
              )}
              {worstWisdom && (
                <div style={{
                  background: colors.dangerBg, borderRadius: '12px', padding: '0.75rem',
                  border: `1px solid ${colors.danger}`,
                }}>
                  <div style={{ ...styles.flexRow, marginBottom: '0.25rem' }}>
                    <span style={badgeStyle}>{t('sticker.analytics.worst')}</span>
                  </div>
                  <div style={{ color: colors.dangerText, fontSize: '0.85rem', fontFamily: 'inherit' }}>{worstWisdom.text}</div>
                  <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '0.25rem', fontFamily: 'inherit' }}>
                    {worstWisdom.scans} {t('sticker.analytics.scans')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.analytics.noDataYet')}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', fontFamily: 'inherit' }}>
            {t('sticker.analytics.aiSuggestions')}
          </div>
          {suggestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.analytics.noData')}
            </div>
          ) : (
            <div style={styles.flexCol}>
              {suggestions.map((sg, i) => (
                <div key={i} style={{
                  background: suggestionBg[sg.type] || colors.bgInput,
                  borderRadius: '12px', padding: '0.75rem',
                  border: `1px solid transparent`,
                  display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{suggestionIcon[sg.type] || '💡'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: suggestionText[sg.type] || colors.textSecondary,
                      fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                    }}>
                      {t(sg.messageKey as any)}
                    </div>
                    <div style={{ color: colors.textFaint, fontSize: '0.65rem', marginTop: '0.15rem', fontFamily: 'inherit' }}>
                      {Math.round(sg.confidence * 100)}% {t('sticker.analytics.confidence')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Screen>
  );
});
