import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock.rpc }),
}));

import { sendTicTacToeSession } from '../../services/tic-tac-toe-sender';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

/**
 * TIC TAC TOE TELEMETRY — sender contract tests
 * (Gate 5: Telemetry / RPC / Migration, 2026-08-27).
 */
describe('tic-tac-toe-sender — العقد المعتمد', () => {
  beforeEach(() => {
    rpcMock.rpc.mockReset();
    rpcMock.rpc.mockResolvedValue({ data: null, error: null });
  });

  const singleMatch = () => ({
    matchIndex: 0,
    result: 'win' as const,
    moveCount: 8,
    moves: [
      { position: 36, player: 'human' as const, moveNumber: 0 },
      { position: 0, player: 'ai' as const, moveNumber: 1 },
      { position: 37, player: 'human' as const, moveNumber: 2 },
      { position: 8, player: 'ai' as const, moveNumber: 3 },
      { position: 38, player: 'human' as const, moveNumber: 4 },
      { position: 80, player: 'ai' as const, moveNumber: 5 },
      { position: 39, player: 'human' as const, moveNumber: 6 },
      { position: 72, player: 'ai' as const, moveNumber: 7 },
    ],
    startedAt: '2026-08-27T10:00:00.000Z',
    finishedAt: '2026-08-27T10:00:30.000Z',
  });

  const payload = () => ({
    sessionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    difficulty: 'medium' as const,
    matches: [singleMatch()],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock helper return type
  function firstCall(): { fnName: string; args: Record<string, any> } {
    expect(rpcMock.rpc).toHaveBeenCalledTimes(1);
    const call = rpcMock.rpc.mock.calls[0]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock helper return type
    return { fnName: call[0] as string, args: call[1] as Record<string, any> };
  }

  it('يستدعي RPC المعتمد وحده بالاسم الصحيح ومرة واحدة لكل جلسة', () => {
    sendTicTacToeSession(payload());
    const { fnName } = firstCall();
    expect(fnName).toBe('record_tic_tac_toe_session');
  });

  it('يطبّق مفاتيح JSONB الحية حرفياً (p_session_id + p_difficulty + p_matches)', () => {
    sendTicTacToeSession(payload());
    const { args } = firstCall();

    expect(Object.keys(args).sort()).toEqual([
      'p_difficulty',
      'p_matches',
      'p_session_id',
    ]);

    expect(args.p_session_id).toBe(payload().sessionId);
    expect(args.p_difficulty).toBe('medium');
    expect(Array.isArray(args.p_matches)).toBe(true);
    expect(args.p_matches).toHaveLength(1);
  });

  it('يرسل الحمولة الصحيحة لمباراة واحدة مع كل الحقول', () => {
    sendTicTacToeSession(payload());
    const { args } = firstCall();

    const match = args.p_matches[0];
    expect(match.match_index).toBe(0);
    expect(match.result).toBe('win');
    expect(match.move_count).toBe(8);
    expect(match.moves).toHaveLength(8);
    expect(match.started_at).toBe('2026-08-27T10:00:00.000Z');
    expect(match.finished_at).toBe('2026-08-27T10:00:30.000Z');

    // 9x9 legal positions (0..80); human completes a 4-in-a-row on row 4
    expect(match.moves[0]).toEqual({ position: 36, player: 'human', move_number: 0 });
    expect(match.moves[1]).toEqual({ position: 0, player: 'ai', move_number: 1 });
    expect(match.moves[4]).toEqual({ position: 38, player: 'human', move_number: 4 });
  });

  it('يرسل عدة مباريات في جلسة واحدة (-multi-match-، يبقى الخادم يقبل 1..5)', () => {
    const match2 = {
      ...singleMatch(),
      matchIndex: 1,
      result: 'loss' as const,
      moveCount: 5,
      moves: [
        { position: 36, player: 'human' as const, moveNumber: 0 },
        { position: 0, player: 'ai' as const, moveNumber: 1 },
        { position: 9, player: 'human' as const, moveNumber: 2 },
        { position: 1, player: 'ai' as const, moveNumber: 3 },
        { position: 2, player: 'ai' as const, moveNumber: 4 },
      ],
    };

    sendTicTacToeSession({ ...payload(), matches: [singleMatch(), match2] });
    const { args } = firstCall();

    expect(args.p_matches).toHaveLength(2);
    expect(args.p_matches[0].match_index).toBe(0);
    expect(args.p_matches[0].result).toBe('win');
    expect(args.p_matches[1].match_index).toBe(1);
    expect(args.p_matches[1].result).toBe('loss');
  });

  it('يتحقق من المدخلات: جلسة/صعوبة/مباريات ناقصة أو فارغة تُهمل بصمت', () => {
    rpcMock.rpc.mockClear();

    sendTicTacToeSession({ ...payload(), sessionId: '' });
    sendTicTacToeSession({ ...payload(), difficulty: '' as 'easy' });
    sendTicTacToeSession({ ...payload(), matches: [] });
    sendTicTacToeSession({ ...payload(), difficulty: 'invalid' as 'easy' });
    sendTicTacToeSession(null as unknown as ReturnType<typeof payload>);

    expect(rpcMock.rpc).not.toHaveBeenCalled();
  });

  it('يرسل أي معرّف جلسة — لا يتحقق من UUID في العميل (التحقق من الخادم فقط)', () => {
    sendTicTacToeSession({ ...payload(), sessionId: 'not-a-uuid' });
    expect(rpcMock.rpc).toHaveBeenCalledTimes(1);
    expect(firstCall().args.p_session_id).toBe('not-a-uuid');
  });

  it('never-throws: رفض/خطأ/رمي متزامن في طبقة العميل لا يصل إلى المستدعِ', async () => {
    rpcMock.rpc.mockRejectedValue(new Error('SESSION_ID_CONFLICT'));
    expect(() => sendTicTacToeSession(payload())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    rpcMock.rpc.mockImplementation(() => {
      throw new Error('client init failure');
    });
    expect(() => sendTicTacToeSession(payload())).not.toThrow();

    rpcMock.rpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });
    expect(() => sendTicTacToeSession(payload())).not.toThrow();

    rpcMock.rpc.mockReturnValue(undefined as never);
    expect(() => sendTicTacToeSession(payload())).not.toThrow();
  });

  it('fire-and-forget: يعيد void متزامناً حتى والوعد معلّق', () => {
    let release: (() => void) | undefined;
    rpcMock.rpc.mockReturnValue(
      new Promise(() => {
        release = () => {};
      }),
    );
    const ret = sendTicTacToeSession(payload());
    expect(ret).toBeUndefined();
    release?.();
  });

  it('لا يرسل أي هوية حقيقية: لا user_id/email/token في الحمولة', () => {
    sendTicTacToeSession(payload());
    const serialized = JSON.stringify(firstCall().args);
    for (const banned of ['user_id', 'user_uid', 'email', 'token', 'auth_token']) {
      expect(serialized.includes(banned)).toBe(false);
    }
  });

  it('عزل ثابت: مصدر المرسل يحتوي RPC المعتمد وحده، بلا كتابة جدولية ولا seams', () => {
    const src = read('services/tic-tac-toe-sender.ts');

    const rpcNames = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(rpcNames).toEqual(['record_tic_tac_toe_session']);

    expect(/\.from\(/.test(src)).toBe(false);
    expect(src.includes('.insert(')).toBe(false);
    expect(src.includes('.upsert(')).toBe(false);
    expect(src.includes('.update(')).toBe(false);
    expect(src.includes('.delete(')).toBe(false);

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
    expect(gateSrc.includes("'services/tic-tac-toe-sender.ts'")).toBe(true);
    expect(gateSrc.match(/const RPC_ALLOWLIST/g)).toHaveLength(1);
    expect((gateSrc.match(/'services\/tic-tac-toe-sender\.ts'/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
