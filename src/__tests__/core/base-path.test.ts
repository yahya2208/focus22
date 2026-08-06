import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBasePath, buildAppUrl, getAbsoluteBaseUrl } from '../../core/base-path';

describe('base-path (Phase 3A)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to "/" when BASE_URL is unset', () => {
    vi.stubEnv('BASE_URL', undefined);
    expect(getBasePath()).toBe('/');
  });

  it('normalizes an empty BASE_URL to "/"', () => {
    vi.stubEnv('BASE_URL', '');
    expect(getBasePath()).toBe('/');
  });

  it('returns the configured BASE_URL as-is', () => {
    vi.stubEnv('BASE_URL', '/focus22/');
    expect(getBasePath()).toBe('/focus22/');
  });

  it('builds a path under the base, tolerating leading slashes', () => {
    vi.stubEnv('BASE_URL', '/focus22/');
    expect(buildAppUrl('#/repair-tracking?code=R-1')).toBe('/focus22/#/repair-tracking?code=R-1');
    expect(buildAppUrl('?source=share')).toBe('/focus22/?source=share');
  });

  it('builds a path when the base has no trailing slash', () => {
    vi.stubEnv('BASE_URL', '/focus22');
    expect(buildAppUrl('#/repair-tracking?code=R-1')).toBe('/focus22/#/repair-tracking?code=R-1');
  });

  it('builds an absolute URL from origin + base', () => {
    vi.stubEnv('BASE_URL', '/focus22/');
    expect(getAbsoluteBaseUrl()).toBe(`${window.location.origin}/focus22/`);
  });
});
