import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock.rpc }),
}));

import {
  recordScan,
  recordFunnel,
  getActiveCampaignId,
  setQrMeasurementSenderEnabled,
  resetQrMeasurementForTests,
} from '../../services/qr-measurement';

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

const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('qr-measurement — nonce contract', () => {
  beforeEach(() => {
    resetQrMeasurementForTests();
    setQrMeasurementSenderEnabled(true);
  });

  afterEach(() => {
    rpcMock.rpc.mockReset();
    resetQrMeasurementForTests();
  });

  it('scan uses a cryptographically random 128-bit base64url nonce (22 chars)', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    const [, params] = rpcMock.rpc.mock.calls[0] as [string, { p_short_code: string; p_nonce: string }];
    expect(rpcMock.rpc).toHaveBeenCalledWith('record_campaign_qr_scan', {
      p_short_code: 'ABC123',
      p_nonce: expect.stringMatching(NONCE_PATTERN),
    });
    expect(params.p_nonce).toMatch(NONCE_PATTERN);
  });

  it('a new scan generates a NEW nonce (per-funnel, not reused across visits)', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    recordScan('ABC124');
    await flush();
    const first = rpcMock.rpc.mock.calls[0]![1] as { p_nonce: string };
    const second = rpcMock.rpc.mock.calls[1]![1] as { p_nonce: string };
    expect(first.p_nonce).not.toBe(second.p_nonce);
    expect(first.p_nonce).toMatch(NONCE_PATTERN);
    expect(second.p_nonce).toMatch(NONCE_PATTERN);
  });

  it('nonce stays in memory only — never persisted (no storage/cookie APIs anywhere in the module)', () => {
    const src = codeOnly(read('services/qr-measurement.ts'));
    for (const token of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'sendBeacon']) {
      expect(src, `forbidden persistence token: ${token}`).not.toContain(token);
    }
  });
});

describe('qr-measurement — recordScan', () => {
  beforeEach(() => {
    resetQrMeasurementForTests();
    setQrMeasurementSenderEnabled(true);
  });

  afterEach(() => {
    rpcMock.rpc.mockReset();
    resetQrMeasurementForTests();
  });

  it('successful scan sets the active campaign id', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    expect(getActiveCampaignId()).toBeNull();
    await flush();
    expect(getActiveCampaignId()).toBe('c1');
  });

  it('scan error does not set an active campaign and never throws', async () => {
    rpcMock.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } });
    expect(() => recordScan('ABC123')).not.toThrow();
    await flush();
    expect(getActiveCampaignId()).toBeNull();
  });

  it('scan network rejection never throws and never sets an active campaign', async () => {
    rpcMock.rpc.mockRejectedValue(new Error('network down'));
    expect(() => recordScan('ABC123')).not.toThrow();
    await flush();
    expect(getActiveCampaignId()).toBeNull();
  });

  it('disabled sender never calls the RPC', () => {
    setQrMeasurementSenderEnabled(false);
    recordScan('ABC123');
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });
});

