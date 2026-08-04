import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { InstallPrompt } from '../../components/pwa/InstallPrompt';
import { TranslationProvider } from '../../hooks/useTranslation';
import { SettingsProvider } from '../../hooks/useSettings';

afterEach(() => {
  cleanup();
});

describe('InstallPrompt', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).onbeforeinstallprompt;
  });

  it('renders nothing when the browser does not support beforeinstallprompt', () => {
    render(
      <SettingsProvider>
        <TranslationProvider>
          <InstallPrompt />
        </TranslationProvider>
      </SettingsProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the install banner when beforeinstallprompt fires', async () => {
    (window as unknown as Record<string, unknown>).onbeforeinstallprompt = null;

    const { container } = render(
      <SettingsProvider>
        <TranslationProvider>
          <InstallPrompt />
        </TranslationProvider>
      </SettingsProvider>,
    );

    const event = new Event('beforeinstallprompt', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'prompt', { value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted', platform: 'chrome' }),
    });

    window.dispatchEvent(event);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Install FOCUS')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
