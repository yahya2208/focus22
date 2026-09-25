-- ============================================================================
-- GATE V1.6.4 — FAMILY INVITE KIND (Vegetables single-merchant family flow).
-- Additive ONLY: widen the pilot_invitations.member_kind CHECK to admit
-- 'family' alongside the untouched 'operator'/'courier' values.
-- No rows touched (old invitations keep their kind), no other constraint,
-- table, RLS policy, RPC, or trigger changed. Staff lifecycle (00088)
-- keeps working byte-identically; family rows flow through the same
-- reserve/bind/mark_sent machinery with staff-only membership provisioning
-- skipped (family binding stays on the existing provision RPC + Admin UI).
-- Order: after 00108. NOT applied to any DB by this file alone.
-- ============================================================================

ALTER TABLE public.pilot_invitations
  DROP CONSTRAINT IF EXISTS pilot_invitations_member_kind_check;

ALTER TABLE public.pilot_invitations
  ADD CONSTRAINT pilot_invitations_member_kind_check
  CHECK (member_kind IN ('operator', 'courier', 'family'));

-- ============================================================================
-- pilot_invitation_reserve_family(p_email, p_store_id) → family-lane reserve.
-- Mirrors pilot_invitation_reserve semantics with kind fixed to 'family'
-- (channel always 'invite'): reuse-or-create the lifecycle row, enforce
-- MAX_SENDS(5) + COMPLETED + cooldown rules, emit lifecycle events.
-- Staff reserve RPCs are untouched. service_role-only like its sibling.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_reserve_family(
  p_email    text,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email       text := lower(btrim(COALESCE(p_email, '')));
  v_inv         uuid;
  v_status      text;
  v_last_sent   timestamptz;
  v_pending     timestamptz;
  v_count       int;
  v_outcome     text;
  v_created     bool := false;
  v_rows        int;
BEGIN
  IF p_store_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, last_sent_at, pending_at, sent_count
    INTO v_inv, v_status, v_last_sent, v_pending, v_count
  FROM public.pilot_invitations
  WHERE store_id = p_store_id
    AND member_kind = 'family'
    AND invite_email = v_email
    AND user_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_inv IS NULL THEN
    INSERT INTO public.pilot_invitations
      (invite_email, user_id, store_id, member_kind, channel, status, pending_at, sent_count)
    VALUES
      (v_email, NULL, p_store_id, 'family', 'invite', 'PENDING', now(), 0)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_inv;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_inv IS NOT NULL THEN
      INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
      VALUES (v_inv, 'RESERVED', 'family lifetime reserved before auth op',
              jsonb_build_object('channel', 'invite'));
      RETURN jsonb_build_object(
        'ok', true, 'invitation_id', v_inv, 'created', true,
        'status', 'PENDING', 'sent_count', 0
      );
    END IF;
    SELECT id, status, last_sent_at, pending_at, sent_count
      INTO v_inv, v_status, v_last_sent, v_pending, v_count
    FROM public.pilot_invitations
    WHERE store_id = p_store_id
      AND member_kind = 'family'
      AND invite_email = v_email
      AND user_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_status := COALESCE(v_status, '');
  v_count  := COALESCE(v_count, 0);

  IF v_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_SENDS_REACHED', 'invitation_id', v_inv);
  END IF;
  IF v_status = 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITATION_COMPLETED', 'invitation_id', v_inv);
  END IF;

  IF v_status = 'SENT' OR v_status = 'ACCEPTED' OR v_status = 'PENDING' THEN
    IF v_last_sent IS NOT NULL AND now() - v_last_sent < interval '60 seconds' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'COOLDOWN_ACTIVE', 'invitation_id', v_inv);
    END IF;
    IF v_last_sent IS NULL AND v_pending IS NOT NULL THEN
      SELECT COALESCE(meta ->> 'outcome', '') INTO v_outcome
        FROM public.pilot_invitation_events
       WHERE invitation_id = v_inv AND event_type = 'FAILED'
       ORDER BY created_at DESC LIMIT 1;
      IF v_outcome = 'indeterminate' AND now() - v_pending < interval '60 seconds' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'COOLDOWN_ACTIVE', 'invitation_id', v_inv);
      END IF;
    END IF;
  END IF;

  UPDATE public.pilot_invitations
     SET status = 'PENDING', pending_at = now(), channel = 'invite', updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (v_inv, CASE
            WHEN v_created THEN 'RESERVED'
            WHEN v_status IN ('SENT', 'ACCEPTED') THEN 'RESEND_REQUESTED'
            ELSE 'RETRY'
          END,
          'family attempt reserved before auth op',
          jsonb_build_object('channel', 'invite'));

  RETURN jsonb_build_object(
    'ok', true, 'invitation_id', v_inv, 'created', v_created,
    'status', 'PENDING', 'sent_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_reserve_family(text, uuid) TO service_role;