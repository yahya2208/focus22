import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P4 Game Personal-Data Minimization Acceptance Gates (RED Gates)
 *
 * This test suite asserts that the game runs local-only and does not persist
 * any user identity, device fingerprints, calibrations, or sessions.
 *
 * Under P4:
 * PG-03: no-device-fingerprint-stored
 * PG-32: no-game-persistent-identity
 * PG-33: no-game-session-stored
 * PG-34: game-local-only (no persistent local storage for calibration cache/profiles)
 */

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

function walkProductionSrc(): Array<{ rel: string; content: string }> {
  const out: Array<{ rel: string; content: string }> = [];
  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(p, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ rel: prefix ? `${prefix}/${entry.name}` : entry.name, content: fs.readFileSync(p, 'utf-8') });
      }
    }
  }
  walk(SRC, '');
  return out;
}

describe('PG-03: no-device-fingerprint-stored', () => {
  it('core/device/index.ts is ABSENT (device-fingerprint collector removed 2026-08-08)', () => {
    expect(fs.existsSync(path.join(SRC, 'core/device/index.ts'))).toBe(false);
  });

  it('no production file stores a device fingerprint (navigator.userAgent never persisted)', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /localStorage\.setItem|sticker_scans/.test(codeOnly(f.content)))
      .filter((f) => /userAgent|collectDeviceProfile/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files persisting device fingerprints: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('PG-32: no-game-persistent-identity', () => {
  it('core/supabase/PersistenceProvider.tsx is ABSENT (no persistence provider installed)', () => {
    expect(fs.existsSync(path.join(SRC, 'core/supabase/PersistenceProvider.tsx'))).toBe(false);
  });

  it('App.tsx does not install any persistence provider or write sessions/devices', () => {
    const app = codeOnly(read('App.tsx'));
    expect(app).not.toContain('PersistenceProvider');
    expect(app).not.toMatch(/from\(['"]devices['"]\)/);
    expect(app).not.toMatch(/\.insert\(/);
  });
});

describe('PG-33: no-game-session-stored', () => {
  it('core/supabase/data-service.ts is ABSENT (no Supabase session writer exists)', () => {
    expect(fs.existsSync(path.join(SRC, 'core/supabase/data-service.ts'))).toBe(false);
  });

  it('session service writes sessions to memory only — no .from("sessions") write anywhere', () => {
    const svc = codeOnly(read('core/session/service.ts'));
    expect(svc).not.toMatch(/\.from\(['"]sessions['"]\)/);
    expect(svc).not.toContain('/rest/v1/sessions');
    expect(svc).not.toContain('user_id');
  });
});

describe('PG-34: game-local-only (no persistent calibration storage)', () => {
  it('silent.ts does not write calibration profiles to localStorage', () => {
    const silent = codeOnly(read('core/calibration/silent.ts'));
    expect(silent).not.toContain("localStorage.setItem('focus_calibration_profile'");
    expect(silent).not.toContain('saveProfile');
  });

  it('calibration-cache index.ts does not write calibration cache to localStorage', () => {
    const cache = codeOnly(read('core/calibration-cache/index.ts'));
    expect(cache).not.toContain('focus_calibration_cache');
    expect(cache).not.toContain('localStorage.setItem');
  });
});
