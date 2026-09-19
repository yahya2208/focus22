-- ============================================================================
-- 00093 — pilot_get_my_invitation (Gate 1B fix — client invitation proof)
--
-- READ-ONLY, caller-scoped reverse lookup: returns the CURRENT authenticated
-- user's own LIVE pilot invitation row(s), if any. Single read direction of
-- the INVITE IDENTITY INVARIANT:
--     pilot_invitations.user_id (bound by EF/service_role) == auth.uid()
--
-- Client (InviteSetupScreen) uses this to PROVE identity before it may set a
-- password — a stale/foreign session (the Gate-1B root cause: updateUser ran
-- under 327d246d instead of the invitee) resolves this to zero rows and the
-- UI fails closed, never calling updateUser.
--
-- Security posture (mirrors 00088 conventions):
--   * SECURITY DEFINER  — RLS is bypassed so the caller can see ONLY their
--     own proof; the `user_id = auth.uid()` predicate is the sole filter and
--     makes cross-user reads impossible.
--   * SET search_path = '' — every reference fully qualified.
--   * TEXT-ONLY (SELECT), VOLATILE, NO DML of any kind.
--   * REVOKE from PUBLIC / anon / service_role; EXECUTE to authenticated only.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.pilot_get_my_invitation()
RETURNS SETOF public.pilot_invitations
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, invite_email, user_id, store_id, member_kind, channel,
         status, sent_count, first_sent_at, last_sent_at, pending_at,
         accepted_at, password_set_at, completed_at, created_at, updated_at
    FROM public.pilot_invitations
   WHERE user_id = auth.uid()
     AND status IN ('PENDING', 'SENT', 'ACCEPTED')
     AND password_set_at IS NULL
   ORDER BY created_at ASC
$$;

-- ---- EXECUTE boundaries: authenticated ONLY --------------------------------
REVOKE ALL ON FUNCTION public.pilot_get_my_invitation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_get_my_invitation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_get_my_invitation() FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_get_my_invitation() TO authenticated;

-- ---- Post-apply guard --------------------------------------------------------
DO $guard$
DECLARE
  v_def  text;
  v_bool bool;
  v_cnt  int;
BEGIN
  IF to_regprocedure('public.pilot_get_my_invitation()') IS NULL THEN
    RAISE EXCEPTION '00093: function missing';
  END IF;

  SELECT proconfig = ARRAY['search_path=""']
    INTO v_bool
    FROM pg_proc
   WHERE oid = 'public.pilot_get_my_invitation()'::regprocedure;
  IF NOT v_bool THEN
    RAISE EXCEPTION '00093: search_path drift';
  END IF;

  SELECT pg_get_functiondef('public.pilot_get_my_invitation()'::regprocedure)
    INTO v_def;
  IF v_def IS NULL
     OR v_def NOT LIKE '%SECURITY DEFINER%'
     OR v_def NOT LIKE '%pilot_invitations%'
  THEN
    RAISE EXCEPTION '00093: definition drifted';
  END IF;

  IF position('auth.uid()' in v_def) = 0 THEN
    RAISE EXCEPTION '00093: not keyed on auth.uid()';
  END IF;
  IF position('PENDING' in v_def) = 0
     OR position('SENT' in v_def) = 0
     OR position('ACCEPTED' in v_def) = 0
     OR position('password_set_at is null' in lower(v_def)) = 0
  THEN
    RAISE EXCEPTION '00093: live-invitation filters missing';
  END IF;
  IF v_def ~* '\m(insert|update|delete|truncate)\M' THEN
    RAISE EXCEPTION '00093: forbidden DML in body';
  END IF;

  -- EXECUTE boundaries.
  SELECT has_function_privilege('authenticated',
           'public.pilot_get_my_invitation()', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00093: authenticated EXECUTE missing'; END IF;
  SELECT has_function_privilege('anon',
           'public.pilot_get_my_invitation()', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00093: anon EXECUTE open'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_get_my_invitation()', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00093: service_role EXECUTE open'; END IF;

  -- READ-side only: no client DML grants on pilot_invitations (re-check).
  SELECT count(*) INTO v_cnt FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'pilot_invitations'
      AND grantee = 'authenticated'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION '00093: authenticated DML open on pilot_invitations';
  END IF;

  RAISE NOTICE '00093: applied cleanly (client invitation proof read)';
END
$guard$;

COMMIT;