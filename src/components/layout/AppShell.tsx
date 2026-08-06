import { memo, type ReactNode } from 'react';
import { useAppState } from '../../store/navigation';
import { AppHeader } from './AppHeader';
import { BackButton } from '../navigation/BackButton';
import { InstallPrompt } from '../pwa/InstallPrompt';
import { shouldShowBackAffordance } from '../../core/navigation/back-matrix';
import type { ScreenName } from '../../store/navigation';

const fullscreenScreens: ScreenName[] = ['calibration', 'countdown', 'game'];

const transitionStyle = document.createElement('style');
transitionStyle.textContent = `
  *, *::before, *::after {
    transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
  }
`;
document.head.appendChild(transitionStyle);

export const AppShell = memo(function AppShell({ children }: { children: ReactNode }) {
  const { currentScreen, navStack } = useAppState();
  const isFullscreen = fullscreenScreens.includes(currentScreen);
  const showBackAffordance = !isFullscreen && shouldShowBackAffordance(currentScreen, navStack);

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
      {children}
      <InstallPrompt />
    </>
  );
});
