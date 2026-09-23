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
const isTicTacToe = (s: ScreenName) => s === 'tic-tac-toe-intro' || s === 'tic-tac-toe' || s === 'tic-tac-toe-results' || s === 'ttt-multiplayer' || s === 'ttt-invite-landing';

/**
 * Phone-promo callout visibility. The vegetables family store stays focused
 * on produce (no promo); showroom never shows it (own surface); fullscreen
 * flows (games) suppress all chrome. Everything else is unchanged.
 */
export function shouldShowSwapCallout(
  currentScreen: ScreenName,
  routeParams: Record<string, string> | undefined,
  isFullscreen: boolean,
): boolean {
  if (isFullscreen) return false;
  if (currentScreen === 'showroom') return false;
  if (currentScreen === 'pilot-storefront' && routeParams?.category === 'produce') return false;
  return true;
}

const transitionStyle = document.createElement('style');
transitionStyle.textContent = `
  *, *::before, *::after {
    transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
  }
`;
document.head.appendChild(transitionStyle);

export const AppShell = memo(function AppShell({ children }: { children: ReactNode }) {
  const { currentScreen, navStack, routeParams } = useAppState();
  const dispatch = useAppDispatch();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const isFullscreen = fullscreenScreens.includes(currentScreen) || isTicTacToe(currentScreen);
  const showBackAffordance = !isFullscreen && shouldShowBackAffordance(currentScreen, navStack);

  // The vegetables family store stays focused on produce: no phone promo here.
  // Every other screen keeps the existing callout untouched.
  const showSwapCallout = shouldShowSwapCallout(currentScreen, routeParams, isFullscreen);

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
