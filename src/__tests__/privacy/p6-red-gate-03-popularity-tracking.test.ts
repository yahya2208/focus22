import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 03 — Popularity persistence strip (owner decision: R-10 REDUCE).
 *
 * Approved direction (2026-08-08):
 *  - Keep the functional PhonePopularity ranking API used by catalog search.
 *  - Remove ALL localStorage persistence (popularity_events AND
 *    popularity_scores) — no persistent behavioral data.
 *  - Remove recordEvent (zero callers) and resetScores (storage-only).
 *  - catalog-service.searchCatalog keeps its popularityScore contract via the
 *    now-pure in-memory getScore (deterministic neutral ranking).
 *  - Do NOT convert popularity into analytics/telemetry.
 *
 * INTENTIONALLY RED until P6 execution strips persistence. The sub-assertion
 * that catalog-service still imports PhonePopularity is already GREEN and must
 * not regress.
 */

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
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

describe('P6-10a: popularity-engine keeps NO persistence', () => {
  it('src/services/popularity-engine.ts still exists (functional API preserved)', () => {
    expect(exists('services/popularity-engine.ts')).toBe(true);
  });

  it('popularity-engine has no localStorage access at all', () => {
    const engine = codeOnly(read('services/popularity-engine.ts'));
    expect(engine).not.toContain('localStorage');
  });

  it('popularity-engine has no persistent keys (popularity_events / popularity_scores)', () => {
    const engine = codeOnly(read('services/popularity-engine.ts'));
    expect(engine).not.toContain('popularity_events');
    expect(engine).not.toContain('popularity_scores');
  });

  it('popularity-engine has no recordEvent and no resetScores (storage-only API)', () => {
    const engine = codeOnly(read('services/popularity-engine.ts'));
    expect(engine).not.toContain('recordEvent');
    expect(engine).not.toContain('resetScores');
  });
});

describe('P6-10b: catalog ranking contract preserved (pure, non-persisting)', () => {
  it('catalog-service still imports and uses PhonePopularity.getScore', () => {
    const svc = codeOnly(read('services/catalog-service.ts'));
    expect(svc).toContain("from './popularity-engine'");
    expect(svc).toContain('PhonePopularity');
  });
});

describe('P6-10c: no production file calls recordEvent (no event writers)', () => {
  it('no production file references PhonePopularity.recordEvent', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => f.rel !== 'services/popularity-engine.ts' && /PhonePopularity\.recordEvent|\.recordEvent\(/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files calling recordEvent: ${offenders.join(', ')}`).toEqual([]);
  });
});
