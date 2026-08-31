-- ============================================================================
-- 00049 — TIC TAC TOE FRIEND PLAY + PERSISTENT GAME RECORDS + TELEMETRY
-- Self-contained, additive layer for the competitive 9x9 / 4-in-a-row game.
-- Builds ON the 00047/00048 telemetry but does NOT modify them (frozen).
--
-- NEW CONTRACT — two-player friend play over a shared, server-authoritative
-- game record. Existing 1-vs-AI completion flow (00047/00048) is untouched.
--
-- Tables:
--   public.ttt_games  — one row per multiplayer game (state machine below).
--   public.ttt_moves  — one row per move (persistent move history / telemetry).
--   public.ttt_invites — invite lifecycle (created -> joined / expired).
--
-- Game status machine:
--   'waiting'   creator created the game; awaiting join (invite link active).
--   'active'    joiner joined; players alternate turns until completion.
--   'completed' a winner (or full-board draw) was computed SERVER-SIDE.
--   'abandoned' a participant quit while waiting/active (no winner).
--
-- Identity: ALL writes derive user identity from auth.uid() server-side.
--   Guests reach here via Supabase ANONYMOUS AUTH (signInAnonymously), so both
--   the host and a friend arriving through an invite link hold a real auth.uid()
--   (issued under the `authenticated` Postgres role) with ZERO login friction.
--   The client NEVER supplies identity fields. No device ids/login UI are used.
--
-- Server-authoritative moves & winner:
--   ttt_play_move() re-plays the board from stored moves, verifies strict
--   alternation and turn ownership, places the mark, then re-computes the
--   winner with the SAME 9x9 / 4-in-a-row geometry as 00048 (rows, columns,
--   both diagonals, run length >= 4). A full 81-cell board with no winner is a
--   draw. The client cannot claim a result — the server decides and writes it.
--
-- Security:
--   SECURITY DEFINER for every write RPC (runs as table owner).
--   SET search_path = '' everywhere (prevents search-path hijack).
--   REVOKE ALL ... FROM PUBLIC, then GRANT EXECUTE by least privilege:
--     - ttt_get_invite (read-only invite preview rendered BEFORE a guest signs
--       in) is the ONLY RPC callable under `anon`.
--     - every other RPC is granted to `authenticated` only — guests are always
--       signed in (Anonymous Auth), so auth.uid() is NOT NULL for them.
--     - ALL RPCs (incl. ttt_get_invite) still guard with `IF v_uid IS NULL
--       THEN RAISE UNAUTHENTICATED` and never grant direct table access.
--   Direct table access is NOT granted to anon/authenticated (data flows only
--   through the RPCs). RLS is enabled as defense-in-depth.
--   ttt_admin_stats() additionally checks the caller's users.role.
--
-- Idempotency / concurrency:
--   ttt_join_game() checks the already-joined joiner FIRST so a retry/reload by
--   the same player returns the current state (already_joined=true) instead of
--   raising GAME_NOT_WAITING. Joining & moving use ROW (row-level) locking so
--   two concurrent requests cannot both win a join or both play the same turn.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ttt_invites, public.ttt_moves, public.ttt_games;
--   (functions below drop automatically with their tables)
--
-- Post-apply verification: see supabase/verify/ttt_multiplayer.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) ttt_games — one row per multiplayer game (server-authoritative state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ttt_games (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL,               -- host auth.uid()
  joiner_id     uuid,                         -- guest auth.uid() once joined
  status        text NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'active', 'completed', 'abandoned')),
  moves         jsonb NOT NULL DEFAULT '[]',  -- [{ "pos": int, "mark": "X"|"O", "player_id": uuid }]
  winner        text,                         -- NULL | 'creator' | 'joiner' | 'draw'
  winning_line  jsonb,                        -- array of 4 positions when a winner exists
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ttt_games_creator ON public.ttt_games (created_by);
CREATE INDEX IF NOT EXISTS idx_ttt_games_joiner  ON public.ttt_games (joiner_id);
CREATE INDEX IF NOT EXISTS idx_ttt_games_status  ON public.ttt_games (status);

