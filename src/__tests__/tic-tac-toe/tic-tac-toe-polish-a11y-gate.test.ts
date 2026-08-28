import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

const screen = read('screens/tic-tac-toe/TicTacToeScreen.tsx');
const results = read('screens/tic-tac-toe/TicTacToeResultsScreen.tsx');
const intro = read('screens/tic-tac-toe/TicTacToeIntroScreen.tsx');

/**
 * GATE 7 — SOUND / POLISH / ACCESSIBILITY source gate.
 *
 * These are source-level guardrails only. They confirm the Tic Tac Toe feature
 * follows FOCUS accessibility + sound conventions without introducing device
 * APIs or weakening any privacy boundary.
 */

describe('G7-01: Sound effects are non-blocking and device-API-free', () => {
  it('uses only the Web Audio API (AudioContext) — no haptics/device APIs', () => {
    expect(screen).toContain('AudioContext');
    expect(screen).not.toMatch(/navigator\.vibrate/);
    expect(screen).not.toMatch(/getBattery/);
  });

  it('defines an inline move sound and a result sound', () => {
    expect(screen).toContain('function playMoveSound()');
    expect(screen).toContain('function playResultSound');
  });

  it('keeps all sound calls inside try/catch (non-blocking, silent on failure)', () => {
    const moveStart = screen.indexOf('function playMoveSound()');
    const resultStart = screen.indexOf('function playResultSound(');
    const moveBlock = screen.slice(moveStart, resultStart);
    const resultBlock = screen.slice(resultStart);
    expect(moveBlock).toContain('try');
    expect(moveBlock).toContain('catch');
    expect(resultBlock).toContain('try');
    expect(resultBlock).toContain('catch');
  });
});

describe('G7-02: Accessibility — live regions + dialog semantics', () => {
  it('game status and result are polite live regions', () => {
    expect(screen).toMatch(/role="status"/);
    expect(screen).toMatch(/aria-live="polite"/);
    expect(results).toMatch(/role="status"/);
    expect(results).toMatch(/aria-live="polite"/);
  });

  it('dialog uses aria-modal and aria-labelledby (not aria-label)', () => {
    expect(screen).toMatch(/aria-modal="true"/);
    expect(screen).toMatch(/aria-labelledby="ttt-stop-confirm-title"/);
    expect(screen).toMatch(/id="ttt-stop-confirm-title"/);
    expect(screen).not.toMatch(/role="dialog"[\s\S]*?aria-label=/);
  });

  it('board cells expose a descriptive aria-label', () => {
    expect(screen).toContain("aria-label={`Cell ${index + 1}");
  });
});

describe('G7-03: Difficulty selectors expose pressed/selected state', () => {
  it('intro and results difficulty buttons use aria-pressed', () => {
    expect(intro).toContain('aria-pressed={difficulty === d}');
    expect(results).toContain('aria-pressed={difficulty === d}');
  });
});

describe('G7-04: Motion polish respects prefers-reduced-motion', () => {
  it('defines reduced-motion gating for CSS animations', () => {
    expect(screen).toContain('@media (prefers-reduced-motion: reduce)');
    expect(screen).toMatch(/animation:\s*none!important/);
  });

  it('scoped to the Tic Tac Toe root, not global', () => {
    expect(screen).toContain('#ttt-root');
    expect(screen).toMatch(/\[id\^="ttt-"\]/);
  });
});

describe('G7-05: Boundaries — no engine/session/sender/privacy changes', () => {
  it('does not reference PersistenceProvider or device fingerprinting', () => {
    expect(screen).not.toContain('PersistenceProvider');
    expect(results).not.toContain('PersistenceProvider');
    expect(intro).not.toContain('PersistenceProvider');
    expect(screen).not.toMatch(/collectDeviceProfile/);
  });
});
