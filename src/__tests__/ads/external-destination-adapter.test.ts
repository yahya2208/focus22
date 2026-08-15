import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExternalDestinationAdapter,
  isSafeExternalUrl,
  openExternalUrl,
} from '../../services/ad-adapters/external';

function makeDeps(url: string) {
  const openInNewTab = vi.fn();
  return { url, openInNewTab };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExternalDestinationAdapter (Phase 2 Step 4)', () => {
  it('accepts a valid absolute http URL', () => {
    const deps = makeDeps('http://shop.example/offer');
    const adapter = createExternalDestinationAdapter(deps);
    expect(adapter.type).toBe('external');
    expect(adapter.isValid).toBe(true);
    expect(adapter.url).toBe('http://shop.example/offer');
    expect(adapter.canOpenDetails()).toBe(true);
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('accepts a valid absolute https URL', () => {
    const deps = makeDeps('https://shop.example/offer');
    const adapter = createExternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(true);
    expect(adapter.url).toBe('https://shop.example/offer');
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    const deps = makeDeps('javascript:alert(1)');
    const adapter = createExternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    expect(adapter.url).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    const adapter = createExternalDestinationAdapter(makeDeps('data:text/html,<script>alert(1)</script>'));
    expect(adapter.isValid).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    const adapter = createExternalDestinationAdapter(makeDeps('file:///etc/passwd'));
    expect(adapter.isValid).toBe(false);
  });

  it('rejects malformed and relative URLs', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('/relative/path')).toBe(false);
    expect(isSafeExternalUrl('www.example.com')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('   ')).toBe(false);
  });

  it('rejects unsupported schemes', () => {
    expect(isSafeExternalUrl('ftp://example.com/file')).toBe(false);
    expect(isSafeExternalUrl('tel:+21355555')).toBe(false);
    expect(isSafeExternalUrl('mailto:test@example.com')).toBe(false);
  });

  it('never-dead-target: invalid destinations are non-interactive and never open', () => {
    const deps = makeDeps('javascript:alert(1)');
    const adapter = createExternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.openInNewTab).not.toHaveBeenCalled();
  });

  it('valid destination action opens the URL exactly once per operation', () => {
    const deps = makeDeps('https://shop.example/offer');
    const adapter = createExternalDestinationAdapter(deps);
    adapter.callToAction();
    expect(deps.openInNewTab).toHaveBeenCalledTimes(1);
    expect(deps.openInNewTab).toHaveBeenCalledWith('https://shop.example/offer');
    adapter.openDetails();
    expect(deps.openInNewTab).toHaveBeenCalledTimes(2);
    expect(deps.openInNewTab).toHaveBeenLastCalledWith('https://shop.example/offer');
  });

  it('trims surrounding whitespace before validating/opening', () => {
    const deps = makeDeps('  https://shop.example/offer  ');
    const adapter = createExternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(true);
    expect(adapter.url).toBe('https://shop.example/offer');
    adapter.callToAction();
    expect(deps.openInNewTab).toHaveBeenCalledWith('https://shop.example/offer');
  });

  it('creates no side effects at creation time (render-safe resolve)', () => {
    const deps = makeDeps('https://shop.example/offer');
    createExternalDestinationAdapter(deps);
    expect(deps.openInNewTab).not.toHaveBeenCalled();
  });
});

describe('openExternalUrl (safe new-tab opener)', () => {
  it('opens a valid URL in a new tab with noopener+noreferrer', () => {
    const spy = vi.spyOn(window, 'open');
    openExternalUrl('https://shop.example/offer');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('https://shop.example/offer', '_blank', 'noopener,noreferrer');
  });

  it('refuses unsafe URLs (defense in depth, never reaches window.open)', () => {
    const spy = vi.spyOn(window, 'open');
    openExternalUrl('javascript:alert(1)');
    openExternalUrl('data:text/html,<script>alert(1)</script>');
    openExternalUrl('file:///etc/passwd');
    openExternalUrl('/relative/path');
    expect(spy).not.toHaveBeenCalled();
  });
});
