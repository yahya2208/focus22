-- ============================================================================
-- 00044 — SESSION SCIENCE: device_id + calibration_confidence
--
-- Adds two optional fields to the record_scientific_session RPC:
--   1. p_device_id (text, default NULL) — anonymous browser fingerprint hash
--      written to the existing sessions.device_id column (text, nullable).
--   2. calibration_confidence (real 0..1) — carried inside p_scientific_results
--      JSONB and validated server-side.
--
-- Backward-compatible: both params are optional. Existing callers that omit
-- them continue to work identically (NULL device_id, NULL confidence).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_scientific_session(
--     text, text, timestamptz, timestamptz, jsonb, jsonb, text);
--   -- then re-create the 6-param version from 00041.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_scientific_session(
  p_session_id         text,
  p_plugin_id          text,
  p_created_at         timestamptz,
  p_finished_at        timestamptz,
  p_measurements       jsonb,
  p_scientific_results jsonb,
  p_device_id          text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_raw      jsonb := p_measurements->'raw_rts';
  v_corr     jsonb := p_measurements->'corrected_rts';
  v_existing public.sessions%ROWTYPE;
  v_n        integer;
  i          integer;
  v_val      double precision;
BEGIN
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

  IF p_scientific_results ? 'calibration_confidence' THEN
    v_val := (p_scientific_results->>'calibration_confidence')::double precision;
    IF v_val IS NULL OR v_val < 0 OR v_val > 1 THEN
      RAISE EXCEPTION 'INVALID_CALIBRATION_CONFIDENCE';
    END IF;
  END IF;

  IF p_created_at  < now() - interval '6 hours'
     OR p_created_at  > now() + interval '5 minutes'
     OR p_finished_at > now() + interval '5 minutes'
     OR p_finished_at <= p_created_at THEN
    RAISE EXCEPTION 'TIMESTAMP_OUT_OF_WINDOW';
  END IF;

  SELECT * INTO v_existing FROM public.sessions WHERE id = p_session_id;
  IF FOUND THEN
    IF v_existing.status = 'completed'
       AND v_existing.plugin_id          IS NOT DISTINCT FROM btrim(p_plugin_id)
       AND v_existing.created_at         IS NOT DISTINCT FROM p_created_at
       AND v_existing.finished_at        IS NOT DISTINCT FROM p_finished_at
       AND v_existing.measurements       IS NOT DISTINCT FROM p_measurements
       AND v_existing.scientific_results IS NOT DISTINCT FROM p_scientific_results THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';
  END IF;

  BEGIN
    INSERT INTO public.sessions
      (id, user_id, plugin_id, status, measurements, scientific_results,
       metadata, device_id, created_at, updated_at, finished_at, version)
    VALUES (
      p_session_id, v_uid, btrim(p_plugin_id), 'completed',
      p_measurements, p_scientific_results,
      jsonb_build_object('version', '2.0', 'source', 'web-app'),
      p_device_id,
      p_created_at, now(), p_finished_at, '2.0');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_scientific_session(text, text, timestamptz, timestamptz, jsonb, jsonb, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_scientific_session(text, text, timestamptz, timestamptz, jsonb, jsonb, text)
  TO anon, authenticated;

COMMIT;
