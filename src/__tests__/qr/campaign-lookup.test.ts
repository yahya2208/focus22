import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock.rpc }),
}));

import {
  extractCampaignShortCode,
  extractCampaignShortCodeFromQuery,
  extractCampaignShortCodeFromLocation,
  lookupCampaign,
} from '../../services/campaign-lookup';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function stubRpc(data: unknown, error: { code: string } | null): void {
  rpcMock.rpc.mockReturnValue({
    maybeSingle: async () => ({ data, error }),
  });
}

afterEach(() => {
  rpcMock.rpc.mockReset();
});

describe('extractCampaignShortCode — parser contract', () => {
  it('1: valid /c/ABC123', () => {
    expect(extractCampaignShortCode('/c/ABC123')).toBe('ABC123');
  });

  it('2: valid base path /focus22/c/ABC123', () => {
    expect(extractCampaignShortCode('/focus22/c/ABC123')).toBe('ABC123');
  });

  it('3: valid trailing slash /focus22/c/ABC123/', () => {
    expect(extractCampaignShortCode('/focus22/c/ABC123/')).toBe('ABC123');
  });

  it('4: invalid 5-character code', () => {
    expect(extractCampaignShortCode('/c/ABC12')).toBeNull();
  });

  it('5: invalid 7-character code', () => {
    expect(extractCampaignShortCode('/c/ABC1234')).toBeNull();
  });

  it('6: invalid special characters', () => {
    expect(extractCampaignShortCode('/c/ABC-12')).toBeNull();
  });

  it('7: missing code and wrong segment', () => {
    expect(extractCampaignShortCode('/c/')).toBeNull();
    expect(extractCampaignShortCode('/c')).toBeNull();
    expect(extractCampaignShortCode('/campaign/ABC123')).toBeNull();
  });

  it('query params do not act as a short-code substitute', () => {
    expect(extractCampaignShortCode('/focus22/?campaign=summer')).toBeNull();
    expect(extractCampaignShortCode('/focus22/?source=qr')).toBeNull();
    expect(extractCampaignShortCode('/focus22/?ref=x')).toBeNull();
  });
});

describe('extractCampaignShortCodeFromQuery / FromLocation — GitHub Pages encoded deep-link', () => {
  it('encodes /focus22/?/c/kq7Iej (pathname=/focus22/ + search=?/c/kq7Iej) → kq7Iej', () => {
    expect(extractCampaignShortCodeFromLocation('/focus22/', '?/c/kq7Iej')).toBe('kq7Iej');
  });

  it('raw encoded query ?/c/kq7Iej → kq7Iej', () => {
    expect(extractCampaignShortCodeFromQuery('?/c/kq7Iej')).toBe('kq7Iej');
  });

  it('natural pathname forms still extract', () => {
    expect(extractCampaignShortCodeFromLocation('/focus22/c/kq7Iej', '')).toBe('kq7Iej');
    expect(extractCampaignShortCodeFromLocation('/c/kq7Iej', '')).toBe('kq7Iej');
  });

  it('invalid lengths rejected in encoded form', () => {
    expect(extractCampaignShortCodeFromQuery('?/c/12345')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('?/c/1234567')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('?/c/')).toBeNull();
    expect(extractCampaignShortCodeFromLocation('/focus22/c/12345', '')).toBeNull();
    expect(extractCampaignShortCodeFromLocation('/focus22/c/1234567', '')).toBeNull();
  });

  it('attribution query params remain ignored', () => {
    expect(extractCampaignShortCodeFromQuery('?campaign=kq7Iej')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('?source=kq7Iej')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('?ref=kq7Iej')).toBeNull();
    expect(extractCampaignShortCodeFromLocation('/focus22/', '?campaign=kq7Iej')).toBeNull();
    expect(extractCampaignShortCodeFromLocation('/focus22/', '?source=kq7Iej')).toBeNull();
    expect(extractCampaignShortCodeFromLocation('/focus22/', '?ref=kq7Iej')).toBeNull();
  });

  it('non-QR encoded paths and foreign suffixes are not treated as QR', () => {
    expect(extractCampaignShortCodeFromQuery('?/repair/track')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('?/c/kq7Iej&x=1')).toBeNull();
    expect(extractCampaignShortCodeFromQuery('')).toBeNull();
  });
});

