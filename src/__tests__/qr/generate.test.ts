import { describe, it, expect } from 'vitest';
import { generateQRSvg, generateQRDataUrl, generateQR, buildQrUrl, buildFocusQrUrl } from '../../core/qr/generate';

describe('QR Generator', () => {
  it('should generate SVG string', async () => {
    const svg = await generateQRSvg('https://focus.app');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('should generate SVG with custom options', async () => {
    const svg = await generateQRSvg('https://focus.app', {
      width: 512,
      margin: 4,
      color: { dark: '#6366f1', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    expect(svg).toContain('<svg');
  });

  it('should generate data URL', async () => {
    const dataUrl = await generateQRDataUrl('https://focus.app');
    expect(dataUrl).toContain('data:image/png;base64,');
  });

  it('should generate both SVG and data URL', async () => {
    const result = await generateQR('https://focus.app');
    expect(result.svg).toContain('<svg');
    expect(result.dataUrl).toContain('data:image/png;base64,');
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it('should generate with custom width', async () => {
    const result = await generateQR('https://focus.app', { width: 128 });
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });

  it('should handle empty data by throwing', async () => {
    await expect(generateQRSvg('')).rejects.toThrow('No input text');
  });

  it('should handle long data', async () => {
    const longData = 'https://focus.app?campaign=test'.repeat(10);
    const svg = await generateQRSvg(longData);
    expect(svg).toContain('<svg');
  });

  it('should handle Arabic text in data', async () => {
    const svg = await generateQRSvg('https://focus.app?text=اختبار');
    expect(svg).toContain('<svg');
  });
});

describe('QR URL Builder', () => {
  it('should build URL with params', () => {
    const url = buildQrUrl('https://focus.app', { campaign: 'test' });
    expect(url).toContain('campaign=test');
  });

  it('should build URL with multiple params', () => {
    const url = buildQrUrl('https://focus.app', {
      campaign: 'school2026',
      source: 'poster',
      language: 'ar',
    });
    expect(url).toContain('campaign=school2026');
    expect(url).toContain('source=poster');
    expect(url).toContain('language=ar');
  });

  it('should skip empty values', () => {
    const url = buildQrUrl('https://focus.app', { campaign: 'test', source: '' });
    expect(url).toContain('campaign=test');
    expect(url).not.toContain('source=');
  });

  it('should build focus QR URL', () => {
    const url = buildFocusQrUrl('https://focus.app', 'school2026');
    expect(url).toContain('campaign=school2026');
  });

  it('should build focus QR URL with extras', () => {
    const url = buildFocusQrUrl('https://focus.app', 'conference', {
      location: 'riyadh',
      event: 'tech-summit',
    });
    expect(url).toContain('campaign=conference');
    expect(url).toContain('location=riyadh');
    expect(url).toContain('event=tech-summit');
  });
});