describe('qr-measurement — recordFunnel', () => {
  beforeEach(() => {
    resetQrMeasurementForTests();
    setQrMeasurementSenderEnabled(true);
  });

  afterEach(() => {
    rpcMock.rpc.mockReset();
    resetQrMeasurementForTests();
  });

  it('game_start after a scan reuses the SAME nonce (funnel continuity)', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();

    recordFunnel('c1', 'game_start');
    await flush();
    const scanCall = rpcMock.rpc.mock.calls[0] as [string, { p_nonce: string }];
    expect(rpcMock.rpc).toHaveBeenCalledTimes(1);
    expect(scanCall[0]).toBe('record_campaign_funnel');
    expect(scanCall[1]).toMatchObject({ p_campaign_id: 'c1', p_event_type: 'game_start' });
    expect(scanCall[1].p_nonce).toMatch(NONCE_PATTERN);
  });

  it('funnel nonce equals the nonce used for the original scan', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    const scanNonce = (rpcMock.rpc.mock.calls[0]![1] as { p_nonce: string }).p_nonce;
    rpcMock.rpc.mockClear();

    recordFunnel('c1', 'game_complete');
    await flush();
    const funnelNonce = (rpcMock.rpc.mock.calls[0]![1] as { p_nonce: string }).p_nonce;
    expect(funnelNonce).toBe(scanNonce);
  });

  it('game_complete and registration are valid event types', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();

    recordFunnel('c1', 'game_complete');
    recordFunnel('c1', 'registration');
    await flush();
    expect(rpcMock.rpc).toHaveBeenCalledTimes(2);
    expect(rpcMock.rpc.mock.calls.map((c) => (c[1] as { p_event_type: string }).p_event_type)).toEqual([
      'game_complete',
      'registration',
    ]);
  });

  it('a mismatched campaign id is a no-op (no invented attribution)', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();

    recordFunnel('c2', 'game_start');
    await flush();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('an empty campaign id (non-QR home flow) is a no-op', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();

    recordFunnel('', 'game_start');
    await flush();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('an invalid event type is rejected and never sent', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();

    // @ts-expect-error — runtime guard test for a bogus event type
    recordFunnel('c1', 'bogus');
    await flush();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('funnel event without any preceding scan is a no-op', async () => {
    recordFunnel('c1', 'game_start');
    await flush();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('funnel waits for an in-flight scan and only sends for the matching campaign', async () => {
    let resolveScan: (v: unknown) => void = () => {};
    rpcMock.rpc.mockImplementationOnce(() => new Promise((res) => { resolveScan = res; }));
    recordScan('ABC123');

    recordFunnel('c1', 'game_start');
    resolveScan({ data: { ok: true, campaign_id: 'c1' }, error: null });
    await flush();

    expect(rpcMock.rpc).toHaveBeenCalledTimes(2);
    const funnelCall = rpcMock.rpc.mock.calls[1] as [string, { p_nonce: string; p_campaign_id: string; p_event_type: string }];
    expect(funnelCall[0]).toBe('record_campaign_funnel');
    expect(funnelCall[1]).toMatchObject({ p_campaign_id: 'c1', p_event_type: 'game_start' });
    expect(funnelCall[1].p_nonce).toMatch(NONCE_PATTERN);
  });

  it('funnel rejection never throws (fire-and-forget)', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockReset();
    rpcMock.rpc.mockRejectedValue(new Error('network down'));

    expect(() => recordFunnel('c1', 'registration')).not.toThrow();
    await flush();
  });

  it('disabled sender never records funnel events', async () => {
    rpcMock.rpc.mockResolvedValue({ data: { ok: true, campaign_id: 'c1' }, error: null });
    recordScan('ABC123');
    await flush();
    rpcMock.rpc.mockClear();
    setQrMeasurementSenderEnabled(false);

    recordFunnel('c1', 'game_start');
    await flush();
    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });
});

describe('qr-measurement — privacy surface (P7/P3 compliance)', () => {
  const FORBIDDEN = [
    'user_id', 'device_id', 'email', 'phone', 'ip', 'user_agent',
    'localStorage', 'sessionStorage', 'cookie', 'fingerprint',
    'analytics_events', 'qr_codes', 'scan_count', 'increment_qr_counter',
    'lookup_scan_context',
  ];

  it('the module never references any forbidden privacy/legacy-QR token', () => {
    const src = codeOnly(read('services/qr-measurement.ts'));
    for (const token of FORBIDDEN) {
      expect(src, `forbidden token: ${token}`).not.toContain(token);
    }
  });

  it('the module never performs a direct table write (.from insert/update/delete)', () => {
    const src = codeOnly(read('services/qr-measurement.ts'));
    expect(src).not.toMatch(/\.from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\b/);
    expect(src).not.toMatch(/\.from\s*\(/);
  });

  it('the module only calls the two sanctioned RPCs', () => {
    const src = codeOnly(read('services/qr-measurement.ts'));
    const calls = src.match(/\.rpc\(\s*'([^']+)'/g) ?? [];
    const names = calls.map((c) => c.match(/'([^']+)'/)?.[1]);
    expect([...new Set(names)].sort()).toEqual([
      'record_campaign_funnel',
      'record_campaign_qr_scan',
    ]);
  });

  it('no device/user identity is collected or forwarded', () => {
    const src = codeOnly(read('services/qr-measurement.ts'));
    for (const token of ['getCurrentPosition', 'getBattery', 'navigator.userAgent', 'getImageData', 'sendBeacon']) {
      expect(src).not.toContain(token);
    }
  });
});
