-- ============================================================================
-- 00075 SECURITY HARDENING WAVE — WORKSTREAM B: function search_path hardening
--
-- Targets (both SECURITY INVOKER — no privilege-escalation surface today, but
-- mutable search_path is lint `function_search_path_mutable`):
--   * public.update_updated_at()        trigger; body = new.updated_at = now()
--   * public.inventory_calc_status()    sql immutable; body = pure CASE
--
-- Both bodies reference ONLY pg_catalog functions (now()) or row/param values,
-- and NOTHING that depends on the ambient search_path. Therefore
-- `SET search_path = ''` is a pure hardening: resolution cannot change.
-- Existing callers/triggers are untouched (same signature/behavior).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_calc_status(p_quantity integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT CASE WHEN p_quantity<=0 THEN 'out_of_stock' WHEN p_quantity<=3 THEN 'low_stock' ELSE 'in_stock' END;
$function$;

-- END 00075