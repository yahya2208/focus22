-- ============================================================================
-- GATE 1B — ALTERNATIVE 5 — PROOF OF CONCEPT
-- STAGING ONLY
-- Project: wpthryqflsfamjbtvjoa
--
-- PURPOSE
-- -------
-- Prove or disprove Alternative 5 without modifying production logic.
--
-- IMPORTANT:
--   - Diagnostic PoC only.
--   - NO UPDATE to auth.users.
--   - NO password clearing.
--   - NO DELETE.
--   - NO migration.
--   - NO trigger/function/classifier changes.
--   - Existing invitation 98fb473e is untouched.
--
-- FLOW
-- ----
-- BLOCK 1 / Phase 0:
--   Read-only SHA-0 gate.
--
--   If either test identity already has a password hash,
--   or is already confirmed, STOP immediately.
--
-- Phase 1:
--   Reserve + bind + mark_sent for A and B.
--
-- Manual steps:
--   See gate1b_poc_alt5_steps.md
--
-- Phase 2 / verification:
--   Run the read-only verification queries from the companion guide.
-- ============================================================================


-- ============================================================================
-- BLOCK 1 — READ-ONLY SHA-0 + RESERVE/BIND/MARK-SENT
-- ============================================================================
--
-- BEFORE RUNNING:
--   1. Create two fresh Staging Auth users.
--   2. Do NOT use frpyahya3@gmail.com.
--   3. Do NOT use the operational courier.
--   4. Use the two dedicated test emails below.
--   5. Do NOT open either invitation before this script passes.
--   6. Do NOT set a password before this script passes.
--
-- IMPORTANT:
--   If Dashboard/Auth created a password automatically, this script MUST NOT
--   clear it. The PoC must fail because Alternative 5 has not been proven.
--
-- IMPORTANT:
--   invited_at is EXPECTED to be non-NULL for users created by Auth invite.
--   Therefore invited_at is NOT a SHA-0 failure condition.
-- ============================================================================

DO $$
DECLARE
  _email_a text := 'manouniyahya3@gmail.com';
  _email_b text := 'yahyamanouni@gmail.com';

  _store uuid;
  _uid_a uuid;
  _uid_b uuid;
  _inv_a uuid;
  _inv_b uuid;

  _r jsonb;
  _active_store_count integer;
  _count integer;
