import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

const screen = read('screens/tic-tac-toe/TttMultiplayerScreen.tsx');
const intro = read('screens/tic-tac-toe/TicTacToeIntroScreen.tsx');
const invite = read('core/ttt-multiplayer/invite.ts');

/**
 * LOBBY GATE — Friend-invite UX contract (pre-deploy UX pass).
 * Source-level guardrails proving the invite link is visible, copyable,
 * shareable-with-fallback, waiting state, and motion respects reduced motion.
 */
describe('Lobby UX: invite URL is visibly accessible', () => {
  it('renders the invite URL in a visible read-only input (not just clipboard)', () => {
    expect(screen).toContain('id="ttt-invite-url"');
    expect(screen).toContain('readOnly');
    expect(screen).toContain('buildTttInviteUrl');
    expect(screen).toContain('tttLobby.linkLabel');
  });

  it('exposes a manual re-copy affordance that works after the toast disappears', () => {
    expect(screen).toContain('copyText(url)');
    expect(screen).toContain('tttLobby.copyLink');
    // success + failure feedback states exist
    expect(screen).toContain('tttLobby.linkCopied');
    expect(screen).toContain('tttLobby.copyFailed');
  });

  it('uses native Web Share where supported with an explicit copy fallback', () => {
    expect(screen).toContain('nativeShare(');
    expect(invite).toContain('navigator.share');
    expect(screen).toContain('tttLobby.shareLink');
    // fallback branch when share is unavailable/cancelled
    expect(screen).toContain('const shared = await nativeShare(');
    expect(screen).toContain('tttLobby.linkShared');
  });

  it('has a clear waiting state and subtle motion gated by prefers-reduced-motion', () => {
    expect(screen).toContain('tttLobby.waitingTitle');
    expect(screen).toContain('@media (prefers-reduced-motion: reduce)');
    expect(screen).toMatch(/animation:\s*none!important/);
    expect(screen).toContain('#ttt-multi-root');
  });

  it('shows an explicit cancel/exit action in the lobby', () => {
    expect(screen).toContain('tttLobby.cancel');
    expect(screen).toContain('tttLobby.cancelBody');
  });

  it('keeps the server-authoritative RPC contract (sender mapping untouched by UI)', () => {
    expect(screen).not.toContain('.rpc(');
    expect(screen).not.toContain('ttt_play_move');
  });
});

describe('Intro UX: navigates to the lobby with the invite token (no silent toast-only path)', () => {
  it('passes the invite token as a route param so the lobby can show it', () => {
    expect(intro).toContain('invite: game.inviteToken');
    expect(intro).toContain("navigate.push('ttt-multiplayer'");
  });

  it('does not hide the invite behind an automatic silent clipboard copy', () => {
    expect(intro).not.toContain('copyText(');
    expect(intro).not.toContain('navigator.clipboard');
  });

  it('preserves aria-pressed difficulty semantics', () => {
    expect(intro).toContain('aria-pressed={difficulty === d}');
  });
});