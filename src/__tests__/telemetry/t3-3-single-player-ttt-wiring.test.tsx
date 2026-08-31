import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TicTacToeScreen } from '../../screens/tic-tac-toe/TicTacToeScreen';
import { TicTacToeIntroScreen } from '../../screens/tic-tac-toe/TicTacToeIntroScreen';

const h = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  navReplace: vi.fn(),
  navPush: vi.fn(),
  sendSession: vi.fn(),
  completeSession: vi.fn(),
  abandonSession: vi.fn(),
  startSession: vi.fn(() => 'sess-1'),
  state: {} as Record<string, unknown>,
}));

vi.mock('../../core/telemetry', () => ({ track: h.mockTrack }));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

vi.mock('../../store/navigation', () => ({
  useNavigate: () => ({ replace: h.navReplace, push: h.navPush }),
  useAppDispatch: () => vi.fn(),
}));

vi.mock('../../core/session/service', () => ({
  getGlobalSessionService: () => ({
    startSession: h.startSession,
    completeSession: h.completeSession,
    abandonSession: h.abandonSession,
  }),
}));

vi.mock('../../services/tic-tac-toe-sender', () => ({
  sendTicTacToeSession: h.sendSession,
}));

vi.mock('../../core/navigation/BackProvider', () => ({
  useBackOverlay: () => undefined,
  useBackGuard: () => undefined,
}));

vi.mock('../../core/ttt-multiplayer/visual', () => ({
  MarkGlyph: () => null,
  GridMotif: () => null,
}));

vi.mock('../../core/ttt-multiplayer/invite', () => ({
  copyText: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../core/base-path', () => ({
  buildAppUrl: () => 'app://focus',
}));

vi.mock('../../screens/tic-tac-toe/TicTacToeContext', () => ({
  useTicTacToeState: () => h.state,
}));

vi.mock('../../hooks/use-ttt-multiplayer', () => ({
  useTttMultiplayer: () => ({ createGame: vi.fn() }),
}));

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    board: [],
    phase: 'active',
    matchMoves: [],
    matchResult: 'pending',
    moveCount: 0,
    difficulty: 'medium',
    winningLine: null,
    humanMove: vi.fn(),
    aiMove: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function events(): Array<Record<string, unknown>> {
  return (h.mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]);
}
function eventsOf(name: string): Array<Record<string, unknown>> {
  return events().filter((e) => e.event === name);
}

const FORBIDDEN = ['phone', 'address', 'notes', 'message', 'token', 'code', 'email', 'name', 'text', 'description', 'title', 'board', 'moves', 'match', 'state'];

function assertNoPiiAndNoReplay() {
  for (const evt of events()) {
    const keys = Object.keys(evt.properties ?? {}).map((k) => k.toLowerCase());
    for (const k of keys) {
      expect(FORBIDDEN).not.toContain(k);
    }
    expect(evt.entityId ?? '').not.toContain('055');
  }
}

describe('T3.3 — Tic Tac Toe intro wiring', () => {
  beforeEach(() => {
    h.mockTrack.mockClear();
    h.navPush.mockClear();
  });

  it('fires game_intro_view once on mount with game=ttt', () => {
    render(<TicTacToeIntroScreen />);
    const evt = eventsOf('game_intro_view');
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({
      event: 'game_intro_view',
      entityType: 'game',
      properties: { game: 'ttt' },
    });
    expect(evt[0]).not.toHaveProperty('entityId');
    assertNoPiiAndNoReplay();
  });
});

