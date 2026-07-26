import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CoachScreen } from '../../screens/coach/CoachScreen';

afterEach(() => {
  cleanup();
});

describe('CoachScreen', () => {
  it('should show empty state with no sessions', () => {
    render(
      <AppProvider>
        <TranslationProvider>
          <CoachScreen />
        </TranslationProvider>
      </AppProvider>,
    );
    expect(screen.getByRole('heading', { name: 'AI Coach' })).toBeTruthy();
    expect(screen.getByText(/Complete at least one session/)).toBeTruthy();
  });

  it('should have accessible nav', () => {
    render(
      <AppProvider>
        <TranslationProvider>
          <CoachScreen />
        </TranslationProvider>
      </AppProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'AI Coach' })).toBeTruthy();
  });

  it('should have back button', () => {
    render(
      <AppProvider>
        <TranslationProvider>
          <CoachScreen />
        </TranslationProvider>
      </AppProvider>,
    );
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeTruthy();
  });

  it('should render empty state text', () => {
    const { container } = render(
      <AppProvider>
        <TranslationProvider>
          <CoachScreen />
        </TranslationProvider>
      </AppProvider>,
    );
    expect(container.textContent).toContain('AI Coach');
    expect(container.textContent).toContain('Complete at least one session');
  });
});
