import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH = path.join(ROOT, 'supabase/migrations/00047_record_tic_tac_toe_session.sql');
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

const MIGRATION_9X9_PATH = path.join(
  ROOT,
  'supabase/migrations/00048_record_tic_tac_toe_session_9x9.sql',
);
const migration9x9Sql = fs.readFileSync(MIGRATION_9X9_PATH, 'utf-8');

/**
 * TIC TAC TOE TELEMETRY — migration source gate (Correction 1)
 * These are FILE-ONLY migrations (owner applies in Supabase SQL Editor), so the
 * server-side validation logic cannot be executed in CI. Following the same
 * source-gate pattern as sql-migration-gate.test.ts, we assert that the shipped
 * migration SQL contains each required server-authoritative guarantee.
 */
describe('00047 migration — server-authoritative guarantees (Correction 1)', () => {
  it('enforces authentication — rejects auth.uid() IS NULL (Gate 0 authenticated session)', () => {
    expect(migrationSql).toContain("IF v_uid IS NULL THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'UNAUTHENTICATED'");
  });

  it('REVOKEs PUBLIC execute and grants only anon + authenticated', () => {
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.record_tic_tac_toe_session');
    expect(migrationSql).toContain('FROM PUBLIC');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.record_tic_tac_toe_session');
    expect(migrationSql).toContain('TO anon, authenticated');
  });

  it('enforces ownership — rejects foreign sessions (sessions.user_id <> auth.uid())', () => {
    expect(migrationSql).toContain("SELECT * INTO v_existing FROM public.sessions WHERE id = p_session_id");
    expect(migrationSql).toContain("IF v_existing.user_id IS DISTINCT FROM v_uid THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'FOREIGN_SESSION'");
  });

  it('is the single completion writer — inserts the row with status=completed, never a running row', () => {
    const executable = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).toContain("INSERT INTO public.sessions");
    expect(executable).toContain("'completed'");
    expect(executable).toContain("'tic-tac-toe'");
    // no lifecycle reintroduction: the executable RPC must NOT write a 'running' row
    expect(executable).not.toMatch(/'running'/);
  });

  it('validates difficulty server-side', () => {
    expect(migrationSql).toContain("IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_DIFFICULTY'");
  });

  it('validates result values server-side', () => {
    expect(migrationSql).toContain("IF v_result NOT IN ('win', 'loss', 'draw') THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_MATCH_RESULT'");
  });

  it('enforces match_index contiguity (0..n-1, no gaps/duplicates)', () => {
    expect(migrationSql).toContain("IF v_match_idx IS NULL OR v_match_idx <> i THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_MATCH_ORDER'");
  });

  it('rejects a move after the game has concluded', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'MOVE_AFTER_GAME_OVER'");
  });

  it('rejects duplicate positions within a match', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'DUPLICATE_POSITION'");
  });

  it('rejects first-move-not-human and non-alternating moves', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'FIRST_MOVE_MUST_BE_HUMAN'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_ALTERNATION'");
  });

  it('performs REAL server-side replay — reconstructs the board from moves', () => {
    expect(migrationSql).toContain("v_board := array_fill(''::text, ARRAY[9], ARRAY[0])");
    expect(migrationSql).toContain("v_board[v_pos] := CASE WHEN v_player = 'human' THEN 'X' ELSE 'O' END");
    // three-in-a-row win detection on the reconstructed board
    expect(migrationSql).toMatch(/AND v_board\[0\] = v_board\[1\]/);
    expect(migrationSql).toMatch(/AND v_board\[2\] = v_board\[4\]/);
  });

  it('validates the claimed result against the replayed outcome (RESULT_MISMATCH)', () => {
    expect(migrationSql).toContain("IF v_actual <> v_result THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'RESULT_MISMATCH'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INCOMPLETE_MATCH'");
  });

  it('validates move_count consistency and move bounds', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'MOVE_COUNT_MISMATCH'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_MOVE_COUNT'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'INVALID_POSITION'");
  });

  it('exact-match idempotency — same payload no-op, different payload conflict', () => {
    expect(migrationSql).toContain("SELECT * INTO v_existing FROM public.sessions WHERE id = p_session_id");
    expect(migrationSql).toContain("AND v_existing.scientific_results IS NOT DISTINCT FROM");
    expect(migrationSql).toContain("RAISE EXCEPTION 'SESSION_ID_CONFLICT'");
    // the return (no-op) must come BEFORE the INSERT → no double row is written
    const returnIdx = migrationSql.indexOf('RETURN;');
    const insertIdx = migrationSql.indexOf('INSERT INTO public.sessions');
    expect(returnIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(returnIdx);
    // the exact-match path returns silently before reaching the conflict raise
    const conflictIdx = migrationSql.indexOf('SESSION_ID_CONFLICT', returnIdx);
    expect(conflictIdx).toBeGreaterThan(returnIdx);
  });
});

