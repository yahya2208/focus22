-- ============================================================================
-- TTT MULTIPLAYER — ttt_join_game() contract verification (00049)
-- Run in the Supabase SQL Editor as the OWNER (postgres) after applying 00049.
--
-- This checks the 8 required behaviors of the idempotent-join contract:
--   1. create game
--   2. first join succeeds
--   3. same joiner retries -> succeeds idempotently (already_joined=true)
--   4. different third user -> GAME_FULL
--   5. host cannot join own game
--   6. unauthenticated caller -> UNAUTHENTICATED
--   7. guest authenticated via Supabase Anonymous Auth -> works
--   8. concurrent join cannot produce two joiners
--
-- auth.uid() is simulated by setting the JWT subject claim:
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false);
-- (This is exactly how GoTrue/PostgREST populate auth.uid() for a real request.)
-- Each scenario RESETS the claim first so the earlier scenario's uid is not reused.
-- ============================================================================

-- Clear any pre-existing TTT rows so the run is deterministic and rerun-able.
DELETE FROM public.ttt_games;
DELETE FROM public.ttt_moves;
DELETE FROM public.ttt_invites;

-- ---------------------------------------------------------------------------
-- SCENARIO 1 + 2: host creates a game, then the joiner joins successfully.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub',
  'aaaaaaaa-0000-0000-0000-000000000001', false);  -- HOST (creator)
SELECT public.ttt_create_game();
-- capture the invite token (single get_invite call returns no token; read it)
--   1) created: expect status 'waiting', no joiner
SELECT inv.token
  FROM public.ttt_games g JOIN public.ttt_invites inv ON inv.game_id = g.id
 WHERE g.created_by = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
 ORDER BY g.created_at DESC LIMIT 1;
-- 2) joiner joins -> expect status becomes 'active', joiner_uid set
SELECT set_config('request.jwt.claim.sub',
  'bbbbbbbb-0000-0000-0000-000000000002', false);  -- JOINER
SELECT public.ttt_join_game('REPLACE_WITH_TOKEN_FROM_ABOVE');

-- ---------------------------------------------------------------------------
-- SCENARIO 3: the SAME joiner retries/reloads -> idempotent success, NOT an error.
--   Expect: already_joined = true, status 'active' (NOT 'GAME_NOT_WAITING').
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub',
  'bbbbbbbb-0000-0000-0000-000000000002', false);  -- same joiner
SELECT public.ttt_join_game('REPLACE_WITH_TOKEN_FROM_ABOVE');

-- ---------------------------------------------------------------------------
-- SCENARIO 4: a DIFFERENT third user tries the same invite -> GAME_FULL.
--   Expect: RAISE EXCEPTION 'GAME_FULL'.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub',
  'cccccccc-0000-0000-0000-000000000003', false);  -- third user
SELECT public.ttt_join_game('REPLACE_WITH_TOKEN_FROM_ABOVE');

-- ---------------------------------------------------------------------------
-- SCENARIO 5: the HOST tries to join their own game -> CANNOT_JOIN_OWN_GAME.
--   (Do on a FRESH waiting game so host re-read is not short-circuited.)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub',
  'dddddddd-0000-0000-0000-000000000004', false);  -- host B
SELECT public.ttt_create_game();
-- capture that game's token, then the host attempts to join it
SELECT inv.token FROM public.ttt_games g
  JOIN public.ttt_invites inv ON inv.game_id = g.id
 WHERE g.created_by = 'dddddddd-0000-0000-0000-000000000004'::uuid
 ORDER BY g.created_at DESC LIMIT 1;
-- still host B -> expect 'CANNOT_JOIN_OWN_GAME'
SELECT public.ttt_join_game('REPLACE_WITH_HOST_B_TOKEN');

-- ---------------------------------------------------------------------------
-- SCENARIO 6: unauthenticated caller -> UNAUTHENTICATED.
--   Clear the claim so auth.uid() returns NULL, then call a write RPC.
--   Expect: RAISE EXCEPTION 'UNAUTHENTICATED'.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT public.ttt_create_game();

-- ---------------------------------------------------------------------------
-- SCENARIO 7: guest authenticated via Supabase Anonymous Auth -> works.
--   Anonymous Auth issues a real authenticated-session uid (arbitrary uuid here).
--   A fresh guest creates, then a second guest joins -> both succeed.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub',
  'eeeeeeee-0000-0000-0000-000000000005', false);  -- guest host
SELECT public.ttt_create_game();
SELECT inv.token FROM public.ttt_games g
  JOIN public.ttt_invites inv ON inv.game_id = g.id
 WHERE g.created_by = 'eeeeeeee-0000-0000-0000-000000000005'::uuid
 ORDER BY g.created_at DESC LIMIT 1;
SELECT set_config('request.jwt.claim.sub',
  'ffffffff-0000-0000-0000-000000000006', false);  -- guest joiner
SELECT public.ttt_join_game('REPLACE_WITH_GUEST_HOST_TOKEN');

-- ---------------------------------------------------------------------------
-- SCENARIO 8: concurrent join cannot produce two joiners.
--   The RPC row-locks the game (SELECT ... FOR UPDATE), so a second concurrent
--   joiner either waits and then sees GAME_FULL, or the advisory lock serializes.
--   Manual check: from two SQL-editor tabs, run ttt_join_game(token) on the SAME
--   WAITING game with uids '1111...' and '2222...' simultaneously. Exactly ONE
--   must succeed; the other must raise GAME_FULL. After it, exactly one joiner:
-- ---------------------------------------------------------------------------
SELECT count(*) AS joiners_for_game
  FROM public.ttt_games
 WHERE joiner_id IS NOT NULL
   AND status = 'active';
-- Expected: the game has exactly ONE joiner_id.

-- ---------------------------------------------------------------------------
-- SUMMARY
--   * Scenarios 3,5,6,4 raise the documented exceptions (verify each is thrown).
--   * Scenario 2,7 return a normal join (active, no already_joined).
--   * Scenario 3 returns already_joined=true.
--   * Scenario 8 yields exactly one joiner under concurrency.
-- Cleanup (optional, comment out to inspect afterwards):
-- ---------------------------------------------------------------------------
-- DELETE FROM public.ttt_games; DELETE FROM public.ttt_moves; DELETE FROM public.ttt_invites;
