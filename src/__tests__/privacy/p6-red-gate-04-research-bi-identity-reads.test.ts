import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P6 RED GATE 04 — Research / Business-Intelligence identity reads
 * (owner decision: R-11 STRONG REDUCE, NOT delete).
 *
 * Approved direction (2026-08-08):
 *  - Research/BI stays as a scientific/admin function, role-gated.
 *  - Remove identity joins (display_name) where not required for the function.
 *  - Remove FULL device fingerprint reads (timezone, screen_*, refresh_rate,
 *    memory_gb, cpu_cores, pointer_type, touch_support, pixel_ratio).
 *  - Replace SELECT * with explicit column lists.
 *  - Functional exceptions kept: single-column user_agent reads used ONLY for
 *    brand/model derivation (research session list + BI device intelligence);
 *    explicit display_name in the BI customer-profile view (staff function).
 *  - scientific:read role gate preserved (see P6 gate 07).
 *
 * INTENTIONALLY RED until P6 execution applies the minimization.
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

const FINGERPRINT_COLUMNS = [
  'timezone',
  'screen_width',
  'screen_height',
  'refresh_rate',
  'memory_gb',
  'cpu_cores',
  'pointer_type',
  'touch_support',
  'pixel_ratio',
];

describe('P6-11: research api-supabase drops identity / full-fingerprint reads', () => {
  it('no display_name read in api-supabase', () => {
    const api = codeOnly(read('core/research/api-supabase.ts'));
    expect(api).not.toContain('display_name');
  });

  it('no device fingerprint column read in api-supabase', () => {
    const api = codeOnly(read('core/research/api-supabase.ts'));
    for (const col of FINGERPRINT_COLUMNS) {
      expect(api, `fingerprint column ${col} still selected`).not.toMatch(new RegExp(col));
    }
  });

  it('no SELECT * on users/devices/sessions in api-supabase', () => {
    const api = codeOnly(read('core/research/api-supabase.ts'));
    expect(api).not.toMatch(/\.select\('\*'\)/);
  });
});

describe('P6-12: business-intelligence api drops identity / SELECT * reads', () => {
  it('no SELECT * on users/sessions/trade_requests in BI api', () => {
    const api = codeOnly(read('business-intelligence/api.ts'));
    expect(api).not.toMatch(/\.select\('\*'\)/);
  });

  it('getCommandCenter has no display_name identity join', () => {
    const api = codeOnly(read('business-intelligence/api.ts'));
    expect(api).not.toContain("'id, display_name, role'");
  });

  it('no full device fingerprint read in BI api (single-column user_agent parse kept)', () => {
    const api = codeOnly(read('business-intelligence/api.ts'));
    for (const col of FINGERPRINT_COLUMNS) {
      expect(api, `fingerprint column ${col} still selected`).not.toMatch(new RegExp(col));
    }
  });
});