BEGIN
  PERFORM set_config('search_path', 'public', false);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'GATE 1B — ALTERNATIVE 5 — BLOCK 1';
  RAISE NOTICE 'STAGING ONLY: wpthryqflsfamjbtvjoa';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'email_a=%', _email_a;
  RAISE NOTICE 'email_b=%', _email_b;


  -- --------------------------------------------------------------------------
  -- 0A. Exactly one active pilot store
  -- --------------------------------------------------------------------------

  SELECT
    count(*),
    (array_agg(id ORDER BY id))[1]
  INTO _active_store_count, _store
  FROM public.stores
  WHERE status = 'active';

  IF _active_store_count <> 1 THEN
    RAISE EXCEPTION
      'BLOCKED — expected exactly one active store, found %',
      _active_store_count;
  END IF;

  RAISE NOTICE 'PASS 0A — exactly one active store: %', _store;


  -- --------------------------------------------------------------------------
  -- 0B. Test emails must never have been used before
  -- --------------------------------------------------------------------------

  SELECT count(*)
    INTO _count
  FROM public.pilot_invitations
  WHERE lower(invite_email) IN (lower(_email_a), lower(_email_b));

  IF _count <> 0 THEN
    RAISE EXCEPTION
      'BLOCKED — one or both test emails already exist in pilot_invitations';
  END IF;


  SELECT count(*)
    INTO _count
  FROM auth.users
  WHERE lower(email) IN (lower(_email_a), lower(_email_b));

  IF _count <> 2 THEN
    RAISE EXCEPTION
      'BLOCKED — expected exactly 2 fresh auth users, found %',
      _count;
  END IF;

  RAISE NOTICE 'PASS 0B — both test emails are fresh';


  -- --------------------------------------------------------------------------
  -- 0C. Resolve Auth IDs
  -- --------------------------------------------------------------------------

  SELECT id
    INTO _uid_a
  FROM auth.users
  WHERE lower(email) = lower(_email_a);

  SELECT id
    INTO _uid_b
  FROM auth.users
  WHERE lower(email) = lower(_email_b);

  IF _uid_a IS NULL OR _uid_b IS NULL THEN
    RAISE EXCEPTION
      'BLOCKED — could not resolve both Auth user IDs';
  END IF;

  IF _uid_a = _uid_b THEN
    RAISE EXCEPTION
      'BLOCKED — A and B resolved to the same Auth user';
  END IF;

  RAISE NOTICE 'PASS 0C — uid_a=%', _uid_a;
  RAISE NOTICE 'PASS 0C — uid_b=%', _uid_b;


  -- --------------------------------------------------------------------------
  -- 0D. SHA-0 — CRITICAL READ-ONLY AUTH STATE
  --
  -- We deliberately DO NOT modify auth.users here.
  --
  -- Required before continuing:
  --   encrypted_password = empty
  --   confirmed_at       = NULL
  --   email_confirmed_at = NULL
  --
  -- invited_at is intentionally displayed but NOT used as a failure
  -- condition because Auth invitation dispatch sets invited_at.
  -- --------------------------------------------------------------------------

  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'SHA-0 — READ-ONLY AUTH STATE';
  RAISE NOTICE '------------------------------------------------------------';

  FOR _r IN
    SELECT jsonb_build_object(
      'email', au.email,
      'id', au.id,
      'pwd_empty',
        (au.encrypted_password IS NULL OR au.encrypted_password = ''),
      'email_confirmed',
        (au.email_confirmed_at IS NOT NULL),
      'confirmed',
        (au.confirmed_at IS NOT NULL),
      'invited_at_set',
        (au.invited_at IS NOT NULL),
      'created_at',
        au.created_at
    )
    FROM auth.users au
    WHERE au.id IN (_uid_a, _uid_b)
    ORDER BY lower(au.email)
  LOOP
    RAISE NOTICE 'SHA-0: %', _r;
  END LOOP;


  -- --------------------------------------------------------------------------
  -- 0E. SHA-0 gate
  --
  -- REQUIRED for BOTH users:
  --   encrypted_password = empty
  --   confirmed_at       = NULL
  --   email_confirmed_at = NULL
  --
  -- invited_at is intentionally NOT checked.
  --
  -- If this fails:
  --   STOP.
  --   No cleanup.
  --   No reserve.
  --   No bind.
  --   No mark_sent.
  -- --------------------------------------------------------------------------

  SELECT count(*)
    INTO _count
  FROM auth.users au
  WHERE au.id IN (_uid_a, _uid_b)
    AND (au.encrypted_password IS NULL OR au.encrypted_password = '')
    AND au.confirmed_at IS NULL
    AND au.email_confirmed_at IS NULL;

  IF _count <> 2 THEN
    RAISE EXCEPTION
      'BLOCKED — Alternative 5 not proven at SHA-0. Expected both users to have empty password and unconfirmed state; qualifying users=%',
      _count;
  END IF;

  RAISE NOTICE
    'PASS SHA-0 — both identities are empty-password and unconfirmed';


  -- --------------------------------------------------------------------------
  -- 0F. public.users proxy rows must already exist
  --
  -- We do NOT create fallback rows here.
  -- Their presence is part of the expected Auth-trigger behavior.
  -- --------------------------------------------------------------------------

  SELECT count(*)
    INTO _count
  FROM public.users
  WHERE lower(email) IN (lower(_email_a), lower(_email_b));

  IF _count <> 2 THEN
    RAISE EXCEPTION
      'BLOCKED — expected both public.users proxy rows to exist, found %',
      _count;
  END IF;

  RAISE NOTICE 'PASS 0F — public.users rows exist';


  -- ==========================================================================
  -- PHASE 1 — RESERVE + BIND
  -- ==========================================================================

  SELECT public.pilot_invitation_reserve(
    _email_a,
    _uid_a,
    _store,
    'courier',
    'invite'
  )
  INTO _r;

  IF (_r->>'ok') <> 'true' THEN
    RAISE EXCEPTION
      'BLOCKED — reserve A failed: %',
      _r;
  END IF;

  _inv_a := (_r->>'invitation_id')::uuid;

  RAISE NOTICE 'PASS 1A — reserved A: invitation_id=%', _inv_a;


  SELECT public.pilot_invitation_reserve(
    _email_b,
    _uid_b,
    _store,
    'courier',
    'invite'
  )
  INTO _r;

  IF (_r->>'ok') <> 'true' THEN
    RAISE EXCEPTION
      'BLOCKED — reserve B failed: %',
      _r;
  END IF;

  _inv_b := (_r->>'invitation_id')::uuid;

  RAISE NOTICE 'PASS 1B — reserved B: invitation_id=%', _inv_b;


  -- --------------------------------------------------------------------------
  -- Bind A
  -- --------------------------------------------------------------------------

  SELECT public.pilot_invitation_bind(
    _inv_a,
    _uid_a,
    _email_a
  )
  INTO _r;

  IF (_r->>'invitation_id')::uuid <> _inv_a THEN
    RAISE EXCEPTION
      'BLOCKED — bind A failed: %',
      _r;
  END IF;

  RAISE NOTICE 'PASS 1C — bind A';


  -- --------------------------------------------------------------------------
  -- Bind B
  -- --------------------------------------------------------------------------

  SELECT public.pilot_invitation_bind(
    _inv_b,
    _uid_b,
    _email_b
  )
  INTO _r;

  IF (_r->>'invitation_id')::uuid <> _inv_b THEN
    RAISE EXCEPTION
      'BLOCKED — bind B failed: %',
      _r;
  END IF;

  RAISE NOTICE 'PASS 1D — bind B';


  -- ==========================================================================
  -- PHASE 2 — MARK SENT
  -- ==========================================================================

  SELECT public.pilot_invitation_mark_sent(_inv_a)
    INTO _r;

  IF (_r->>'status') <> 'SENT' THEN
    RAISE EXCEPTION
      'BLOCKED — mark_sent A failed: %',
      _r;
  END IF;

  RAISE NOTICE 'PASS 2A — A marked SENT';


  SELECT public.pilot_invitation_mark_sent(_inv_b)
    INTO _r;

  IF (_r->>'status') <> 'SENT' THEN
    RAISE EXCEPTION
      'BLOCKED — mark_sent B failed: %',
      _r;
  END IF;

  RAISE NOTICE 'PASS 2B — B marked SENT';


  -- --------------------------------------------------------------------------
  -- Final handles for manual browser phase
  -- --------------------------------------------------------------------------

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ALT5 BLOCK 1 COMPLETE — ALL PASS';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'store_id = %', _store;
  RAISE NOTICE 'uid_a    = %', _uid_a;
  RAISE NOTICE 'uid_b    = %', _uid_b;
  RAISE NOTICE 'inv_a    = %', _inv_a;
  RAISE NOTICE 'inv_b    = %', _inv_b;
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'NEXT: follow gate1b_poc_alt5_steps.md';
END;
$$;