describe('lookupCampaign — RPC contract', () => {
  it('8: valid active campaign returns entry', async () => {
    stubRpc({ id: 'c1', short_code: 'ABC123', name: 'Test Campaign', is_active: true, challenge_id: null }, null);
    const result = await lookupCampaign('ABC123');
    expect(result).toEqual({ id: 'c1', shortCode: 'ABC123', name: 'Test Campaign', challengeId: null });
    expect(rpcMock.rpc).toHaveBeenCalledWith('lookup_campaign_by_short_code', { p_code: 'ABC123' });
  });

  it('9: no row returns null', async () => {
    stubRpc(null, null);
    expect(await lookupCampaign('ABC123')).toBeNull();
  });

  it('10: inactive campaign (no row due to is_active=true filter) returns null', async () => {
    stubRpc(null, null);
    expect(await lookupCampaign('ABC123')).toBeNull();
  });

  it('11: RPC error returns null', async () => {
    stubRpc(null, { code: 'PGRST116' });
    expect(await lookupCampaign('ABC123')).toBeNull();
  });

  it('12: malformed input returns null without calling RPC', async () => {
    expect(await lookupCampaign('AB')).toBeNull();
    expect(await lookupCampaign('ABC-12')).toBeNull();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('client/network failure returns null (no crash)', async () => {
    rpcMock.rpc.mockReturnValue({
      maybeSingle: async () => {
        throw new Error('network down');
      },
    });
    expect(await lookupCampaign('ABC123')).toBeNull();
  });

  it('campaign with linked challenge returns challengeId', async () => {
    stubRpc({ id: 'c2', short_code: 'DEF456', name: 'Challenge Campaign', is_active: true, challenge_id: 'uuid-ch-01' }, null);
    const result = await lookupCampaign('DEF456');
    expect(result).toEqual({ id: 'c2', shortCode: 'DEF456', name: 'Challenge Campaign', challengeId: 'uuid-ch-01' });
  });

  it('campaign without linked challenge returns null challengeId', async () => {
    stubRpc({ id: 'c3', short_code: 'GHI789', name: 'Regular Campaign', is_active: true, challenge_id: null }, null);
    const result = await lookupCampaign('GHI789');
    expect(result).toEqual({ id: 'c3', shortCode: 'GHI789', name: 'Regular Campaign', challengeId: null });
  });
});

describe('security regression — no forbidden surface introduced', () => {
  const app = codeOnly(read('App.tsx'));
  const moduleSrc = codeOnly(read('services/campaign-lookup.ts'));

  it('18: no direct campaigns read', () => {
    expect(app).not.toMatch(/\.from\(\s*['"]campaigns['"]\s*\)/);
    expect(moduleSrc).not.toMatch(/\.from\(\s*['"]campaigns['"]\s*\)/);
  });

  it('19: no qr_codes access', () => {
    expect(app).not.toMatch(/\.from\(\s*['"]qr_codes['"]\s*\)/);
    expect(moduleSrc).not.toMatch(/\.from\(\s*['"]qr_codes['"]\s*\)/);
  });

  it('20: no placements access', () => {
    expect(app).not.toMatch(/\.from\(\s*['"]placements['"]\s*\)/);
    expect(moduleSrc).not.toMatch(/\.from\(\s*['"]placements['"]\s*\)/);
  });

  it('21: no placement_history access', () => {
    expect(app).not.toMatch(/\.from\(\s*['"]placement_history['"]\s*\)/);
    expect(moduleSrc).not.toMatch(/\.from\(\s*['"]placement_history['"]\s*\)/);
  });

  it('22: no lookup_scan_context calls', () => {
    expect(app).not.toContain('lookup_scan_context');
    expect(moduleSrc).not.toContain('lookup_scan_context');
  });

  it('23: no analytics_events write', () => {
    expect(app).not.toMatch(/\.from\(\s*['"]analytics_events['"]\s*\)/);
    expect(moduleSrc).not.toMatch(/\.from\(\s*['"]analytics_events['"]\s*\)/);
  });

  it('24: no telemetry write', () => {
    expect(app).not.toMatch(/getGlobalTelemetry|telemetry\.track|\.track\s*\(/);
    expect(moduleSrc).not.toMatch(/getGlobalTelemetry|telemetry\.track|\.track\s*\(/);
  });

  it('25: no persistent QR identifier or fingerprinting surface', () => {
    expect(moduleSrc).not.toMatch(/localStorage|sessionStorage|document\.cookie|sendBeacon|getBattery|navigator\.userAgent|getImageData|WEBGL_debug_renderer_info/);
  });

  it('no old QR state machine reintroduced', () => {
    expect(app).not.toContain('START_QR_FLOW');
    expect(app).not.toMatch(/\bcampaignId\b/);
    expect(app).not.toMatch(/\bplacementId\b/);
    expect(app).not.toMatch(/\bqrId\b/);
    expect(app).not.toMatch(/core\/qr\//);
  });
});
