import { describe, it, expect } from 'vitest';
import { buildShareUrl, createShareHandler, SHARE_PLATFORMS } from '../../core/qr/share';

describe('Share URL Builder', () => {
  const payload = { url: 'https://focus.app', title: 'FOCUS Test' };

  it('should build WhatsApp share URL', () => {
    const url = buildShareUrl('whatsapp', payload);
    expect(url).toContain('wa.me');
    expect(url).toContain('text=');
  });

  it('should build Telegram share URL', () => {
    const url = buildShareUrl('telegram', payload);
    expect(url).toContain('t.me/share/url');
    expect(url).toContain('url=');
  });

  it('should build X share URL', () => {
    const url = buildShareUrl('x', payload);
    expect(url).toContain('twitter.com/intent/tweet');
  });

  it('should build Facebook share URL', () => {
    const url = buildShareUrl('facebook', payload);
    expect(url).toContain('facebook.com/sharer');
  });

  it('should build email share URL', () => {
    const url = buildShareUrl('email', payload);
    expect(url).toContain('mailto:');
    expect(url).toContain('subject=');
  });

  it('should return direct URL for copy', () => {
    const url = buildShareUrl('copy', payload);
    expect(url).toBe('https://focus.app');
  });

  it('should use default title from config', () => {
    const url = buildShareUrl('whatsapp', { url: 'https://focus.app' });
    expect(url).toContain('text=');
  });
});

describe('Share Handler', () => {
  it('should return available platforms', () => {
    const handler = createShareHandler();
    const platforms = handler.getAvailablePlatforms();
    expect(platforms).toContain('whatsapp');
    expect(platforms).toContain('telegram');
    expect(platforms).toContain('x');
    expect(platforms).toContain('facebook');
    expect(platforms).toContain('email');
    expect(platforms).toContain('copy');
  });

  it('should get share URL without opening', () => {
    const handler = createShareHandler();
    const url = handler.getShareUrl('whatsapp', { url: 'https://focus.app' });
    expect(url).toContain('wa.me');
  });

  it('should share to copy platform', () => {
    const handler = createShareHandler();
    const result = handler.share('copy', { url: 'https://focus.app' });
    expect(result.success).toBe(true);
    expect(result.platform).toBe('copy');
  });
});

describe('Share Platforms Config', () => {
  it('should have 6 platforms', () => {
    expect(SHARE_PLATFORMS).toHaveLength(6);
  });

  it('should have required fields', () => {
    for (const p of SHARE_PLATFORMS) {
      expect(p.platform).toBeDefined();
      expect(p.label).toBeDefined();
      expect(p.icon).toBeDefined();
    }
  });
});