/**
 * Competitive Redesign (9x9 / 4-in-a-row) — migration 00048 source gate.
 * 00047 file stays frozen; 00048 supersedes the replay geometry while
 * preserving every security / session / ownership / idempotency invariant.
 */
describe('00048 migration — 9x9 competitive replay (redesign gate)', () => {
  it('preserves authentication — rejects auth.uid() IS NULL', () => {
    expect(migration9x9Sql).toContain("IF v_uid IS NULL THEN");
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'UNAUTHENTICATED'");
  });

  it('preserves REVOKE PUBLIC / GRANT anon + authenticated', () => {
    expect(migration9x9Sql).toContain('REVOKE ALL ON FUNCTION public.record_tic_tac_toe_session');
    expect(migration9x9Sql).toContain('FROM PUBLIC');
    expect(migration9x9Sql).toContain('GRANT EXECUTE ON FUNCTION public.record_tic_tac_toe_session');
    expect(migration9x9Sql).toContain('TO anon, authenticated');
  });

  it('preserves ownership — FOREIGN_SESSION on non-owner', () => {
    expect(migration9x9Sql).toContain('FOREIGN_SESSION');
    expect(migration9x9Sql).toContain('IF v_existing.user_id IS DISTINCT FROM v_uid THEN');
  });

  it('remains the single completion writer (status=completed, never running)', () => {
    const executable = migration9x9Sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).toContain("INSERT INTO public.sessions");
    expect(executable).toContain("'completed'");
    expect(executable).toContain("'tic-tac-toe'");
    expect(executable).not.toMatch(/'running'/);
  });

  it('replays on a 9x9 board — ARRAY[81], positions 0..80, move_count 1..81', () => {
    expect(migration9x9Sql).toContain("array_fill(''::text, ARRAY[81], ARRAY[0])");
    expect(migration9x9Sql).toContain("ARRAY_FILL(FALSE, ARRAY[81], ARRAY[0])");
    expect(migration9x9Sql).toContain("IF v_pos < 0 OR v_pos > 80 THEN");
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'INVALID_POSITION'");
    expect(migration9x9Sql).toContain("IF v_mn < 1 OR v_mn > 81 THEN");
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'INVALID_MOVE_COUNT'");
  });

  it('detects a 4-in-a-row win across rows, columns and both diagonals', () => {
    expect(migration9x9Sql).toContain("v_dir_rows := ARRAY[0, 1, 1, 1];");
    expect(migration9x9Sql).toContain("v_dir_cols := ARRAY[1, 0, 1, -1];");
    expect(migration9x9Sql).toContain("IF v_cnt >= 4 THEN");
    expect(migration9x9Sql).toContain("v_winner := CASE WHEN v_player = 'human' THEN 'win' ELSE 'loss' END;");
  });

  it('draw only when all 81 cells are full', () => {
    expect(migration9x9Sql).toContain("FOR k IN 0..80 LOOP");
    expect(migration9x9Sql).toContain("IF v_full THEN");
    expect(migration9x9Sql).toContain("v_actual := 'draw'");
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'INCOMPLETE_MATCH'");
  });

  it('keeps the REAL server-side replay + RESULT_MISMATCH + MOVE_AFTER_GAME_OVER', () => {
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'RESULT_MISMATCH'");
    expect(migration9x9Sql).toContain("MOVE_AFTER_GAME_OVER");
    expect(migration9x9Sql).toContain("DUPLICATE_POSITION");
    expect(migration9x9Sql).toContain("FIRST_MOVE_MUST_BE_HUMAN");
    expect(migration9x9Sql).toContain("INVALID_ALTERNATION");
  });

  it('preserves exact-match idempotency then single INSERT', () => {
    const returnIdx = migration9x9Sql.indexOf('RETURN;');
    const insertIdx = migration9x9Sql.indexOf('INSERT INTO public.sessions');
    expect(returnIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(returnIdx);
    expect(migration9x9Sql).toContain("RAISE EXCEPTION 'SESSION_ID_CONFLICT'");
    expect(migration9x9Sql).toContain("AND v_existing.scientific_results IS NOT DISTINCT FROM");
  });

  it('marks the schema with a bumped gameplay version (2.0, 9x9, four-in-a-row)', () => {
    expect(migration9x9Sql).toContain("'version', '2.0'");
    expect(migration9x9Sql).toContain("'board', '9x9'");
    expect(migration9x9Sql).toContain("'win', 'four-in-a-row'");
  });

  it('does not edit the frozen 00047 file (kept intact)', () => {
    expect(migrationSql).toContain("array_fill(''::text, ARRAY[9], ARRAY[0])");
    expect(migrationSql).toContain("ARRAY[9]");
  });
});
