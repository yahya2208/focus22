import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock.rpc }),
}));

import { sendScientificSession } from '../../services/session-science-sender';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

/**
 * SESSION SCIENCE PERSISTENCE — sender contract tests
 * (owner-authorized carve-out 2026-08-25; Option C, completion-only).
 */
describe('session-science-sender — العقد المعتمد', () => {
  beforeEach(() => {
    rpcMock.rpc.mockReset();
    rpcMock.rpc.mockResolvedValue({ data: null, error: null });
  });

  const baseResults = {
    rawRts: [210, 205, 200, 195, 215, 190, 200],
    correctedRts: [200, 210, 190, 205, 215, 195, 200],
    totalRounds: 7,
    validRounds: 7,
    sessionStart: Date.parse('2026-08-25T10:00:00.000Z'),
    sessionEnd: Date.parse('2026-08-25T10:00:30.000Z'),
  };

  const payload = () => ({
    sessionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    gameMode: 'reaction-light',
    results: baseResults,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock helper return type
  function firstCall(): { fnName: string; args: Record<string, any> } {
    expect(rpcMock.rpc).toHaveBeenCalledTimes(1);
    const call = rpcMock.rpc.mock.calls[0]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock helper return type
    return { fnName: call[0] as string, args: call[1] as Record<string, any> };
  }

  it('يستدعي RPC المعتمد وحده بالاسم الصحيح ومرة واحدة لكل إكمال', () => {
    sendScientificSession(payload());
    const { fnName } = firstCall();
    expect(fnName).toBe('record_scientific_session');
  });

  it('يطبّق مفاتيح JSONB الحية حرفياً (5 قياسات + 8 علمية) مع device_fingerprint اختياري', () => {
    sendScientificSession(payload());
    const { args } = firstCall();

    expect(Object.keys(args).sort()).toEqual([
      'p_created_at',
      'p_finished_at',
      'p_measurements',
      'p_plugin_id',
      'p_scientific_results',
      'p_session_id',
    ]);

    expect(args.p_session_id).toBe(payload().sessionId);
    expect(args.p_plugin_id).toBe('reaction-light');
    expect(args.p_created_at).toBe('2026-08-25T10:00:00.000Z');
    expect(args.p_finished_at).toBe('2026-08-25T10:00:30.000Z');

    expect(Object.keys(args.p_measurements).sort()).toEqual([
      'corrected_rts',
      'outlier_count',
      'raw_rts',
      'total_rounds',
      'valid_rounds',
    ]);
    expect(args.p_measurements.raw_rts).toEqual(baseResults.rawRts);
    expect(args.p_measurements.corrected_rts).toEqual(baseResults.correctedRts);
    expect(args.p_measurements.total_rounds).toBe(7);
    expect(args.p_measurements.valid_rounds).toBe(7);
    expect(typeof args.p_measurements.outlier_count).toBe('number');
  });

  it('يشتق median/outlier/focus/grade من محركات اللعبة نفسها (قيم مثبتة)', () => {
    sendScientificSession(payload());
    const sci = firstCall().args.p_scientific_results;

    // corrected sorted: [190,195,200,200,205,210,215] -> median = 200
    expect(sci.median_corrected_ms).toBe(200);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(sci.consistency_rating);
    expect([30, 60, 80, 95]).toContain(sci.consistency_score);
    expect(sci.fatigue_index).toBeGreaterThanOrEqual(0);
    expect(sci.fatigue_index).toBeLessThanOrEqual(1);
    expect(sci.fatigue_score).toBe(Math.round((1 - sci.fatigue_index) * 100));
    expect(sci.focus_score).toBeGreaterThanOrEqual(0);
    expect(sci.focus_score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(sci.grade);

    const expectedMean =
      baseResults.correctedRts.reduce((a, b) => a + b, 0) / baseResults.correctedRts.length;
    expect(sci.mean_corrected_ms).toBeCloseTo(expectedMean, 6);
  });

  it('لا يرسل أي هوية حقيقية: لا user_id/campaign/placement/email/token في الحمولة', () => {
    sendScientificSession(payload());
    const serialized = JSON.stringify(firstCall().args);
    for (const banned of ['user_id', 'user_uid', 'campaign', 'placement', 'email', 'token']) {
      expect(serialized.includes(banned)).toBe(false);
    }
  });

  it('يرسل device_fingerprint داخل scientific_results عند وجود deviceFingerprint في الحمولة', () => {
    sendScientificSession({ ...payload(), deviceFingerprint: 'abc123def4' });
    const { args } = firstCall();
    expect(args.p_scientific_results.device_fingerprint).toBe('abc123def4');
    expect(args.p_device_id).toBeUndefined();
  });

  it('يرسل calibration_confidence داخل scientific_results عند توفره', () => {
    sendScientificSession({ ...payload(), calibrationConfidence: 0.85 });
    const { args } = firstCall();
    expect(args.p_scientific_results.calibration_confidence).toBe(0.85);
  });

  it('لا يرفق device_fingerprint أو calibration_confidence عند غيابهما', () => {
    sendScientificSession(payload());
    const { args } = firstCall();
    expect(args.p_device_id).toBeUndefined();
    expect(args.p_scientific_results.device_fingerprint).toBeUndefined();
    expect(args.p_scientific_results.calibration_confidence).toBeUndefined();
  });

  it('يتحقق من المدخلات: جلسة/وضع/نتائج ناقصة أو فارغة تُهمل بصمت', () => {
    rpcMock.rpc.mockClear();

    sendScientificSession({ ...payload(), sessionId: '' });
    sendScientificSession({ ...payload(), gameMode: '' });
    sendScientificSession({ ...payload(), results: null as unknown as typeof baseResults });
    sendScientificSession({ ...payload(), results: { ...baseResults, correctedRts: [] } });
    sendScientificSession(null as unknown as ReturnType<typeof payload>);

    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('never-throws: رفض/خطأ/رمي متزامن في طبقة العميل لا يصل إلى المستدعِ', async () => {
    rpcMock.rpc.mockRejectedValue(new Error('SESSION_ID_CONFLICT'));
    expect(() => sendScientificSession(payload())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    rpcMock.rpc.mockImplementation(() => {
      throw new Error('client init failure');
    });
    expect(() => sendScientificSession(payload())).not.toThrow();

    rpcMock.rpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });
    expect(() => sendScientificSession(payload())).not.toThrow();

    rpcMock.rpc.mockReturnValue(undefined as never);
    expect(() => sendScientificSession(payload())).not.toThrow();
  });

  it('fire-and-forget: يعيد void متزامناً حتى والوعد معلّق', () => {
    let release: (() => void) | undefined;
    rpcMock.rpc.mockReturnValue(
      new Promise(() => {
        release = () => {};
      }),
    );
    const ret = sendScientificSession(payload());
    expect(ret).toBeUndefined();
    release?.();
  });

  it('عزل ثابت: مصدر المرسل يحتوي RPC المعتمد وحده، بلا كتابة جدولية ولا seams ولا تتبع', () => {
    const src = read('services/session-science-sender.ts');

    const rpcNames = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(rpcNames).toEqual(['record_scientific_session']);

    expect(/\.from\(/.test(src)).toBe(false);
    expect(src.includes('.insert(')).toBe(false);
    expect(src.includes('.upsert(')).toBe(false);
    expect(src.includes('.update(')).toBe(false);
    expect(src.includes('.delete(')).toBe(false);

    // owner decision: no runtime enable/disable seams, no mutable module state
    expect(src.includes('setEnabled')).toBe(false);
    expect(src.includes('EnabledForTests')).toBe(false);
    expect(src.includes('let ')).toBe(false);

    for (const banned of [
      'getGlobalTelemetry',
      'analytics',
      'PersistenceProvider',
      'data-service',
      'core/telemetry',
      'signInAsGuest',
      'localStorage.setItem',
      'navigator.sendBeacon',
      'document.cookie',
      'geolocation',
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it('عزل البوابة: الملف مسموح به حصراً ضمن RPC_ALLOWLIST ومراقَب ضمن RUNTIME_PATH', () => {
    const gateSrc = read('__tests__/privacy/p3-stop-write-gate.test.ts');
    expect(gateSrc.includes("'services/session-science-sender.ts'")).toBe(true);
    expect(gateSrc.match(/const RPC_ALLOWLIST/g)).toHaveLength(1);
    expect((gateSrc.match(/'services\/session-science-sender\.ts'/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
