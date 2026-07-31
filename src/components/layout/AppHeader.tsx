import { memo, useState, useRef, useEffect } from 'react';
import { useTheme } from '../../design-system/use-theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useSettings } from '../../hooks/useSettings';
import { useTranslation } from '../../hooks/useTranslation';
import type { Locale } from '../../i18n';
import { getLocaleName } from '../../i18n';
import { THEME_IDS, THEME_META } from '../../hooks/useThemeColors';

const locales: Locale[] = ['en', 'tr', 'ar', 'fr'];

export const AppHeader = memo(function AppHeader() {
  const colors = useThemeColors();
  const { theme, setTheme } = useTheme();
  const { update } = useSettings();
  const { locale } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '8px 16px',
    background: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 200,
  };

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    color: colors.textSecondary,
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
    minWidth: '140px',
    zIndex: 300,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  };

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: active ? colors.bgHover : 'transparent',
    color: active ? colors.accent : colors.textSecondary,
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  });

  return (
    <header style={headerStyle}>
      <div style={{ position: 'relative' }} ref={langRef}>
        <button
          style={btnStyle}
          onClick={() => { setLangOpen(!langOpen); setThemeOpen(false); }}
        >
          {getLocaleName(locale)}
          <span style={{ fontSize: '0.625rem', opacity: 0.6 }}>▼</span>
        </button>
        {langOpen && (
          <div style={dropdownStyle}>
            {locales.map((l) => (
              <button
                key={l}
                style={itemStyle(l === locale)}
                onClick={() => {
                  update({ language: l });
                  setLangOpen(false);
                }}
              >
                {l === locale && <span style={{ color: colors.accent }}>✓</span>}
                {l !== locale && <span style={{ width: '12px' }} />}
                {getLocaleName(l)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }} ref={themeRef}>
        <button
          style={btnStyle}
          onClick={() => { setThemeOpen(!themeOpen); setLangOpen(false); }}
        >
          {THEME_META[theme].label}
          <span style={{ fontSize: '0.625rem', opacity: 0.6 }}>▼</span>
        </button>
        {themeOpen && (
          <div style={dropdownStyle}>
            {THEME_IDS.map((tid) => (
              <button
                key={tid}
                style={itemStyle(tid === theme)}
                onClick={() => { setTheme(tid); setThemeOpen(false); }}
              >
                {tid === theme && <span style={{ color: colors.accent }}>✓</span>}
                {tid !== theme && <span style={{ width: '12px' }} />}
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: THEME_META[tid].preview[1],
                  border: `1px solid ${colors.border}`,
                }} />
                {THEME_META[tid].label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
});
