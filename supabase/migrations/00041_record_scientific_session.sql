-- ============================================================================
-- 00041 — SESSION SCIENCE PERSISTENCE (Option C)
-- OWNER-AUTHORIZED EXECUTION 2026-08-25 ("AUTHORIZED TO IMPLEMENT" directive).
--
-- Scope: exactly ONE schema change + ONE SECURITY DEFINER RPC. Nothing else.
--   * sessions.user_id becomes nullable so anonymous organic gameplay can be
--     persisted without creating any persistent identity row.
--   * record_scientific_session() is the ONLY runtime write path:
--     completion-only (no create / heartbeat / abandon persistence).
--   * user_id is derived server-side from auth.uid(); never client-supplied.
--   * No device / calibration / campaign / placement / telemetry / analytics
--     fields are written. device_id, calibration_id, campaign_id,
--     placement_id remain NULL by default.
--
-- Validation contract (engine-exact, mirrors src/core/engine/*):
--   raw RT        100..2000   (REACTION.MIN_RT_MS / MAX_RT_MS)
--   corrected RT    0..2000
--   rounds          exactly 7 (TOTAL_ROUNDS; precedent: challenge RPCs pin 7)
--   grade           A | B | C | D | F            (scoring.ts determineGrade)
--   consistency_rating excellent|good|fair|poor  (consistency.ts rateConsistency)
--   scores          integer 0..100 (range only; engine value sets NOT pinned)
--   fatigue_index   real 0..1
--   mean/median corrected RT 0..2000
--   timestamp window: created_at within [now()-6h, now()+5min];
--                     finished_at <= now()+5min and strictly > created_at
--
-- Conflict semantics (owner decision D2-revised):
--   identical replay of an existing completed session -> silent idempotent no-op
--   same session id with ANY different payload        -> SESSION_ID_CONFLICT
--   no silent overwrite of an existing session ever.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_scientific_session(
--     text, text, timestamptz, timestamptz, jsonb, jsonb);
--   ALTER TABLE public.sessions ALTER COLUMN user_id SET NOT NULL;
--   -- the SET NOT NULL above fails while NULL user_id rows exist.
--
-- Post-apply verification (read-only):
--   SELECT proname FROM pg_proc WHERE proname = 'record_scientific_session';
--   SELECT attname, attnotnull FROM pg_attribute
--     WHERE attrelid = 'public.sessions'::regclass AND attname = 'user_id';
--     -- expected: attnotnull = f
-- ============================================================================

BEGIN;

-- (1) The single permitted schema change.
ALTER TABLE public.sessions ALTER COLUMN user_id DROP NOT NULL;

-- (2) The sole sanctioned runtime writer (completion-only).
CREATE OR REPLACE FUNCTION public.record_scientific_session(
  p_session_id         text,
  p_plugin_id          text,
  p_created_at         timestamptz,
  p_finished_at        timestamptz,
  p_measurements       jsonb,
  p_scientific_results jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();  -- server-derived ONLY; never client-supplied
  v_raw      jsonb := p_measurements->'raw_rts';
  v_corr     jsonb := p_measurements->'corrected_rts';
  v_existing public.sessions%ROWTYPE;
  v_n        integer;
  i          integer;
  v_val      double precision;
BEGIN
  -- ---- shape & bounds ------------------------------------------------------
  IF p_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR p_plugin_id IS NULL OR btrim(p_plugin_id) = '' OR length(p_plugin_id) > 64
     OR jsonb_typeof(v_raw) <> 'array'
     OR jsonb_typeof(v_corr) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_SESSION_PAYLOAD';
  END IF;

  v_n := jsonb_array_length(v_raw);
  IF v_n <> 7
     OR jsonb_array_length(v_corr) <> v_n
     OR (p_measurements->>'total_rounds')::int  <> v_n
     OR (p_measurements->>'valid_rounds')::int  NOT BETWEEN 0 AND v_n
     OR (p_measurements->>'outlier_count')::int NOT BETWEEN 0 AND v_n THEN
    RAISE EXCEPTION 'INVALID_ROUND_COUNTS';
  END IF;

  FOR i IN 1..v_n LOOP
    v_val := (v_raw->(i - 1))::text::double precision;
    IF v_val < 100 OR v_val > 2000 THEN
      RAISE EXCEPTION 'INVALID_RT_RANGE';
    END IF;
    v_val := (v_corr->(i - 1))::text::double precision;
    IF v_val IS NULL OR v_val < 0 OR v_val > 2000 THEN
      RAISE EXCEPTION 'INVALID_CORRECTED_RANGE';
    END IF;
  END LOOP;

  -- ---- scientific_results (engine-exact vocabularies) ----------------------
  IF (p_scientific_results->>'focus_score')::int              NOT BETWEEN 0 AND 100
     OR (p_scientific_results->>'fatigue_score')::int          NOT BETWEEN 0 AND 100
     OR (p_scientific_results->>'consistency_score')::int      NOT BETWEEN 0 AND 100
     OR (p_scientific_results->>'mean_corrected_ms')::double precision   NOT BETWEEN 0 AND 2000
     OR (p_scientific_results->>'median_corrected_ms')::double precision NOT BETWEEN 0 AND 2000
     OR (p_scientific_results->>'fatigue_index')::double precision       NOT BETWEEN 0 AND 1
     OR (p_scientific_results->>'grade') NOT IN ('A','B','C','D','F')
     OR (p_scientific_results->>'consistency_rating')
        NOT IN ('excellent','good','fair','poor') THEN
    RAISE EXCEPTION 'INVALID_RESULTS';
  END IF;

  -- ---- time window (tunables kept in one place) ----------------------------
  IF p_created_at  < now() - interval '6 hours'
     OR p_created_at  > now() + interval '5 minutes'
     OR p_finished_at > now() + interval '5 minutes'
     OR p_finished_at <= p_created_at THEN
    RAISE EXCEPTION 'TIMESTAMP_OUT_OF_WINDOW';
  END IF;

  -- ---- replay / conflict semantics -----------------------------------------
  SELECT * INTO v_existing FROM public.sessions WHERE id = p_session_id;
  IF FOUND THEN
    IF v_existing.status = 'completed'
       AND v_existing.plugin_id          IS NOT DISTINCT FROM btrim(p_plugin_id)
       AND v_existing.created_at         IS NOT DISTINCT FROM p_created_at
       AND v_existing.finished_at        IS NOT DISTINCT FROM p_finished_at
       AND v_existing.measurements       IS NOT DISTINCT FROM p_measurements
       AND v_existing.scientific_results IS NOT DISTINCT FROM p_scientific_results THEN
      RETURN;  -- exact idempotent replay
    END IF;
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';  -- different payload under same id
  END IF;

  BEGIN
    INSERT INTO public.sessions
      (id, user_id, plugin_id, status, measurements, scientific_results,
       metadata, created_at, updated_at, finished_at, version)
    VALUES (
      p_session_id, v_uid, btrim(p_plugin_id), 'completed',
      p_measurements, p_scientific_results,
      jsonb_build_object('version', '2.0', 'source', 'web-app'),
      p_created_at, now(), p_finished_at, '2.0');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';  -- concurrent race fallback
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_scientific_session(text, text, timestamptz, timestamptz, jsonb, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_scientific_session(text, text, timestamptz, timestamptz, jsonb, jsonb)
  TO anon, authenticated;

COMMIT;
