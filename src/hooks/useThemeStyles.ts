import { useMemo } from 'react';
import { useThemeColors } from './useThemeColors';

export function useThemeStyles() {
  const colors = useThemeColors();
  return useMemo(() => ({
    flexCenter: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
    flexBetween: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    flexRow: { display: 'flex' as const, alignItems: 'center' as const, flexDirection: 'row' as const, gap: 8 },
    flexCol: { display: 'flex' as const, flexDirection: 'column' as const, gap: 8 },
    card: { background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: 12, padding: 16 },
    cardSmall: { background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: 8 },
    textMuted: { color: colors.textMuted, fontSize: 12 },
    textSmall: { color: colors.textSecondary, fontSize: 14 },
    heading: { fontSize: 18, fontWeight: 'bold' as const, color: colors.text, margin: 0 },
    subheading: { fontSize: 14, fontWeight: 600, color: colors.textSecondary, margin: 0 },
    badge: { background: colors.accent + '20', color: colors.accent, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999 },
    accentBg: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' },
    ghostBtn: { background: 'transparent', color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
    input: { background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: '10px 12px', color: colors.text, fontSize: 14, width: '100%' as const },
    grid2: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr', gap: 8 },
    grid3: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
    scrollY: { overflowY: 'auto' as const, flex: 1 },
    page: { maxWidth: 480, margin: '0 auto', padding: '1rem', background: colors.bg },
    cardHover: { background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: 12, padding: 16, transition: 'all 0.2s ease', cursor: 'pointer' },
    btnPrimary: { background: colors.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
    btnSecondary: { background: colors.glass, color: colors.text, border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
    btnDanger: { background: colors.danger, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
    tabActive: { background: colors.accent + '20', color: colors.accent, border: `1px solid ${colors.accent}44`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' },
    tabInactive: { background: 'transparent', color: colors.textMuted, border: `1px solid transparent`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500, fontSize: 13, fontFamily: 'inherit' },
    chip: { background: colors.bgHover, color: colors.textSecondary, fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 9999, display: 'inline-flex' as const, alignItems: 'center' as const },
    divider: { border: 'none', borderTop: `1px solid ${colors.border}`, margin: '16px 0' },
    modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 1000 },
    modalContent: { background: colors.bgCard, border: `1px solid ${colors.glassBorder}`, borderRadius: 16, padding: '1.5rem', maxWidth: 420, width: '90%' as const, boxShadow: `0 16px 64px ${colors.shadow}` },
  }), [colors]);
}