describe('T3.3 — Tic Tac Toe single-player lifecycle wiring', () => {
  beforeEach(() => {
    h.mockTrack.mockClear();
    h.navReplace.mockClear();
    h.sendSession.mockClear();
    h.completeSession.mockClear();
    h.abandonSession.mockClear();
    h.startSession.mockClear();
    h.startSession.mockReturnValue('sess-1');
  });

  it('fires game_start (game,size=9) and game_complete (outcome) on a finished match', () => {
    h.state = makeState({ phase: 'session-complete', matchResult: 'win', moveCount: 12 });
    render(<TicTacToeScreen />);

    const start = eventsOf('game_start');
    expect(start).toHaveLength(1);
    expect(start[0]).toMatchObject({
      event: 'game_start',
      entityType: 'game',
      entityId: 'sess-1',
      properties: { game: 'ttt', size: 9 },
    });

    const complete = eventsOf('game_complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]).toMatchObject({
      event: 'game_complete',
      entityType: 'game',
      entityId: 'sess-1',
      properties: { game: 'ttt', outcome: 'win' },
    });

    // Both share the same session id as entityId (one continuous match).
    expect(complete[0]!.entityId).toBe(start[0]!.entityId);
    expect(h.sendSession).toHaveBeenCalledTimes(1);
    assertNoPiiAndNoReplay();
  });

  it('treats loss and draw as distinct outcomes', () => {
    h.state = makeState({ phase: 'session-complete', matchResult: 'loss', moveCount: 20 });
    const { unmount } = render(<TicTacToeScreen />);
    expect(eventsOf('game_complete')[0]!.properties).toMatchObject({ game: 'ttt', outcome: 'loss' });
    unmount();

    h.mockTrack.mockClear();
    h.state = makeState({ phase: 'session-complete', matchResult: 'draw', moveCount: 20 });
    render(<TicTacToeScreen />);
    expect(eventsOf('game_complete')[0]!.properties).toMatchObject({ game: 'ttt', outcome: 'draw' });
  });

  it('fires game_abandon (with turns) on quit-confirm and NOT game_exit', () => {
    h.state = makeState({ phase: 'active', moveCount: 5 });
    const { unmount } = render(<TicTacToeScreen />);
    h.mockTrack.mockClear();

    fireEvent.click(screen.getByText('ticTacToe.exit'));
    fireEvent.click(screen.getByText('ticTacToe.stopConfirmAction'));

    const abandon = eventsOf('game_abandon');
    expect(abandon).toHaveLength(1);
    expect(abandon[0]).toMatchObject({
      event: 'game_abandon',
      entityType: 'game',
      entityId: 'sess-1',
      properties: { game: 'ttt', turns: 5 },
    });
    expect(h.abandonSession).toHaveBeenCalledWith('sess-1', 'abandoned');
    expect(eventsOf('game_exit')).toHaveLength(0);

    unmount();
    expect(eventsOf('game_exit')).toHaveLength(0);
  });

  it('fires game_exit only when leaving a completed match (not on play-again, not on abandon)', () => {
    // Case A: completed then leaves via back/unmount => game_exit fires.
    h.state = makeState({ phase: 'session-complete', matchResult: 'draw', moveCount: 12 });
    const { unmount } = render(<TicTacToeScreen />);
    expect(eventsOf('game_complete')).toHaveLength(1);
    expect(eventsOf('game_exit')).toHaveLength(0);
    unmount();
    const exit = eventsOf('game_exit');
    expect(exit).toHaveLength(1);
    expect(exit[0]).toMatchObject({ event: 'game_exit', entityType: 'game', entityId: 'sess-1', properties: { game: 'ttt' } });
  });

  it('does NOT fire game_exit on play-again (new match continues)', () => {
    h.state = makeState({ phase: 'session-complete', matchResult: 'win', moveCount: 12 });
    const { unmount } = render(<TicTacToeScreen />);
    h.mockTrack.mockClear();
    fireEvent.click(screen.getByText('ticTacToe.playAgain'));
    expect(h.navReplace).toHaveBeenCalledWith('tic-tac-toe', expect.anything());
    unmount();
    expect(eventsOf('game_exit')).toHaveLength(0);
    expect(eventsOf('game_complete')).toHaveLength(0);
  });

  it('never emits board/moves or replay state on any event', () => {
    h.state = makeState({ phase: 'session-complete', matchResult: 'win', moveCount: 30 });
    render(<TicTacToeScreen />);
    for (const evt of events()) {
      const keys = Object.keys(evt.properties ?? {}).map((k) => k.toLowerCase());
      for (const k of keys) {
        expect(['game', 'size', 'outcome', 'turns']).toContain(k);
      }
    }
  });
});
