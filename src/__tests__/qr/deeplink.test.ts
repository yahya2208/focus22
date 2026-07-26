import { describe, it, expect } from 'vitest';
import { parseDeepLink, buildDeepLink, createLandingSession } from '../../core/qr/deeplink';

describe('Deep Link Parser', () => {
  it('should parse a valid URL', () => {
    const link = parseDeepLink('https://focus.app?campaign=test');
    expect(link.isValid).toBe(true);
    expect(link.baseUrl).toBe('https://focus.app');
    expect(link.campaign.campaign).toBe('test');
    expect(link.error).toBeNull();
  });

  it('should parse referral code', () => {
    const link = parseDeepLink('https://focus.app?ref=ABC12345');
    expect(link.referralCode).toBe('ABC12345');
  });

  it('should parse campaign and referral together', () => {
    const link = parseDeepLink('https://focus.app?campaign=school&ref=XYZ99');
    expect(link.campaign.campaign).toBe('school');
    expect(link.referralCode).toBe('XYZ99');
  });

  it('should handle invalid URL', () => {
    const link = parseDeepLink('not-a-url');
    expect(link.isValid).toBe(false);
    expect(link.error).toBe('Invalid URL format');
    expect(link.referralCode).toBeNull();
  });

  it('should extract path', () => {
    const link = parseDeepLink('https://focus.app/results?campaign=test');
    expect(link.path).toBe('/results');
  });

  it('should handle URL with no params', () => {
    const link = parseDeepLink('https://focus.app');
    expect(link.isValid).toBe(true);
    expect(link.campaign.campaign).toBeNull();
    expect(link.referralCode).toBeNull();
  });
});

describe('Deep Link Builder', () => {
  it('should build a basic deep link', () => {
    const url = buildDeepLink('https://focus.app');
    expect(url).toBe('https://focus.app/');
  });

  it('should build with campaign', () => {
    const url = buildDeepLink('https://focus.app', { campaign: 'school2026' });
    expect(url).toContain('campaign=school2026');
  });

  it('should build with all options', () => {
    const url = buildDeepLink('https://focus.app', {
      campaign: 'test',
      referrer: 'friend',
      source: 'poster',
      language: 'ar',
      location: 'riyadh',
    });
    expect(url).toContain('campaign=test');
    expect(url).toContain('referrer=friend');
    expect(url).toContain('source=poster');
    expect(url).toContain('language=ar');
    expect(url).toContain('location=riyadh');
  });
});

describe('Landing Session', () => {
  it('should create landing session from deep link', () => {
    const link = parseDeepLink('https://focus.app?campaign=school');
    const session = createLandingSession(link);
    expect(session.campaignDetected).toBe(true);
    expect(session.startedAt).toBeGreaterThan(0);
    expect(session.source).toBe('school');
  });

  it('should detect referral', () => {
    const link = parseDeepLink('https://focus.app?ref=ABC123');
    const session = createLandingSession(link);
    expect(session.referralDetected).toBe(true);
  });

  it('should handle no campaign as direct', () => {
    const link = parseDeepLink('https://focus.app');
    const session = createLandingSession(link);
    expect(session.campaignDetected).toBe(false);
    expect(session.referralDetected).toBe(false);
    expect(session.source).toBe('direct');
  });
});
