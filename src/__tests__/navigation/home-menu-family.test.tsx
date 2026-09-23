import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { HomeMenu } from '../../components/navigation/HomeMenu';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

const authState = vi.hoisted(() => ({ status: 'guest' }));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: authState.status },
    service: {},
    researchRole: 'user',
  }),
}));

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function renderMenu() {
  return render(
    <AppProvider>
      <HomeMenu open onClose={() => {}} />
      <ScreenProbe />
    </AppProvider>,
  );
}

describe('HomeMenu — family entry (V1.8-D)', () => {
  beforeEach(() => {
    authState.status = 'guest';
    vi.clearAllMocks();
  });

  it('shows the family page CTA to authenticated members and navigates', () => {
    authState.status = 'authenticated';
    renderMenu();

    fireEvent.click(screen.getByText('pilot.familyHome'));
    expect(screen.getByTestId('screen').textContent).toBe('pilot-family-home');
  });

  it('hides the family CTA from guests and public users', () => {
    renderMenu();
    expect(screen.queryByText('pilot.familyHome')).toBeNull();
  });
});
