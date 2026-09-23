-- ============================================================================
-- GATE V1.3 — FAMILY CONTACT PROFILE (staging family checkout prefill).
-- Additive ONLY: 4 nullable contact columns on public.family_groups + 2
-- member-scoped SECURITY DEFINER RPCs (get/set own family's contact).
-- Scope proof: family resolved SOLELY from auth.uid() via active
-- family_members row — a member can never read or write another family.
-- Touches NOTHING financial: no money-table changes, no balance logic, no settlement changes, no access-control changes
-- changes, no RLS policy changes (RPC-only access like pilot_my_family).
-- Order: after 00100 (family_members) and 00105 (family RPC conventions).
-- Depends on: public.family_groups(id), public.family_members(user_id,
--   family_id, status). NOT applied to any DB by this file alone.
-- ============================================================================

-- 1) Contact columns — nullable profile data, disjoint from money state.
ALTER TABLE public.family_groups
  ADD COLUMN IF NOT EXISTS contact_name    text,
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS contact_notes   text;

COMMENT ON COLUMN public.family_groups.contact_name IS
  'Family delivery contact profile (checkout prefill). Display-only; never part of money math.';
COMMENT ON COLUMN public.family_groups.contact_phone IS
  'Family delivery contact profile (checkout prefill). Display-only; never part of money math.';
COMMENT ON COLUMN public.family_groups.contact_address IS
  'Family delivery contact profile (checkout prefill). Display-only; never part of money math.';
COMMENT ON COLUMN public.family_groups.contact_notes IS
  'Family delivery contact profile (checkout prefill). Display-only; never part of money math.';

-- 2) pilot_my_family_contact_get() → own family's contact profile (or nulls).
CREATE OR REPLACE FUNCTION public.pilot_my_family_contact_get()
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
           'contact_name', fg.contact_name,
           'contact_phone', fg.contact_phone,
           'contact_address', fg.contact_address,
           'contact_notes', fg.contact_notes
         )
    INTO v_out
    FROM public.family_groups fg
   WHERE fg.id = v_family;

  RETURN COALESCE(v_out, jsonb_build_object('family_id', v_family));
END;
$$;

-- 3) pilot_my_family_contact_set(...) → upsert own family's contact profile.
-- Empty strings are stored as NULL (cleared field). Over-long input rejected.
CREATE OR REPLACE FUNCTION public.pilot_my_family_contact_set(
  p_name    text,
  p_phone   text,
  p_address text,
  p_notes   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_family  uuid;
  v_name    text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_phone   text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_address text := NULLIF(btrim(COALESCE(p_address, '')), '');
  v_notes   text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_out     jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF COALESCE(char_length(v_name), 0) > 200
     OR COALESCE(char_length(v_phone), 0) > 40
     OR COALESCE(char_length(v_address), 0) > 500
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
     SET contact_name    = v_name,
         contact_phone   = v_phone,
         contact_address = v_address,
         contact_notes   = v_notes,
         updated_at      = now()
   WHERE fg.id = v_family;

  SELECT jsonb_build_object(
           'family_id', fg.id,
           'contact_name', fg.contact_name,
           'contact_phone', fg.contact_phone,
           'contact_address', fg.contact_address,
           'contact_notes', fg.contact_notes
         )
    INTO v_out
    FROM public.family_groups fg
   WHERE fg.id = v_family;

  RETURN v_out;
END;
$$;

-- 4) Grants — least privilege, same shape as pilot_my_family/_account.
REVOKE ALL ON FUNCTION public.pilot_my_family_contact_get() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_family_contact_get() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_family_contact_get() TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_my_family_contact_set(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_family_contact_set(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_family_contact_set(text, text, text, text) TO authenticated;
