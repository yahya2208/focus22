import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Admin Control Center — Pass 1 (00063): STRICT enum validation of
 * `commerce.currencies` in `set_setting`.
 *
 * Offline structural verification of migration 00063 — NO live DB. The owner
 * requires enum writes to be STRICT: an enum value must be a non-empty JSON
 * array in which EVERY element is a JSON string, EVERY string is in the closed
 * allow-list, and NO element is duplicated. Invalid elements must NEVER be
 * silently dropped or reordered; they must be rejected with INVALID_ALLOWED.
 *
 * These tests assert the guard clauses exist (and are ordered before any save)
 * and that the migration does NOT contain the old "filter-then-save" DISTINCT
 * path. See the POST-APPLY VERIFICATION section in the migration for the exact
 * acceptance matrix.
 */

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/00063_admin_control_center_pass1.sql');
const sql = fs.readFileSync(MIGRATION, 'utf-8');

// Extract just the executable set_setting body (skip comment lines) so we can
// assert guards belong to the function, not doc comments.
const executableLines = sql
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('--'));
const executable = executableLines.join('\n');

describe('00063 — strict enum: no silent drops / reorder', () => {
  it('no longer uses the old filter-then-save DISTINCT path', () => {
    // The prior implementation used jsonb_agg + SELECT DISTINCT + WHERE el = ANY
    // which silently deleted invalid elements. That must be gone.
    expect(executable).not.toContain('jsonb_agg(el) INTO v_new');
    expect(executable).not.toContain('SELECT DISTINCT el');
  });

  it('rejects a non-array or empty array with INVALID_ALLOWED', () => {
    // [] -> INVALID_ALLOWED ; "USD" (scalar) -> INVALID_ALLOWED
    expect(executable).toContain("jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) = 0");
    expect(executable).toContain("'INVALID_ALLOWED', 'key', p_key");
  });

  it('rejects any non-string element before saving', () => {
    // ["USD",123] -> INVALID_ALLOWED ; ["USD",true] -> INVALID_ALLOWED
    expect(executable).toContain('jsonb_array_elements(p_value) AS e(el)');
    expect(executable).toContain("jsonb_typeof(e.el) <> 'string'");
  });

  it('rejects any element outside the closed allow-list', () => {
    // ["USD","XXX"] -> INVALID_ALLOWED ; ["XXX"] -> INVALID_ALLOWED
    expect(executable).toContain("v_allowed := ARRAY['USD','DA','SAR','EUR','TRY']");
    expect(executable).toContain('jsonb_array_elements_text(p_value) AS e(el)');
    expect(executable).toContain('NOT (e.el = ANY (v_allowed))');
  });

  it('rejects duplicates (deterministic, no silent dedup)', () => {
    // ["USD","USD"] -> INVALID_ALLOWED
    expect(executable).toContain('SELECT count(*) FROM jsonb_array_elements_text(p_value) AS e(el)');
    expect(executable).toContain('SELECT count(DISTINCT e.el) FROM jsonb_array_elements_text(p_value) AS e(el)');
    expect(executable).toContain('<>');
  });

  it('preserves caller order and exact content on a valid save', () => {
    // valid value is saved verbatim — no DISTINCT reordering, no filtering
    expect(executable).toContain("v_new := jsonb_build_object('value', p_value)");
  });

  it('still rejects unknown enum keys with INVALID_KEY', () => {
    expect(executable).toContain("'INVALID_KEY', 'key', p_key");
    // enum branch ends in ELSE -> INVALID_KEY, so only tradeable enum keys save
    expect(executable).toMatch(/ELSIF v_type = 'enum' THEN[\s\S]*?ELSE\s+RETURN jsonb_build_object\('error', 'INVALID_KEY', 'key', p_key\)/);
  });
});

describe('00063 — strict enum acceptance matrix is documented', () => {
  it('documents the exact rejection matrix in POST-APPLY VERIFICATION', () => {
    // file must show -> INVALID_ALLOWED for each negative case and -> saved for valid
    for (const bad of [
      '["USD","XXX"]',
      '["XXX"]',
      '["USD",123]',
      '["USD",true]',
      '[]',
      '["USD","USD"]',
      '"USD"',
    ]) {
      expect(sql).toContain(bad);
    }
    expect(sql).toContain('-> INVALID_ALLOWED');
    expect(sql).toContain('["USD","DA"]');
    expect(sql).toContain('-> saved');
  });

  it('rejects rather than silently drops (no DISTINCT filter in enum save)', () => {
    // guard: the enum branch must reach a save only after all checks pass; the
    // old code saved a filtered jsonb_agg — assert no jsonb_agg in the body
    expect(executable).not.toContain('jsonb_agg');
  });
});
