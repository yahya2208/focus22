import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openWhatsApp, formatPhone, buildWhatsAppUrl } from '../../services/whatsapp-service';

describe('WhatsApp exit behaviour (P5: telemetry removed)', () => {
  it('openWhatsApp opens the built wa.me URL in a new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);

    openWhatsApp('0556254007', 'hello');

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/213556254007\?text=/),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });

  it('when the popup is blocked, openWhatsApp still attempts the wa.me open', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    openWhatsApp('0556254007', 'hello');

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/213556254007\?text=/),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });

  it('formats local and international phone numbers', () => {
    expect(formatPhone('0556254007')).toBe('213556254007');
    expect(formatPhone('+213556254007')).toBe('213556254007');
    expect(formatPhone('213556254007')).toBe('213556254007');
  });

  it('encodes the WhatsApp message into the URL', () => {
    const url = buildWhatsAppUrl('0556254007', 'السلام عليكم');
    expect(url).toContain('wa.me/213556254007?text=');
    expect(url).not.toContain(' ');
  });

  it('whatsapp-service ships no telemetry import (exit_attempt/exit_confirmed gone)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../services/whatsapp-service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/core\/telemetry/);
    expect(source).not.toMatch(/\.track\s*\(/);
    expect(source).not.toMatch(/exit_attempt|exit_confirmed/);
    expect(source).toContain('window.location.href = url');
  });
});
