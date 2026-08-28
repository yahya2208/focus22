import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildTttInviteUrl, parseInviteFromHash, copyText } from '../../core/ttt-multiplayer/invite';

describe('ttt-multiplayer/invite — URL + clipboard', () => {
  it('builds a deep-linkable invite URL with the token in the query', () => {
    const url = buildTttInviteUrl('tok-123', 'https://example.com/focus/');
    expect(url).toBe('https://example.com/focus/#/ttt-invite-landing?invite=tok-123');
  });

  it('normalizes a trailing slash on the base', () => {
    expect(buildTttInviteUrl('abc', 'https://x.com')).toBe('https://x.com/#/ttt-invite-landing?invite=abc');
    expect(buildTttInviteUrl('abc', 'https://x.com/')).toBe('https://x.com/#/ttt-invite-landing?invite=abc');
  });

  it('percent-encodes special characters in the token', () => {
    const url = buildTttInviteUrl('abc 123&x=y', 'https://x.com');
    expect(url).toContain('invite=abc%20123%26x%3Dy');
  });

  it('parses a valid invite hash back to its token', () => {
    expect(parseInviteFromHash('#/ttt-invite-landing?invite=tok-123')).toBe('tok-123');
  });

  it('parses tokens containing encoded characters', () => {
    expect(parseInviteFromHash('#/ttt-invite-landing?invite=abc%20123')).toBe('abc 123');
  });

  it('returns null for non-invite or malformed hashes', () => {
    expect(parseInviteFromHash('/ttt-invite-landing?invite=x')).toBeNull();
    expect(parseInviteFromHash('#/other-screen?invite=x')).toBeNull();
    expect(parseInviteFromHash('#/ttt-invite-landing')).toBeNull();
    expect(parseInviteFromHash('#/ttt-invite-landing?other=1')).toBeNull();
    expect(parseInviteFromHash('')).toBeNull();
  });

  it('copyText uses the async clipboard API and returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig });
  });

  it('copyText returns false when clipboard throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const orig = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    expect(await copyText('hello')).toBe(false);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
