-- ============================================================================
-- TTT MULTIPLAYER — post-apply verification (00049)
-- Run in the Supabase SQL Editor (owner role) after applying 00049.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Tables exist
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ttt_games', 'ttt_moves', 'ttt_invites');

-- 2) RPCs exist
SELECT proname, proargs
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'ttt_create_game', 'ttt_get_invite', 'ttt_join_game',
    'ttt_play_move', 'ttt_get_game', 'ttt_abandon_game', 'ttt_admin_stats'
  );

-- 3) RLS enabled (defense-in-depth) on all three tables
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('ttt_games', 'ttt_moves', 'ttt_invites');

-- 4) Execution revoked from PUBLIC and granted to anon + authenticated
SELECT p.proname, r.grantee, r.privilege_type
FROM pg_proc p
JOIN information_schema.routine_privileges r
  ON r.routine_name = p.proname
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'ttt_%'
  AND r.privilege_type = 'EXECUTE'
ORDER BY p.proname, r.grantee;

-- 5) Sanity end-to-end (as an authenticated/anon role with auth.uid() set):
--    create -> join (different role) -> move -> winner
-- (Interactive smoke test is in src/__tests__/tic-tac-toe/ttt-multiplayer-rpc.test.ts)