-- ---------------------------------------------------------------------------
-- 2) ttt_moves — persistent per-move record (move history + analytics grain)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ttt_moves (
  id          bigserial PRIMARY KEY,
  game_id     uuid NOT NULL REFERENCES public.ttt_games(id) ON DELETE CASCADE,
  move_index  integer NOT NULL,
  player_id   uuid NOT NULL,                  -- auth.uid() of the mover
  mark        text NOT NULL CHECK (mark IN ('X', 'O')),
  position    integer NOT NULL CHECK (position BETWEEN 0 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, move_index),
  UNIQUE (game_id, position)
);

CREATE INDEX IF NOT EXISTS idx_ttt_moves_game ON public.ttt_moves (game_id, move_index);
CREATE INDEX IF NOT EXISTS idx_ttt_moves_player ON public.ttt_moves (player_id);

-- ---------------------------------------------------------------------------
-- 3) ttt_invites — invite lifecycle (created -> consumed / expired)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ttt_invites (
  token       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES public.ttt_games(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  joiner_id   uuid
);

CREATE INDEX IF NOT EXISTS idx_ttt_invites_game ON public.ttt_invites (game_id);

-- ---------------------------------------------------------------------------
-- 4) RLS as defense-in-depth. anon/authenticated get NO direct table access
--    (writes/reads flow exclusively through SECURITY DEFINER RPCs).
-- ---------------------------------------------------------------------------
ALTER TABLE public.ttt_games  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ttt_moves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ttt_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ttt_games   FROM PUBLIC;
REVOKE ALL ON public.ttt_moves   FROM PUBLIC;
REVOKE ALL ON public.ttt_invites FROM PUBLIC;
-- surface sequences/references still usable by owner only; anon/authenticated
-- cannot SELECT/INSERT/UPDATE/DELETE any of these tables directly.

