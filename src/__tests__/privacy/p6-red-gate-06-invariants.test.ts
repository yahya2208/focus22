import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 06 — Invariants & DB-only surface guards.
 *
 * Hard invariants (already GREEN today — must never regress):
 *  P6-14  live-sessions.ts must have no production importer (DEAD module).
 *  P6-15  session-repository (Supabase session writes) must have no production
 *         importer (DORMANT — barrel core/index.ts has no production consumer).
 *  P6-16  no production reference to the DB-only contract tables
 *         system_settings / audit_log / job_assignments / contracts.
 *
 * Proposed P6 cleanups (PENDING-CONFIRMATION — NOT approved in the owner
 * decision of 2026-08-08; executed only if the owner approves them at plan
 * review; gates are dropped if rejected):
 *  P6-17  maybe-single-behavior.test.ts must stop mocking the removed RPC
 *         lookup_campaign_by_short_code.
 *  P6-18  research-console DEAD components removed: HeatmapChart, FunnelChart,
 *         ExportUtils (zero importers).
 *
 * INTENTIONALLY RED for P6-17/P6-18 (pending confirmation); P6-14/15/16 are
 * invariant guards and should already pass.
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

describe('P6-14: live-sessions has no production importer (invariant)', () => {
  it('no production file imports live-sessions', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => f.rel !== 'core/supabase/live-sessions.ts' && /live-sessions/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files importing live-sessions: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P6-15: Supabase session repository has no production importer (invariant)', () => {
  it('no production file imports session-repository', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => f.rel !== 'core/supabase/session-repository.ts' && f.rel !== 'core/index.ts' && /session-repository/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files importing session-repository: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P6-16: no production reference to DB-only contract tables (invariant)', () => {
  it('no production file references system_settings / audit_log / job_assignments / contracts tables', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => /\.from\('system_settings'\)|\.from\('audit_log'\)|\.from\('job_assignments'\)|\.from\('contracts'\)/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files referencing DB-only tables: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P6-17: test no longer mocks removed RPC', () => {
  it('maybe-single-behavior.test.ts does not reference lookup_campaign_by_short_code', () => {
    const test = codeOnly(read('__tests__/supabase/maybe-single-behavior.test.ts'));
    expect(test).not.toContain('lookup_campaign_by_short_code');
  });
});

describe('P6-18: DEAD research-console components removed', () => {
  it('HeatmapChart / FunnelChart / ExportUtils do not exist', () => {
    expect(exists('research-console/components/HeatmapChart.tsx')).toBe(false);
    expect(exists('research-console/components/FunnelChart.tsx')).toBe(false);
    expect(exists('research-console/components/ExportUtils.ts')).toBe(false);
  });
});
