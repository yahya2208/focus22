import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 01 — PERSONAL-DATA LOCALSTORAGE MODULES: PRESERVE→DELETE
 * classification change (owner-approved 2026-08-08, FOCUS v2 execution).
 *
 * In P6 these modules were REASSESS/PRESERVE and stayed dormant (zero
 * production importers). The FOCUS v2 dead-code reachability audit
 * independently proved they have no production caller, so the owner
 * approved deleting them under P6 gate-01 WITH an explicit classification
 * change (PRESERVE → DELETE). This gate now asserts ABSENCE:
 *  - customer-memory.ts (persistent localStorage customer profile — PII)
 *  - device-ledger.ts   (persistent device identity records)
 *  - their dedicated tests
 *
 * Everything else remains untouched: the golden-audit read-only query
 * against device_ledger_v1 is a DB audit, not a production consumer, and
 * is preserved.
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

describe('P6-GATE-01 ABSENCE: customer-memory REMOVED (PRESERVE→DELETE 2026-08-08)', () => {
  it('src/services/customer-memory.ts does not exist', () => {
    expect(exists('services/customer-memory.ts')).toBe(false);
  });

  it('no production file references customer-memory (module gone, no callers)', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => /customer-memory|CustomerMemoryService/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files still referencing customer-memory: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P6-GATE-01 ABSENCE: device-ledger REMOVED (PRESERVE→DELETE 2026-08-08)', () => {
  it('src/services/device-ledger.ts does not exist', () => {
    expect(exists('services/device-ledger.ts')).toBe(false);
  });

  it('no production file references device-ledger (module gone, no callers)', () => {
    const offenders = walkProductionSrc()
      .map((f) => ({ rel: f.rel, content: codeOnly(f.content) }))
      .filter((f) => /device-ledger|DeviceLedger/.test(f.content))
      .map((f) => f.rel);
    expect(offenders, `files still referencing device-ledger: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P6-GATE-01 ABSENCE: associated tests removed; read-only audit preserved', () => {
  it('src/__tests__/device-ledger.test.ts does not exist', () => {
    expect(exists('__tests__/device-ledger.test.ts')).toBe(false);
  });

  it('golden-audit.ts still reads device_ledger_v1 (read-only audit intact)', () => {
    const audit = codeOnly(read('database/golden-audit.ts'));
    expect(audit).toContain('device_ledger_v1');
  });
});