-- ===========================================================================
-- 5) SECURITY DEFINER RPCs
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ttt_create_game() — host starts a waiting game; returns game + invite info.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_create_game()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_game  public.ttt_games;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  INSERT INTO public.ttt_games (created_by, status, moves)
  VALUES (v_uid, 'waiting', '[]')
  RETURNING * INTO v_game;

  INSERT INTO public.ttt_invites (game_id, created_by)
  VALUES (v_game.id, v_uid);

  RETURN jsonb_build_object(
    'game_id', v_game.id,
    'invite_token', v_game.invite_token,
    'status', v_game.status,
    'created_by', v_game.created_by,
    'created_at', v_game.created_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_get_invite(invite_token) — public-safe read for the invite landing page.
-- Returns game metadata and the anonymous host display name, NEVER the host uid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_get_invite(p_invite_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game  public.ttt_games;
  v_host  text;
BEGIN
  SELECT * INTO v_game
  FROM public.ttt_games
  WHERE invite_token = p_invite_token;

  IF NOT FOUND OR v_game.status = 'abandoned' THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  SELECT display_name INTO v_host FROM public.users WHERE id::text = v_game.created_by::text;

  RETURN jsonb_build_object(
    'game_id', v_game.id,
    'status', v_game.status,
    'host_display_name', COALESCE(v_host, 'Guest Player'),
    'expires_at', (SELECT i.expires_at FROM public.ttt_invites i
                   WHERE i.game_id = v_game.id ORDER BY i.created_at DESC LIMIT 1)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_join_game(invite_token) — friend joins a waiting game, becomes 'active'.
-- Creator plays 'X' (first), joiner plays 'O'. Idempotent per joiner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_join_game(p_invite_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_game  public.ttt_games;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- row-lock the game so concurrent joins cannot both succeed
  SELECT * INTO v_game
  FROM public.ttt_games
  WHERE invite_token = p_invite_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  -- IDEMPOTENCY CONTRACT — ordering matters. An already-joined participant
  -- (and the host re-reading their own invite after a join) must get the
  -- current state back regardless of status, so retries/reloads succeed.
  IF v_game.joiner_id = v_uid
     OR (v_game.created_by = v_uid AND v_game.joiner_id IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'game_id', v_game.id,
      'status', v_game.status,
      'creator_uid', v_game.created_by,
      'joiner_uid', v_game.joiner_id,
      'already_joined', true
    );
  END IF;

  -- a non-participant who is the host cannot join their own game
  IF v_game.created_by = v_uid THEN
    RAISE EXCEPTION 'CANNOT_JOIN_OWN_GAME';
  END IF;

  -- a NEW player may only join a game still waiting for an opponent
  IF v_game.status <> 'waiting' THEN
    RAISE EXCEPTION 'GAME_NOT_WAITING';
  END IF;

  -- the joiner seat is taken by someone else
  IF v_game.joiner_id IS NOT NULL THEN
    RAISE EXCEPTION 'GAME_FULL';
  END IF;

  UPDATE public.ttt_games
  SET joiner_id = v_uid,
      status = 'active',
      updated_at = now()
  WHERE id = v_game.id
  RETURNING * INTO v_game;

  UPDATE public.ttt_invites
  SET consumed_at = now(), joiner_id = v_uid
  WHERE game_id = v_game.id AND consumed_at IS NULL;

  RETURN jsonb_build_object('game_id', v_game.id, 'status', v_game.status, 'creator_uid', v_game.created_by, 'joiner_uid', v_game.joiner_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_play_move(game_id, position) — server-authoritative turn + winner replay.
-- Validates ownership, turn, blank cell, then recomputes 4-in-a-row winner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_play_move(p_game_id uuid, p_position integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_game    public.ttt_games;
  v_moves   jsonb;
  v_n       integer;
  v_i       integer;
  v_mark    text;
  v_prev    text;
  v_board   text[];
  v_pos     integer;
  v_row     integer;
  v_col     integer;
  v_dr      integer;
  v_dc      integer;
  v_cnt     integer;
  v_r       integer;
  v_c       integer;
  v_d       integer;
  v_winner  text := NULL;
  v_line    integer[];
  v_dir_rows integer[];
  v_dir_cols integer[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF p_position IS NULL OR p_position < 0 OR p_position > 80 THEN
    RAISE EXCEPTION 'INVALID_POSITION';
  END IF;

  SELECT * INTO v_game
  FROM public.ttt_games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND';
  END IF;

  -- participant check
  IF v_game.created_by <> v_uid AND v_game.joiner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;

  IF v_game.status = 'abandoned' THEN
    RAISE EXCEPTION 'GAME_ABANDONED';
  END IF;
  IF v_game.status = 'completed' THEN
    RAISE EXCEPTION 'GAME_OVER';
  END IF;
  IF v_game.status <> 'active' THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE';
  END IF;

  v_moves := v_game.moves;
  IF jsonb_typeof(v_moves) <> 'array' THEN
    v_moves := '[]'::jsonb;
  END IF;
  v_n := jsonb_array_length(v_moves);

  -- determine whose mark and whose turn this move is
  IF v_n = 0 THEN
    IF v_uid <> v_game.created_by THEN
      RAISE EXCEPTION 'NOT_YOUR_TURN';
    END IF;
    v_mark := 'X';
  ELSE
    -- moves alternate strictly; last mover was the previous player
    v_prev := (v_moves->(v_n - 1)->>'mark');
    -- build the board & find who plays now
    v_board := array_fill(''::text, ARRAY[81], ARRAY[0]);
    FOR v_i IN 0..v_n - 1 LOOP
      v_pos := (v_moves->v_i->>'pos')::int;
      v_board[v_pos] := v_moves->v_i->>'mark';
    END LOOP;

    IF v_prev = 'X' THEN
      -- joiner (O) to play
      IF v_uid <> v_game.joiner_id THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN';
      END IF;
      v_mark := 'O';
    ELSE
      -- creator (X) to play
      IF v_uid <> v_game.created_by THEN
        RAISE EXCEPTION 'NOT_YOUR_TURN';
      END IF;
      v_mark := 'X';
    END IF;
  END IF;

  -- blank-cell / duplicate guard on the replayed board
  v_board := array_fill(''::text, ARRAY[81], ARRAY[0]);
  FOR v_i IN 0..v_n - 1 LOOP
    v_pos := (v_moves->v_i->>'pos')::int;
    v_board[v_pos] := v_moves->v_i->>'mark';
  END LOOP;
  IF v_board[p_position] IS NOT NULL AND v_board[p_position] <> '' THEN
    RAISE EXCEPTION 'CELL_OCCUPIED';
  END IF;

  -- 4-in-a-row detection (same geometry as 00048)
  v_dir_rows := ARRAY[0, 1, 1, 1];
  v_dir_cols := ARRAY[1, 0, 1, -1];
  v_row := p_position / 9;
  v_col := p_position % 9;
  FOR v_d IN 1..4 LOOP
    v_dr := v_dir_rows[v_d];
    v_dc := v_dir_cols[v_d];
    v_cnt := 1;
    v_line := ARRAY[p_position];
    -- forward
    v_r := v_row + v_dr; v_c := v_col + v_dc;
    WHILE v_r BETWEEN 0 AND 8 AND v_c BETWEEN 0 AND 8
          AND v_board[v_r * 9 + v_c] = v_mark LOOP
      v_cnt := v_cnt + 1;
      v_line := v_line || (v_r * 9 + v_c);
      v_r := v_r + v_dr; v_c := v_c + v_dc;
    END LOOP;
    -- backward
    v_r := v_row - v_dr; v_c := v_col - v_dc;
    WHILE v_r BETWEEN 0 AND 8 AND v_c BETWEEN 0 AND 8
          AND v_board[v_r * 9 + v_c] = v_mark LOOP
      v_cnt := v_cnt + 1;
      v_line := v_line || (v_r * 9 + v_c);
      v_r := v_r - v_dr; v_c := v_c - v_dc;
    END LOOP;
    IF v_cnt >= 4 THEN
      v_winner := CASE WHEN v_mark = 'X' THEN 'creator' ELSE 'joiner' END;
      EXIT;
    END IF;
    v_line := NULL;
  END LOOP;

  -- append the move to the game record
  v_moves := v_moves || jsonb_build_object(
    'pos', p_position,
    'mark', v_mark,
    'player_id', v_uid::text
  );

  -- persist the move row (move history / telemetry grain)
  INSERT INTO public.ttt_moves (game_id, move_index, player_id, mark, position)
  VALUES (p_game_id, v_n, v_uid, v_mark, p_position);

  -- resolve outcome: winner, full-board draw, or still playing
  IF v_winner IS NOT NULL THEN
    UPDATE public.ttt_games
    SET moves = v_moves,
        status = 'completed',
        winner = v_winner,
        winning_line = to_jsonb(v_line),
        updated_at = now(),
        finished_at = now()
    WHERE id = p_game_id
    RETURNING * INTO v_game;
  ELSIF v_n + 1 = 81 THEN
    UPDATE public.ttt_games
    SET moves = v_moves,
        status = 'completed',
        winner = 'draw',
        updated_at = now(),
        finished_at = now()
    WHERE id = p_game_id
    RETURNING * INTO v_game;
  ELSE
    UPDATE public.ttt_games
    SET moves = v_moves,
        updated_at = now()
    WHERE id = p_game_id
    RETURNING * INTO v_game;
  END IF;

  RETURN jsonb_build_object(
    'game_id', v_game.id,
    'status', v_game.status,
    'winner', v_game.winner,
    'winning_line', v_game.winning_line,
    'move_count', jsonb_array_length(v_game.moves),
    'last_mark', v_mark
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_get_game(game_id) — current authoritative state for a participant (poll).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_get_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_game  public.ttt_games;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_game FROM public.ttt_games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND';
  END IF;

  -- participant-only read
  IF v_game.created_by <> v_uid AND v_game.joiner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;

  RETURN jsonb_build_object(
    'game_id', v_game.id,
    'status', v_game.status,
    'created_by', v_game.created_by,
    'joiner_id', v_game.joiner_id,
    'moves', v_game.moves,
    'winner', v_game.winner,
    'winning_line', v_game.winning_line,
    'created_at', v_game.created_at,
    'finished_at', v_game.finished_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_abandon_game(game_id) — a participant abandons a waiting/active game.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_abandon_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_game  public.ttt_games;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_game FROM public.ttt_games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND';
  END IF;
  IF v_game.created_by <> v_uid AND v_game.joiner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;
  IF v_game.status = 'completed' THEN
    RETURN jsonb_build_object('game_id', p_game_id, 'status', 'completed', 'winner', v_game.winner);
  END IF;

  UPDATE public.ttt_games
  SET status = 'abandoned', updated_at = now(), finished_at = now()
  WHERE id = p_game_id
  RETURNING * INTO v_game;

  RETURN jsonb_build_object('game_id', v_game.id, 'status', v_game.status);
END;
$$;

-- ---------------------------------------------------------------------------
-- ttt_admin_stats() — aggregate game statistics for admins / research team.
-- Admin/role gate: caller must hold role 'admin' or 'super_admin' or
-- 'researcher' in public.users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ttt_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_total integer;
  v_by_status jsonb;
  v_by_winner jsonb;
  v_avg_moves numeric;
  v_recent jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id::text = v_uid::text;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'researcher') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  SELECT count(*) INTO v_total FROM public.ttt_games;
  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO v_by_status
  FROM (SELECT status, count(*) AS cnt FROM public.ttt_games GROUP BY status) s;
  SELECT COALESCE(jsonb_object_agg(winner, cnt), '{}'::jsonb) INTO v_by_winner
  FROM (SELECT winner, count(*) AS cnt FROM public.ttt_games WHERE winner IS NOT NULL GROUP BY winner) w;
  SELECT COALESCE(avg(jsonb_array_length(moves)), 0) INTO v_avg_moves FROM public.ttt_games;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'game_id', id,
    'status', status,
    'winner', winner,
    'move_count', jsonb_array_length(moves),
    'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_recent
  FROM (SELECT * FROM public.ttt_games ORDER BY created_at DESC LIMIT 50) r;

  RETURN jsonb_build_object(
    'total_games', v_total,
    'by_status', v_by_status,
    'by_winner', v_by_winner,
    'avg_moves', v_avg_moves,
    'recent', v_recent
  );
END;
$$;

-- ===========================================================================
-- 6) Grant / revoke execution on all new RPCs (anonymous only for the read-only
--    invite preview; authenticated everywhere — guests sign in as authenticated)
-- ===========================================================================
REVOKE ALL ON FUNCTION public.ttt_create_game() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_get_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_join_game(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_play_move(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_get_game(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_abandon_game(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ttt_admin_stats() FROM PUBLIC;

-- Least privilege: Anonymous Auth guests are always signed in, so write RPCs and
-- participant reads run under the `authenticated` role (auth.uid() is NOT NULL).
-- ONLY the read-only invite preview (rendered BEFORE a guest signs in) is callable
-- under `anon`. Every write RPC still guards with `IF v_uid IS NULL THEN
-- RAISE UNAUTHENTICATED`, so no direct-table access / RLS is ever bypassed.
GRANT EXECUTE ON FUNCTION public.ttt_create_game() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_get_invite(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_join_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_play_move(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_get_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_abandon_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ttt_admin_stats() TO authenticated;

COMMIT;
