import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ThemeProvider } from '../../design-system/use-theme';
import { RepairQR } from '../../components/repair/RepairQR';

const toDataURL = vi.hoisted(() => vi.fn());

vi.mock('qrcode', () => ({
  default: { toDataURL: toDataURL },
}));

describe('RepairQR (Phase 3A) — base-aware in-app deep link', () => {
  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,x');
    vi.stubEnv('BASE_URL', '/focus22/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('encodes an in-app hash deep link (not a raw origin path)', async () => {
    render(
      <ThemeProvider>
        <TranslationProvider>
          <RepairQR repairCode="R-123" />
        </TranslationProvider>
      </ThemeProvider>,
    );

    await vi.waitFor(() => {
      expect(toDataURL).toHaveBeenCalledTimes(1);
    });

    const url = toDataURL.mock.calls[0]![0];
    expect(url).toBe('/focus22/#/repair-tracking?code=R-123');
    expect(url).not.toContain('window.location');
  });

  it('falls back to the base when BASE_URL is "/"', async () => {
    vi.stubEnv('BASE_URL', '/');
    render(
      <ThemeProvider>
        <TranslationProvider>
          <RepairQR repairCode="R-9" />
        </TranslationProvider>
      </ThemeProvider>,
    );

    await vi.waitFor(() => {
      expect(toDataURL).toHaveBeenCalledTimes(1);
    });

    expect(toDataURL.mock.calls[0]![0]).toBe('/#/repair-tracking?code=R-9');
  });
});
