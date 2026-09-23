-- ============================================================================
-- 00089_preflight.sql  (READ-ONLY — run BEFORE any change request is approved)
-- GATE 1B — captures current Staging structural state. SELECT / NOTICE only,
-- no writes. Any RAISE below means STOP: do not proceed to the config flip.
--;
-- NOTE: the GoTrue runtime flags (AUDIT_LOG_DISABLE_POSTGRES, send-email hook)
-- are NOT Postgres GUCs — they must be read from the Dashboard / Management API
-- by the operator (already reported: audit_log_disable_postgres=true,
-- hook_send_email_enabled=false). This script verifies only DB-side state.
-- ============================================================================

DO $$
DECLARE
  v_cnt_audit   bigint;
  v_cnt_inv     int;
  v_old_trigger int;
  v_new_trigger int;
  v_fail        boolean := false;
  v_rec         record;
BEGIN

  -- 1) Table presence --------------------------------------------------------
  IF to_regclass('public.pilot_invitations') IS NULL THEN
    RAISE NOTICE 'PREFLIGHT FAIL: pilot_invitations missing'; v_fail := true;
  END IF;
  IF to_regclass('public.pilot_invitation_events') IS NULL THEN
    RAISE NOTICE 'PREFLIGHT FAIL: pilot_invitation_events missing'; v_fail := true;
  END IF;
  IF to_regclass('auth.audit_log_entries') IS NULL THEN
    RAISE NOTICE 'PREFLIGHT FAIL: auth.audit_log_entries missing'; v_fail := true;
  END IF;

  -- 2) Trigger pre-state (expect OLD present, NEW absent) --------------------
  SELECT count(*) INTO v_old_trigger
    FROM pg_trigger
   WHERE tgname = 'pilot_on_auth_password_set' AND tgrelid = 'auth.users'::regclass;
  IF v_old_trigger <> 1 THEN
    RAISE NOTICE 'PREFLIGHT FAIL: pilot_on_auth_password_set trigger not exactly 1 (got %)', v_old_trigger;
    v_fail := true;
  ELSE
    RAISE NOTICE 'PREFLIGHT OK: false-signal trigger present (to be dropped by 00089)';
  END IF;

  SELECT count(*) INTO v_new_trigger
    FROM pg_trigger
   WHERE tgname = 'pilot_on_audit_password_updated'
     AND tgrelid = 'auth.audit_log_entries'::regclass;
  IF v_new_trigger <> 0 THEN
    RAISE NOTICE 'PREFLIGHT FAIL: pilot_on_audit_password_updated already present (re-run drift)';
    v_fail := true;
  ELSE
    RAISE NOTICE 'PREFLIGHT OK: new trigger absent (clean baseline)';
  END IF;

  -- 3) audit_log_entries current content (expect 0 rows on Staging) ---------
  SELECT count(*) INTO v_cnt_audit FROM auth.audit_log_entries;
  RAISE NOTICE 'PREFLIGHT: auth.audit_log_entries total rows = %', v_cnt_audit;
  FOR v_rec IN
    SELECT (payload->>'action') AS action, payload->>'actor_id' AS actor_id,
           created_at
      FROM auth.audit_log_entries
     ORDER BY created_at DESC
     LIMIT 20
  LOOP
    RAISE NOTICE 'PREFLIGHT audit sample: action=% actor=% at=%',
      v_rec.action, v_rec.actor_id, v_rec.created_at;
  END LOOP;

  -- 4) Invitation snapshot ---------------------------------------------------
  SELECT count(*) INTO v_cnt_inv FROM public.pilot_invitations;
  RAISE NOTICE 'PREFLIGHT: pilot_invitations total = %', v_cnt_inv;
  FOR v_rec IN
    SELECT status, count(*) AS n
      FROM public.pilot_invitations
     GROUP BY status ORDER BY status
  LOOP
    RAISE NOTICE 'PREFLIGHT: status % -> %', v_rec.status, v_rec.n;
  END LOOP;

  -- 5) Rule-of-five: passwords, hashes or tokens must NEVER be read ---------
  IF (SELECT count(*) FROM pg_proc
       WHERE prosrc ILIKE '%encrypted_password%'
         AND prostype = 'trigger'::regtype) > 0 THEN
    RAISE NOTICE 'PREFLIGHT WARN: trigger functions still reference encrypted_password (00088 11b)';
  END IF;

  IF v_fail THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — do not proceed to config flip';
  END IF;

  RAISE NOTICE 'PREFLIGHT PASS — structural baseline captured (runtime flags are operator-read)';
END
$$;