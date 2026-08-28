import { memo, type ReactNode } from 'react';
import { useAppState, useAppDispatch } from '../../store/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { AppHeader } from './AppHeader';
import { BackButton } from '../navigation/BackButton';
import { InstallPrompt } from '../pwa/InstallPrompt';
import { shouldShowBackAffordance } from '../../core/navigation/back-matrix';
import type { ScreenName } from '../../store/navigation';

const fullscreenScreens: ScreenName[] = ['calibration', 'countdown', 'game'];
const isTicTacToe = (s: ScreenName) => s === 'tic-tac-toe-intro' || s === 'tic-tac-toe' || s === 'tic-tac-toe-results';

const transitionStyle = document.createElement('style');
transitionStyle.textContent = `
  *, *::before, *::after {
    transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
  }
`;
document.head.appendChild(transitionStyle);

export const AppShell = memo(function AppShell({ children }: { children: ReactNode }) {
  const { currentScreen, navStack } = useAppState();
  const dispatch = useAppDispatch();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const isFullscreen = fullscreenScreens.includes(currentScreen) || isTicTacToe(currentScreen);
  const showBackAffordance = !isFullscreen && shouldShowBackAffordance(currentScreen, navStack);

  const showSwapCallout = !isFullscreen && currentScreen !== 'showroom';

  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <>
      <AppHeader />
      {showBackAffordance && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '10px 16px 0' }}>
          <BackButton />
        </div>
      )}
      {showSwapCallout && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'showroom' })}
          aria-label={t('common.swapCallout')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            margin: '10px 16px',
            padding: '10px 16px',
            borderRadius: '12px',
            border: `1px solid ${colors.accent}`,
            background: `linear-gradient(135deg, ${colors.accent}18 0%, ${colors.accentLight}22 100%)`,
            color: colors.accent,
            fontSize: '0.85rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'center',
            lineHeight: 1.4,
            width: 'calc(100% - 32px)',
            boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true">🏬</span>
          <span>{t('common.swapCallout')}</span>
          <span aria-hidden="true">→</span>
        </button>
      )}
      {children}
      <InstallPrompt />
    </>
  );
});
