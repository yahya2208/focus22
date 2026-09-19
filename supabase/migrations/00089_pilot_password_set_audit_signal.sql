-- ============================================================================
-- 00089_pilot_password_set_audit_signal.sql
-- GATE 1B — PASSWORD_SET authoritative signal (PREPARED — NOT APPLIED)
--
-- STATUS:     PREPARATION ONLY. Do NOT apply until explicit approval.
-- CHANGE TYPE: SQL write / migration apply  ->  STOP GATE (explicit approval).
--
-- PRECONDITION (operational, NOT self-checkable from SQL):
--   Staging auth config AUDIT_LOG_DISABLE_POSTGRES must be flipped
--   true -> false (Operator/Dashboard/Management API) so GoTrue writes
--   `user_updated_password` rows into `auth.audit_log_entries`. GoTrue
--   source (models/audit_log_entry.go): `if config.DisablePostgres { return nil }`
--   gates the `tx.Create(&AuditLogEntry{...})` write. Without that flip this
--   trigger exists but never fires (inert, harmless). The flip itself requires
--   explicit approval (Dashboard/config mutation).
--
-- DESIGN (minimal architectural patch; validators: gate1b contract tests):
--   * The ONLY durable, non-forgeable, server-authoritative PASSWORD_SET
--     evidence is GoTrue's audit action `user_updated_password`, emitted
--     exclusively from the logged-in Explicit Password Set path
--     (UserUpdate, user.go:218). Acceptance path emits `user_signedup`
--     only (verify.go:335/340); admin password writes emit `user_modified`
--     only (admin.go:382). Invitation temp-password write emits none.
--   * 11b trigger (00088) consumed empty->non-empty encrypted_password as a
--     password_set signal -> FALSE POSITIVE at invitation acceptance
--     (GoTrue writes the temp password there). Dropped below.
--   * New AFTER-INSERT trigger on auth.audit_log_entries observes exactly the
--     row emitted inside the SAME transaction as the user's password update,
--     then records PASSWORD_SET + defers completion to the existing,
--     untouched, idempotent pilot_invitation_advance engine.
--   * Defensive: any unexpected row that does not match a live invitation is a
--     no-op; any internal error ROLLS BACK to the savepoint and lets the
--     user's own password update succeed (never breaks the auth request).
--
-- TOUCHED OBJECTS:
--   DROP  : trigger pilot_on_auth_password_set ON auth.users (FALSE SIGNAL)
--   DROP  : function public.pilot_on_auth_password_set()
--   CREATE: function public.pilot_on_audit_password_updated()
--   CREATE: trigger  pilot_on_audit_password_updated ON auth.audit_log_entries
--   UNTOUCHED: pilot_on_auth_confirmed (ACCEPTED), pilot_invitation_advance,
--              00080-00086, RBAC, membership, telemetry, EFs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Remove the FALSE PASSWORD_SET signal (empty -> non-empty encrypted_password).
--    GoTrue writes the temporary password at invitation acceptance through this
--    same transition, so this trigger misfires long before the user chooses a
--    password. Dropping it is required; leaving it would double-record
--    password_set_at at acceptance (the gate-1b desync being fixed).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS pilot_on_auth_password_set ON auth.users;
DROP FUNCTION IF EXISTS public.pilot_on_auth_password_set();

-- ----------------------------------------------------------------------------
-- 2) New signal function: observe the authoritative audit row only.
--    action = 'user_updated_password'  ->  the logged-in user set a password.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pilot_on_audit_password_updated()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_actor  uuid;
  v_inv    uuid;
BEGIN
  IF NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;

  v_action := NEW.payload ->> 'action';
  IF v_action <> 'user_updated_password' THEN
    RETURN NEW; -- all other audit actions are irrelevant (incl. user_signedup)
  END IF;

  BEGIN
    v_actor := (NEW.payload ->> 'actor_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_inv
    FROM public.pilot_invitations
   WHERE user_id = v_actor
     AND status IN ('PENDING', 'SENT', 'ACCEPTED')
   ORDER BY created_at ASC
   LIMIT 1;
  IF v_inv IS NULL THEN
    RETURN NEW; -- no live invitation bound to this account
  END IF;

  UPDATE public.pilot_invitations
     SET password_set_at = COALESCE(password_set_at, now()),
         updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (
    v_inv,
    'PASSWORD_SET',
    'server-authoritative audit signal (user_updated_password)',
    jsonb_build_object(
      'signal',   'user_updated_password',
      'audit_log_id', NEW.id,
      'actor_id', v_actor,
      'audit_created_at', NEW.created_at
    )
  );

  PERFORM public.pilot_invitation_advance(v_inv);

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never fail the user's own password-update transaction
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_on_audit_password_updated() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_on_audit_password_updated() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_on_audit_password_updated() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_on_audit_password_updated() FROM service_role;

DROP TRIGGER IF EXISTS pilot_on_audit_password_updated ON auth.audit_log_entries;
CREATE TRIGGER pilot_on_audit_password_updated
  AFTER INSERT ON auth.audit_log_entries
  FOR EACH ROW
  WHEN (
    (NEW.payload ->> 'action') = 'user_updated_password'
  )
  EXECUTE FUNCTION public.pilot_on_audit_password_updated();

-- ----------------------------------------------------------------------------
-- 3) Post-apply integrity — structural drift fails loudly (repo pattern).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ok  boolean;
  v_old int;
  v_new int;
  v_def text;
BEGIN
  IF to_regclass('public.pilot_invitations') IS NULL THEN
    RAISE EXCEPTION '00089: pilot_invitations missing';
  END IF;
  IF to_regclass('public.pilot_invitation_events') IS NULL THEN
    RAISE EXCEPTION '00089: pilot_invitation_events missing';
  END IF;
  IF to_regclass('auth.audit_log_entries') IS NULL THEN
    RAISE EXCEPTION '00089: auth.audit_log_entries missing';
  END IF;

  SELECT count(*) INTO v_old
    FROM pg_trigger
   WHERE tgname = 'pilot_on_auth_password_set' AND tgrelid = 'auth.users'::regclass;
  IF v_old <> 0 THEN
    RAISE EXCEPTION '00089: false-signal trigger pilot_on_auth_password_set still present';
  END IF;

  SELECT count(*) INTO v_new
    FROM pg_trigger
   WHERE tgname = 'pilot_on_audit_password_updated'
     AND tgrelid = 'auth.audit_log_entries'::regclass;
  IF v_new <> 1 THEN
    RAISE EXCEPTION '00089: pilot_on_audit_password_updated trigger missing';
  END IF;

  SELECT prosrc INTO v_def
    FROM pg_proc
   WHERE proname = 'pilot_on_audit_password_updated' AND pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '00089: pilot_on_audit_password_updated function missing';
  END IF;
  IF position('encrypted_password' in v_def) > 0 THEN
    RAISE EXCEPTION '00089: forbidden reference to encrypted_password in signal function';
  END IF;
  IF position('''user_updated_password''' in v_def) = 0 THEN
    RAISE EXCEPTION '00089: signal function no longer keys on user_updated_password';
  END IF;

  RAISE NOTICE '00089: applied cleanly (signal = user_updated_password)';
END;
$$;

COMMIT;