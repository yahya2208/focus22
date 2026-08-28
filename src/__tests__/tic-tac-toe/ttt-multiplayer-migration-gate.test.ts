import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH = path.join(ROOT, 'supabase/migrations/00049_ttt_multiplayer.sql');
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');

/**
 * TIC TAC TOE FRIEND PLAY — migration source gate (00049)
 * FILE-ONLY migration (owner applies in the Supabase SQL Editor). Following the
 * source-gate pattern of 00047/00048, assert the shipped SQL contains each
 * required server-authoritative / security guarantee.
 */
describe('00049 migration — server-authoritative friend-play guarantees', () => {
  it('creates the three tables', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.ttt_games');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.ttt_moves');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.ttt_invites');
  });

  it('enables RLS as defense-in-depth on all tables', () => {
    const matches = migrationSql.match(/ENABLE ROW LEVEL SECURITY;/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const table of ['ttt_games', 'ttt_moves', 'ttt_invites']) {
      expect(migrationSql).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY;`));
    }
  });

  it('revokes direct PUBLIC access to the tables', () => {
    expect(migrationSql).toContain('REVOKE ALL ON public.ttt_games   FROM PUBLIC');
    expect(migrationSql).toContain('REVOKE ALL ON public.ttt_moves   FROM PUBLIC');
    expect(migrationSql).toContain('REVOKE ALL ON public.ttt_invites FROM PUBLIC');
  });

  it('derives identity exclusively from auth.uid() (never client-supplied)', () => {
    const executable = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    // every write RPC opens with the auth gate
    expect(executable.match(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(executable).toContain("IF v_uid IS NULL THEN");
    expect(executable).toContain("RAISE EXCEPTION 'UNAUTHENTICATED'");
  });

  it('implements server-authoritative move + winner replay (4-in-a-row)', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.ttt_play_move');
    expect(migrationSql).toContain("IF v_board[p_position] IS NOT NULL AND v_board[p_position] <> '' THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'CELL_OCCUPIED'");
    expect(migrationSql).toContain('RAISE EXCEPTION \'NOT_YOUR_TURN\'');
    // 4-in-a-row geometry with four directions
    expect(migrationSql).toContain('v_dir_rows := ARRAY[0, 1, 1, 1];');
    expect(migrationSql).toContain('v_dir_cols := ARRAY[1, 0, 1, -1];');
    expect(migrationSql).toContain('IF v_cnt >= 4 THEN');
  });

  it('enforces turn ownership and participant-only reads', () => {
    expect(migrationSql).toContain("RAISE EXCEPTION 'NOT_A_PARTICIPANT'");
    expect(migrationSql).toContain('GAME_FULL');
    expect(migrationSql).toContain('GAME_NOT_WAITING');
  });

  it('grants execution only to anon + authenticated for every RPC', () => {
    const names = [
      'ttt_create_game', 'ttt_get_invite', 'ttt_join_game',
      'ttt_play_move', 'ttt_get_game', 'ttt_abandon_game', 'ttt_admin_stats',
    ];
    for (const n of names) {
      expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION public.${n}`);
      expect(migrationSql).toContain('TO anon, authenticated');
    }
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.' + names[0] + '() FROM PUBLIC');
  });

  it('gates admin aggregates behind a role check', () => {
    expect(migrationSql).toContain("v_role NOT IN ('admin', 'super_admin', 'researcher')");
    expect(migrationSql).toContain("RAISE EXCEPTION 'ADMIN_REQUIRED'");
  });

  it('implements the full status state machine', () => {
    expect(migrationSql).toContain("'waiting', 'active', 'completed', 'abandoned'");
  });

  it('uses SECURITY DEFINER + SET search_path on the write RPCs', () => {
    const writable = migrationSql.split('CREATE OR REPLACE FUNCTION').slice(1).join(' ');
    expect(writable).toMatch(/SECURITY\s+DEFINER/);
    expect(writable).toMatch(/SET\s+search_path\s*=\s*''/);
  });

  it('keeps 00047/00048 frozen (does not redefine the solo RPC)', () => {
    expect(migrationSql).not.toContain('record_tic_tac_toe_session');
  });
});
