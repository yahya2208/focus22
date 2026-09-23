-- ============================================================================
-- 00089_verifier.sql  (READ-ONLY — run AFTER apply + live password set)
-- GATE 1B — asserts 00089 is structurally correct AND the business state
-- machine behaved exactly as specified. SELECT/DO only, never writes.
--;
-- Mirror of gate1b contract tests in src/__tests__/pilot/:
--   pilot-00088-gate1b-contract.test.ts expects: events must include
--   ACCEPTED only at acceptance; PASSWORD_SET only at explicit set;
--   COMPLETED exactly once, at accepted_at+password_set_at.
-- ============================================================================

DO $$
DECLARE
  v_test_email text := 'pilot.signal.probe@example.com'; -- SET at runtime
  v_user_id    uuid;
  v_inv_id     uuid;
  v_fail       boolean := false;
  v_n          int;
  v_status     text;
  v_rec        record;
BEGIN
  -- ---- Resolve test identity ----------------------------------------------
  SELECT id INTO v_user_id
    FROM public.pilot_invitations
   WHERE invite_email = v_test_email
   LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'VERIFY: test invitation % not found — run live plan first', v_test_email;
  END IF;
  SELECT id, status INTO v_inv_id, v_status
    FROM public.pilot_invitations WHERE invite_email = v_test_email LIMIT 1;

  -- ---- Acceptance produced NO password signal ------------------------------
  SELECT count(*) INTO v_n
    FROM auth.audit_log_entries
   WHERE payload->>'action' = 'user_updated_password'
     AND payload->>'actor_id' = v_user_id::text;
  IF v_n <> 1 THEN
    RAISE NOTICE 'VERIFY FAIL: expected exactly 1 user_updated_password for actor (got %)', v_n;
    v_fail := true;
  ELSE
    RAISE NOTICE 'VERIFY OK: exactly one user_updated_password observed';
  END IF;

  SELECT count(*) INTO v_n FROM auth.audit_log_entries
   WHERE payload->>'action' = 'user_signedup' AND payload->>'actor_id' = v_user_id::text;
  RAISE NOTICE 'VERIFY: user_signedup rows for actor = % (acceptance must be 1, not counted as password)', v_n;

  -- ---- Business state ------------------------------------------------------
  IF v_status <> 'COMPLETED' THEN
    RAISE NOTICE 'VERIFY FAIL: expected COMPLETED (got %)', v_status;
    v_fail := true;
  ELSE
    RAISE NOTICE 'VERIFY OK: status COMPLETED';
  END IF;

  SELECT count(*) INTO v_n FROM public.pilot_invitations
   WHERE id = v_inv_id AND password_set_at IS NOT NULL AND completed_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE NOTICE 'VERIFY FAIL: password_set_at/completed_at missing';
    v_fail := true;
  ELSE
    RAISE NOTICE 'VERIFY OK: password_set_at + completed_at set';
  END IF;

  -- ---- Event ordering & idempotency -----------------------------------------
  SELECT count(*) INTO v_n FROM public.pilot_invitation_events
   WHERE invitation_id = v_inv_id AND event_type = 'COMPLETED';
  IF v_n <> 1 THEN
    RAISE NOTICE 'VERIFY FAIL: COMPLETED event count = % (must be exactly 1)', v_n;
    v_fail := true;
  ELSE
    RAISE NOTICE 'VERIFY OK: COMPLETED emitted exactly once';
  END IF;

  SELECT count(*) INTO v_n FROM public.pilot_invitation_events
   WHERE invitation_id = v_inv_id AND event_type = 'PASSWORD_SET';
  IF v_n <> 1 THEN
    RAISE NOTICE 'VERIFY FAIL: PASSWORD_SET event count = % (must be 1)', v_n;
    v_fail := true;
  ELSE
    RAISE NOTICE 'VERIFY OK: PASSWORD_SET emitted exactly once (no acceptance false-firing)';
  END IF;

  FOR v_rec IN
    SELECT id, event_type, created_at
      FROM public.pilot_invitation_events
     WHERE invitation_id = v_inv_id
     ORDER BY created_at ASC
  LOOP
    RAISE NOTICE 'VERIFY event: % @ %', v_rec.event_type, v_rec.created_at;
  END LOOP;

  IF v_fail THEN
    RAISE EXCEPTION 'VERIFY FAILED — block Gate 1B; rollback is ready (00089_rollback_plan.sql)';
  END IF;
  RAISE NOTICE 'VERIFY PASS — PASSWORD_SET final: user_updated_password + advance';
END
$$;