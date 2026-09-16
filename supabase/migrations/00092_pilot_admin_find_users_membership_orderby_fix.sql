-- ============================================================================
-- 00092 — Fix pilot_admin_find_users membership ORDER BY (GATE 5 fix).
--
-- Root cause: in `RETURN QUERY`, the derived tables `om` and `cm` expose
-- exactly ONE output column (`row`, jsonb), yet the aggregates referenced
-- `om.store_id` / `cm.store_id` in their ORDER BY — a column those subqueries
-- do not output. PostgreSQL resolves ORDER BY of an aggregate against the
-- aggregate's input columns at PLAN time, so every invocation failed with
-- `42703: column om.store_id does not exist` regardless of the data. The RPC
-- was unrunnable since its creation in 00081 (first surfaced by a live admin
-- call in Gate 5 TEST 3-2).
--
-- Change (single, surgical; everything else preserved verbatim from 00081):
--   * `jsonb_agg(om.row ORDER BY om.store_id)`            -> `jsonb_agg(om.row ORDER BY (om.row ->> 'store_id')::uuid)`
--   * `jsonb_agg(cm.row ORDER BY cm.store_id)`            -> `jsonb_agg(cm.row ORDER BY (cm.row ->> 'store_id')::uuid)`
--
-- Scope guard: only `pilot_admin_find_users(text,integer)` is redefined.
-- Signature `(text,integer)`, `RETURNS SETOF jsonb`, `STABLE`,
-- `SECURITY DEFINER`, `SET search_path = ''`, the `PERMISSION_DENIED`/`
-- ARGUMENTS_INVALID` guards, and the limit/email filtering logic are unchanged.
-- No ACL/RLS/RBAC/auth, no tables, no other RPC is touched. ACL lines below
-- reproduce 00081 exactly (idempotent; CREATE OR REPLACE preserves ACL anyway).
--
-- Authoritative definition: this file is the final CREATE of
-- `public.pilot_admin_find_users` (supersedes 00081).
-- Target: STAGING only. Applied manually; NOT committed/pushed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pilot_admin_find_users(
  p_email text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_max int;
  v_norm text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_max := p_limit;
  v_norm := NULLIF(btrim(lower(COALESCE(p_email, ''))), '');

  RETURN QUERY
    SELECT jsonb_build_object(
      'user_id',        u.id,
      'email',          u.email,
      'display_name',   u.display_name,
      'role',           u.role,
      'is_anonymous',   u.is_anonymous,
      'created_at',     u.created_at,
      'operator_memberships', COALESCE((
        SELECT jsonb_agg(om.row ORDER BY (om.row ->> 'store_id')::uuid)
        FROM (
          SELECT jsonb_build_object('store_id', pso.store_id, 'status', pso.status) AS row
          FROM public.pilot_store_operators pso
          WHERE pso.user_id = u.id
        ) om
      ), '[]'::jsonb),
      'courier_memberships', COALESCE((
        SELECT jsonb_agg(cm.row ORDER BY (cm.row ->> 'store_id')::uuid)
        FROM (
          SELECT jsonb_build_object('store_id', pc.store_id, 'status', pc.status) AS row
          FROM public.pilot_couriers pc
          WHERE pc.user_id = u.id
        ) cm
      ), '[]'::jsonb)
    )
    FROM public.users u
    WHERE (v_norm IS NULL OR lower(COALESCE(u.email, '')) = v_norm)
    ORDER BY u.created_at DESC
    LIMIT v_max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM anon;