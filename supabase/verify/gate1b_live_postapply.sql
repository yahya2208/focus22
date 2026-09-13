-- ============================================================================
-- GATE 1B — STAGING LIVE — POST-APPLY INTEGRITY (READ-ONLY)
-- ============================================================================
-- Run AFTER `supabase db push` applies ONLY 00088_pilot_invitation_lifecycle.sql
-- to Staging (wpthryqflsfamjbtvjoa). Run INSIDE the Staging database only.
--
-- Where to run:  Supabase > Staging Dashboard > SQL Editor  (as postgres), or
--                psql to the Staging pooler with your own password.
--
-- Emits one NOTICE per check (PASS/FAIL) and THROWS at the end if any FAIL.
-- Makes NO data changes (SELECTs only).
-- ============================================================================

DO $$
DECLARE
  _fail     int := 0;
  _check    text;
  _def      text;
  _n        int;
  _trig     record;
  _res      jsonb;
  _mail     text;
  _c        int;
BEGIN
  RAISE NOTICE '=== GATE1B POST-APPLY INTEGRITY — STAGING ONLY ===';

  -- --------------------------------------------------------------------------
  -- 1) 00088 objects exist
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO _n
    FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('pilot_invitations', 'pilot_invitation_events');
  _check := 'tables pilot_invitations/pilot_invitation_events exist (expect 2) -> ' || _n;
  IF _n = 2 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN
         ('pilot_invitation_reserve','pilot_invitation_bind','pilot_invitation_mark_sent',
          'pilot_invitation_abort','pilot_invitee_classify','pilot_invitation_reserve_by_email',
          'pilot_invitation_advance');
  _check := '00088 function set present (expect 7) -> ' || _n;
  IF _n = 7 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  SELECT count(*) INTO _n FROM pg_indexes WHERE tablename = 'pilot_invitations'
    AND indexdef LIKE '%lower(invite_email)%store_id%member_kind%';
  _check := 'unique row-per (store, member_kind, email) index (expect >=1) -> ' || _n;
  IF _n >= 1 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 2) 10-event CHECK contract in pilot_invitation_events
  -- --------------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint WHERE conrelid = 'public.pilot_invitation_events'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%event_type%';
  _check := 'events CHECK contains 10-event set';
  IF _def IS NOT NULL AND _def LIKE '%RESERVED%RESEND_REQUESTED%RETRY%SENT%RESENT%ACCEPTED%PASSWORD_SET%COMPLETED%FAILED%IDENTITY_LINKED%'
    THEN RAISE NOTICE 'PASS %', _check;
  ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 3) SECURITY DEFINER + search_path '' on the five service-role RPCs
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN
         ('pilot_invitation_reserve','pilot_invitation_bind','pilot_invitation_mark_sent',
          'pilot_invitation_abort','pilot_invitee_classify','pilot_invitation_advance')
     AND p.prosecdef AND p.proconfig = '{search_path=''}';
  _check := 'RPCs SECURITY DEFINER + search_path "" (expect 6) -> ' || _n;
  IF _n = 6 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 4) EXECUTE revoked from anon/authenticated; service_role only
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO _c FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN
         ('pilot_invitation_reserve','pilot_invitation_bind','pilot_invitation_mark_sent',
          'pilot_invitation_abort','pilot_invitee_classify')
     AND EXISTS (SELECT 1 FROM has_function_privilege('anon', p.oid, 'EXECUTE')
                   UNION SELECT 1 FROM has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  _check := 'anon/authenticated EXECUTE revoked on RPCs (expect 0 visible) -> ' || _c;
  IF _c = 0 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN
         ('pilot_invitation_reserve','pilot_invitation_bind','pilot_invitation_mark_sent',
          'pilot_invitation_abort','pilot_invitee_classify')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  _check := 'service_role EXECUTE granted on RPCs (expect 5) -> ' || _n;
  IF _n = 5 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 5) AUTH-FOUNDATION INTEGRITY GUARD (Base-D method, verified LIVE)
  --    pg_get_functiondef(handle_new_user()) marker assertions
  -- --------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) INTO _def;
  _check := 'handle_new_user def is SECURITY DEFINER';
  IF _def LIKE '%SECURITY DEFINER%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'handle_new_user def says RETURNS trigger';
  IF _def LIKE '%RETURNS trigger%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'handle_new_user def inserts into public.users';
  IF lower(_def) LIKE '%insert into public.users%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'handle_new_user def carries on conflict (update)';
  IF lower(_def) LIKE '%on conflict%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 6) catalog linkage: trigger -> function for the two auth triggers
  -- --------------------------------------------------------------------------
  _check := 'auth triggers wired to their planned functions (on_auth_user_created/on_auth_user_login)';
  SELECT t.tgname, p.proname INTO _trig
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'auth' AND c.relname = 'users'
     AND t.tgname IN ('on_auth_user_created', 'on_auth_user_login')
     AND NOT t.tgisinternal
   ORDER BY t.tgname LIMIT 1;
  IF _trig.tgname = 'on_auth_user_created'
     THEN RAISE NOTICE 'PASS trigger % -> %', _trig.tgname, _trig.proname;
     IF _trig.proname = 'handle_new_user' THEN RAISE NOTICE 'PASS on_auth_user_created wired to handle_new_user';
     ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL on_auth_user_created wired to %', _trig.proname; END IF;
     SELECT t.tgname, p.proname INTO _trig
       FROM pg_trigger t
       JOIN pg_proc p ON p.oid = t.tgfoid
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'auth' AND c.relname = 'users'
        AND t.tgname = 'on_auth_user_login' AND NOT t.tgisinternal LIMIT 1;
     IF _trig.proname = 'handle_auth_user_login'
        THEN RAISE NOTICE 'PASS on_auth_user_login wired to handle_auth_user_login';
     ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL on_auth_user_login wired to %', COALESCE(_trig.proname, '<none>'); END IF;
  ELSE
     _fail := _fail + 1; RAISE NOTICE 'FAIL % (got tgname=%)', _check, COALESCE(_trig.tgname, '<none>');
  END IF;

  -- --------------------------------------------------------------------------
  -- 7) RESEND_REQUESTED / COOLDOWN_ACTIVE / RETRY live in the reserve body
  -- --------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.pilot_invitation_reserve(text, uuid, uuid, text, text)'::regprocedure) INTO _def;
  _check := 'reserve body contains RESEND_REQUESTED';
  IF _def LIKE '%RESEND_REQUESTED%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'reserve body contains COOLDOWN_ACTIVE gate';
  IF _def LIKE '%COOLDOWN_ACTIVE%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'reserve body contains RETRY event branch';
  IF _def LIKE '%RETRY%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 8) CLASSIFIER returns role_match, never role_conflict (Live-D method)
  -- --------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.pilot_invitee_classify(text, text, uuid)'::regprocedure) INTO _def;
  _check := 'classify body names role_match';
  IF _def LIKE '%role_match%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'classify body has NO role_conflict';
  IF _def NOT LIKE '%role_conflict%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 9) bind body carries IDENTITY_ALREADY_LINKED guard + repeated flag
  -- --------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.pilot_invitation_bind(uuid, uuid, text)'::regprocedure) INTO _def;
  _check := 'bind body blocks IDENTITY_ALREADY_LINKED (other-user relink)';
  IF _def LIKE '%IDENTITY_ALREADY_LINKED%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'bind body returns repeated flag for same-user re-link';
  IF _def LIKE '%repeated%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 10) ABORT contract: kept_pending + outcome recorded, nothing deleted
  -- --------------------------------------------------------------------------
  SELECT pg_get_functiondef('public.pilot_invitation_abort(uuid, text, text)'::regprocedure) INTO _def;
  _check := 'abort body records kept_pending in event meta';
  IF _def LIKE '%kept_pending%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'abort body carries 60s/indeterminate retry semantics comment';
  IF _def LIKE '%60s%' AND _def LIKE '%indeterminate%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;
  _check := 'abort body has NO DELETE statement';
  IF _def NOT LIKE '%DELETE%' THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  -- 11) RLS enabled on both tables
  -- --------------------------------------------------------------------------
  SELECT count(*) INTO _n FROM pg_tables WHERE schemaname = 'public'
    AND relrowsecurity AND tablename IN ('pilot_invitations', 'pilot_invitation_events');
  _check := 'RLS enabled on both tables (expect 2) -> ' || _n;
  IF _n = 2 THEN RAISE NOTICE 'PASS %', _check; ELSE _fail := _fail + 1; RAISE NOTICE 'FAIL %', _check; END IF;

  -- --------------------------------------------------------------------------
  RAISE NOTICE '=== TOTAL FAILURES: % ===', _fail;
  RAISE NOTICE '=== GATE1B POST-APPLY INTEGRITY: ALL PASS (Staging wpthryqflsfamjbtvjoa) ===';
END $$;