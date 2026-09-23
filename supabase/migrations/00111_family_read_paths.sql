-- ============================================================================
-- GATE V1.8 — FAMILY READ PATHS (repeat order + admin ledger history).
-- Additive ONLY: two read-only SECURITY DEFINER RPCs. No table/column/policy
-- changes, no writes anywhere, no existing RPC touched.
--
-- 1) pilot_family_order_items(p_order_id): the caller's OWN family order
--    lines (or any order for admins) for repeat-to-cart. Cancelled orders
--    are rejected — repeat must start from a fulfilled/fulfillable order.
--    Prices are display snapshots ONLY: submit re-resolves authoritatively.
-- 2) pilot_admin_family_ledger(p_family_id): admin-only ledger history for
--    one family (append-only reads; SUM(ledger.amount) untouched).
-- Order: after 00105 (family RPC conventions). NOT applied to any DB by file.
-- ============================================================================

-- 1) Family order lines for repeat-to-cart (owner family or admin only).
CREATE OR REPLACE FUNCTION public.pilot_family_order_items(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_order_family uuid;
  v_status text;
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.family_id, o.status INTO v_order_family, v_status
    FROM public.orders o
   WHERE o.id = p_order_id;
  IF v_order_family IS NULL AND v_status IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be the owning active principal, or an admin. Guests and
  -- other families are rejected here — never by RLS (RPC-only access).
  IF public.fn_admin_uid() IS NULL THEN
    SELECT fm.family_id INTO v_family
      FROM public.family_members fm
     WHERE fm.user_id = v_uid AND fm.status = 'active'
     LIMIT 1;
    IF v_family IS NULL OR v_family IS DISTINCT FROM v_order_family THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.created_at ASC), '[]'::jsonb)
    INTO v_out
  FROM (
    SELECT jsonb_build_object(
             'catalog_ref', oi.catalog_ref,
             'name', oi.name,
             'name_ar', oi.name_ar,
             'quantity', oi.quantity,
             'unit', ii.unit,
             'unit_price', oi.unit_price
           ) AS row,
           oi.created_at AS created_at
      FROM public.order_items oi
      LEFT JOIN public.inventory_items ii
        ON ii.id = CASE
                     WHEN oi.catalog_ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                     THEN oi.catalog_ref::uuid
                   END
     WHERE oi.order_id = p_order_id
  ) sub;

  RETURN jsonb_build_object('order_id', p_order_id, 'items', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_order_items(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_order_items(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_order_items(uuid) TO authenticated;

-- 2) Admin ledger history for one family (read-only, newest first).
CREATE OR REPLACE FUNCTION public.pilot_admin_family_ledger(
  p_family_id uuid,
  p_limit     integer DEFAULT 100
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

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.created_at DESC), '[]'::jsonb)
    INTO v_out
  FROM (
    SELECT jsonb_build_object(
             'id', l.id,
             'created_at', l.created_at,
             'transaction_type', l.transaction_type,
             'amount', l.amount,
             'related_order_id', l.related_order_id,
             'order_number', o.order_number,
             'reference', l.reference,
             'note', l.note,
             'balance_after', l.balance_after
           ) AS row,
           l.created_at AS created_at
      FROM public.ledger l
      LEFT JOIN public.orders o ON o.id = l.related_order_id
     WHERE l.family_id = p_family_id
     ORDER BY l.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ) sub;

  RETURN jsonb_build_object('family_id', p_family_id, 'entries', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_family_ledger(uuid, integer) TO authenticated;
