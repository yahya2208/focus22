-- ============================================================================
-- 00089_rollback_plan.sql  (OPERATOR-RUN ONLY — NOT a migration, never auto-applied)
-- GATE 1B — reverses 00089 fully. Restores EXACT 00088 11b semantics.
--;
-- NOTES
--   * Place this file OUTSIDE supabase/migrations/ so the CLI never applies it.
--   * Rollback restores the FALSE positive (temp-password-at-acceptance fires
--     PASSWORD_SET) — the exact gate-1b desync 00089 removed. Run it ONLY to
--     revert; do not run it "for cleanliness".
--   * Recorded PASSWORD_SET / COMPLETED events are PRESERVED (audit trail),
--     but password_set_at / completed_at on the row are not rolled back.
-- ============================================================================

BEGIN;

-- 1) Drop the authoritative-signal trigger + function (00089 objects). -------
DROP TRIGGER IF EXISTS pilot_on_audit_password_updated ON auth.audit_log_entries;
DROP FUNCTION IF EXISTS public.pilot_on_audit_password_updated();

-- 2) Restore the ORIGINAL 00088 11b function + trigger (verbatim). -----------
CREATE OR REPLACE FUNCTION public.pilot_on_auth_password_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_invitations pi
    WHERE pi.user_id = NEW.id OR pi.invite_email = NEW.email
  ) THEN
    RETURN NEW; -- inert for every normal / customer account
  END IF;

  SELECT id INTO v_inv
    FROM public.pilot_invitations
   WHERE (user_id = NEW.id OR invite_email = NEW.email)
     AND status IN ('PENDING', 'SENT', 'ACCEPTED')
   ORDER BY created_at ASC
   LIMIT 1;
  IF v_inv IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pilot_invitations
     SET password_set_at = COALESCE(password_set_at, now()),
         updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (v_inv, 'PASSWORD_SET', 'first credential creation observed', '{}'::jsonb);

  PERFORM public.pilot_invitation_advance(v_inv);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pilot_on_auth_password_set ON auth.users;
CREATE TRIGGER pilot_on_auth_password_set
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.encrypted_password IS NULL OR OLD.encrypted_password = '')
    AND NEW.encrypted_password IS NOT NULL
    AND NEW.encrypted_password <> ''
  )
  EXECUTE FUNCTION public.pilot_on_auth_password_set();

COMMIT;