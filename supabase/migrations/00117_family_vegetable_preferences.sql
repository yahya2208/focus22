-- ============================================================================
-- 00117  FAMILY VEGETABLE PREFERENCES (columns + member-scoped RPCs).
-- ----------------------------------------------------------------------------
-- Additive ONLY: 2 nullable columns on public.family_groups + 2 member-scoped
-- SECURITY DEFINER RPCs (get/set own family's preferences).
-- Scope proof: family resolved SOLELY from auth.uid() via active
-- family_members row — a member can never read or write another family.
-- Touches NOTHING financial: no money-table changes, no balance logic, no
-- settlement changes, no RLS policy changes (RPC-only access).
-- Optional by design: NULL means "no preference set"; nothing requires it.
-- NOT applied to any DB by this file alone.
-- ============================================================================

ALTER TABLE public.family_groups
  ADD COLUMN IF NOT EXISTS preferred_delivery_time text,
  ADD COLUMN IF NOT EXISTS veg_notes              text;

COMMENT ON COLUMN public.family_groups.preferred_delivery_time IS
  'Family vegetable delivery time preference (optional display-only scheduling hint). Never part of money math.';
COMMENT ON COLUMN public.family_groups.veg_notes IS
  'Family vegetable notes (optional free text). Display-only; never part of money math.';

-- 1) pilot_my_family_preferences_get() → own family's preferences (or nulls).
CREATE OR REPLACE FUNCTION public.pilot_my_family_preferences_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active'
   LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
           'family_id', fg.id,
           'preferred_delivery_time', fg.preferred_delivery_time,
           'veg_notes', fg.veg_notes
         )
    INTO v_out
    FROM public.family_groups fg
   WHERE fg.id = v_family;

  RETURN COALESCE(v_out, jsonb_build_object('family_id', v_family));
END;
$$;

-- 2) pilot_my_family_preferences_set(...) → upsert own family's preferences.
-- Empty strings are stored as NULL (cleared field). Over-long input rejected.
CREATE OR REPLACE FUNCTION public.pilot_my_family_preferences_set(
  p_preferred_delivery_time text,
  p_veg_notes               text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_family uuid;
  v_time  text := NULLIF(btrim(COALESCE(p_preferred_delivery_time, '')), '');
  v_notes text := NULLIF(btrim(COALESCE(p_veg_notes, '')), '');
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF COALESCE(char_length(v_time), 0) > 120
     OR COALESCE(char_length(v_notes), 0) > 500 THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active'
   LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.family_groups fg
     SET preferred_delivery_time = v_time,
         veg_notes               = v_notes,
         updated_at              = now()
   WHERE fg.id = v_family;

  SELECT jsonb_build_object(
           'family_id', fg.id,
           'preferred_delivery_time', fg.preferred_delivery_time,
           'veg_notes', fg.veg_notes
         )
    INTO v_out
    FROM public.family_groups fg
   WHERE fg.id = v_family;

  RETURN v_out;
END;
$$;

-- 3) Grants — least privilege, same shape as contact RPCs (00106).
REVOKE ALL ON FUNCTION public.pilot_my_family_preferences_get() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_family_preferences_get() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_family_preferences_get() TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_my_family_preferences_set(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_family_preferences_set(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_family_preferences_set(text, text) TO authenticated;

-- 4) pilot_admin_family_preferences_get(p_family_id) → admin read of one
-- family's preferences (+ updated_at) for the Ops admin surface.
CREATE OR REPLACE FUNCTION public.pilot_admin_family_preferences_get(
  p_family_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF public.fn_admin_uid() IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
           'family_id', fg.id,
           'preferred_delivery_time', fg.preferred_delivery_time,
           'veg_notes', fg.veg_notes,
           'updated_at', fg.updated_at
         )
    INTO v_out
    FROM public.family_groups fg
   WHERE fg.id = p_family_id;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'FAMILY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_admin_family_preferences_get(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_family_preferences_get(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_family_preferences_get(uuid) TO authenticated;
