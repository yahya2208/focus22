import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AD_PLACEMENTS } from '../../services/ads-service';

/**
 * BATCH 1 gate — showroom ad_placement allowlist.
 *
 * The frontend already records showroom view/click events
 * (ShowroomScreen → AdContactBanner → intent-tracking), but the server-side
 * allowlist must accept 'showroom' too. This gate keeps the base migration,
 * the Batch-1 fix scripts, and the frontend placement list in lockstep, and
 * enforces that the post-apply verification script stays strictly read-only.
 */

const ROOT = path.resolve(__dirname, '../../..');
const FIX_DIR = 'supabase/m2-campaign-intents/showroom-allowlist-fix';

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

/** Strip SQL comments (`-- line` and `/* block *\/`) so checks test real code. */
function sqlCodeOnly(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();
}

/** Find the first line matching `pattern` (allowlist lines are single-line). */
function firstMatchingLine(sql: string, pattern: RegExp): string {
  return sql.split('\n').find((line) => pattern.test(line)) ?? '';
}

const BASE_SQL = read('supabase/m2-campaign-intents/01-campaign-intents-apply.sql');
const FIX_APPLY = read(`${FIX_DIR}/01-apply.sql`);
const FIX_ROLLBACK = read(`${FIX_DIR}/02-rollback.sql`);
const FIX_VERIFY = read(`${FIX_DIR}/03-verify-readonly.sql`);
const FIX_LIVE = read(`${FIX_DIR}/04-live-fix.sql`);

describe('BATCH 1 — showroom allowlist is aligned everywhere', () => {
  it('frontend AD_PLACEMENTS includes the showroom placement', () => {
    expect(AD_PLACEMENTS).toContain('showroom');
  });

  it('base migration CHECK constraint and RPC allowlist accept showroom', () => {
    expect(firstMatchingLine(BASE_SQL, /ad_placement\s+TEXT\s+CHECK/)).toContain("'showroom'");
    expect(firstMatchingLine(BASE_SQL, /p_ad_placement NOT IN/)).toContain("'showroom'");
  });
});

describe('BATCH 1 — apply scripts (01 / 04) deliver the fix', () => {
  for (const [name, sql] of [
    ['01-apply.sql', FIX_APPLY],
    ['04-live-fix.sql', FIX_LIVE],
  ] as const) {
    it(`${name}: RPC allowlist and CHECK constraint accept showroom`, () => {
      expect(firstMatchingLine(sql, /p_ad_placement NOT IN/)).toContain("'showroom'");
      expect(firstMatchingLine(sql, /CHECK\s*\(\s*ad_placement IN/)).toContain("'showroom'");
    });

    it(`${name}: never creates tables (no M2 system rebuild)`, () => {
      expect(sqlCodeOnly(sql)).not.toMatch(/CREATE\s+TABLE/i);
    });

    it(`${name}: guards the required structure before any change`, () => {
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql).toMatch(/campaign_intents does not exist/);
    });
  }
});

describe('BATCH 1 — rollback (02) reverts exactly', () => {
  it('rollback allowlist and CHECK exclude showroom (original state)', () => {
    expect(firstMatchingLine(FIX_ROLLBACK, /p_ad_placement NOT IN/)).not.toContain("'showroom'");
    expect(firstMatchingLine(FIX_ROLLBACK, /CHECK\s*\(\s*ad_placement IN/)).not.toContain("'showroom'");
  });
});

describe('BATCH 1 — verification (03) stays READ-ONLY', () => {
  const code = sqlCodeOnly(FIX_VERIFY);

  it('contains no write statements and no transaction block', () => {
    expect(code).not.toMatch(/INSERT\s+INTO/i);
    expect(code).not.toMatch(/\bUPDATE\b/i);
    expect(code).not.toMatch(/\bDELETE\b/i);
    // transaction BEGIN is a standalone statement (`BEGIN;`); a bare plpgsql
    // `BEGIN` keyword (block start, no semicolon) is legitimate in a DO block.
    expect(code).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(code).not.toMatch(/START\s+TRANSACTION/i);
    expect(code).not.toMatch(/ROLLBACK/i);
  });

  it('never invokes the write RPC', () => {
    // A real call is `SELECT [public.]record_campaign_intent(` — a bare
    // `record_campaign_intent(...)` inside `'...'::regprocedure` is just a
    // signature reference, not an invocation.
    expect(code).not.toMatch(/\b(?:SELECT|PERFORM|CALL)\s+(?:public\.)?record_campaign_intent\s*\(/i);
  });

  it('verifies via catalogs/metadata only', () => {
    expect(code).toContain('pg_get_functiondef');
    expect(code).toContain('pg_get_constraintdef');
    expect(code).toContain('has_function_privilege');
  });
});

describe('BATCH 1 — acceptance (05) is explicitly NON-LIVE', () => {
  const acceptance = read(`${FIX_DIR}/05-acceptance-non-live.sql`);

  it('is a separate file from the read-only verification', () => {
    expect(acceptance).not.toBe(FIX_VERIFY);
  });

  it('is clearly marked NON-LIVE and rolls back its writes', () => {
    expect(acceptance).toMatch(/NON-LIVE/i);
    expect(acceptance).toMatch(/BEGIN/);
    expect(acceptance).toMatch(/ROLLBACK/);
  });
});
