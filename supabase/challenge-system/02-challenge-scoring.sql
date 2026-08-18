-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P2 — EXACT SCORING FUNCTION)
--
-- Type: Additive (CREATE FUNCTION only)
-- Status: P2 APPLY
--
-- PURPOSE
--   Faithfully reimplements the client-side scoring algorithm in PL/pgSQL.
--   This function is IMMUTABLE — same inputs always produce same outputs.
--
-- ALGORITHM SOURCE (must stay in sync):
--   src/core/engine/scoring.ts      — calculateFocusScore, normalizeRT, determineGrade
--   src/core/engine/consistency.ts  — analyzeConsistency (CV-based)
--   src/core/engine/fatigue.ts      — detectFatigue (block regression)
--   src/core/engine/reaction.ts     — processReactions (RT correction)
--   src/core/scientific/constants.ts — all thresholds and weights
--
-- PARITY GUARANTEE
--   For identical inputs (raw_rts, display_lag_ms, input_lag_ms), this function
--   MUST return the exact same focus_score, grade, rt_score, consistency_score,
--   and fatigue_score as the client pipeline:
--     processReactions → analyzeConsistency → detectFatigue → calculateFocusScore
--
--   Test vectors are in src/__tests__/challenge/scoring-parity.test.ts
--
-- SECURITY
--   IMMUTABLE — no side effects, no auth checks, no table access.
--   Safe to call from any SECURITY DEFINER RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_challenge_score(
  p_raw_rts        integer[],
  p_display_lag_ms double precision,
  p_input_lag_ms   double precision
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n              integer := array_length(p_raw_rts, 1);
  v_corrected      double precision[];
  v_i              integer;
  v_val            double precision;
  -- Consistency variables
  v_sum            double precision := 0;
  v_mean           double precision;
  v_sum_sq         double precision := 0;
  v_sd             double precision;
  v_cv             double precision;
  v_consistency_score integer;
  -- Fatigue variables
  v_block_size     integer;
  v_blocks         double precision[];
  v_block_start    integer;
  v_block_sum      double precision;
  v_block_count    integer;
  v_nb             integer;
  v_bx_sum         double precision := 0;
  v_by_sum         double precision := 0;
  v_bxy_sum        double precision := 0;
  v_bx2_sum        double precision := 0;
  v_slope          double precision;
  v_fatigue_index  double precision;
  v_fatigue_score  integer;
  -- Final score variables
  v_clamped        double precision;
  v_rt_score       integer;
  v_focus_score    integer;
  v_grade          text;
BEGIN
  -- ========================================================================
  -- STEP 1: RT Correction
  -- Source: processReactions() in reaction.ts
  --   corrected = rawRts.map(rt => Math.max(0, rt - displayLagMs - inputLagMs))
  -- ========================================================================
  v_corrected := ARRAY[]::double precision[];
  FOR v_i IN 1..v_n LOOP
    v_val := GREATEST(0, p_raw_rts[v_i]::double precision - p_display_lag_ms - p_input_lag_ms);
    v_corrected := array_append(v_corrected, v_val);
  END LOOP;

  -- ========================================================================
  -- STEP 2: Consistency Score
  -- Source: analyzeConsistency() in consistency.ts
  --
  -- CRITICAL PARITY NOTE: The client computes mean and SD on the FULL
  -- correctedRts array (including zeros and outliers), NOT on clean values.
  -- The outlier detection (IQR) is performed but its results are only stored
  -- in the return object — they do NOT affect the CV or consistency score.
  --
  --   mean = correctedRts.reduce(a,b => a+b, 0) / correctedRts.length
  --   sd = sqrt(sum((x-mean)^2) / (N-1))     ← sample SD
  --   cv = sd / mean                           ← 0 if mean=0
  --   score: cv<=0.1→95, cv<=0.2→80, cv<=0.3→60, else→30
  -- ========================================================================

  -- Mean of ALL corrected values (including zeros)
  FOR v_i IN 1..v_n LOOP
    v_sum := v_sum + v_corrected[v_i];
  END LOOP;
  v_mean := v_sum / v_n;

  -- Sample standard deviation (N-1 denominator) on ALL values
  IF v_n >= 2 THEN
    FOR v_i IN 1..v_n LOOP
      v_sum_sq := v_sum_sq + (v_corrected[v_i] - v_mean) ^ 2;
    END LOOP;
    v_sd := sqrt(v_sum_sq / (v_n - 1));
  ELSE
    v_sd := 0;
  END IF;

  -- Coefficient of variation
  v_cv := CASE WHEN v_mean > 0 THEN v_sd / v_mean ELSE 0 END;

  -- Consistency rating (exact thresholds from constants.ts)
  v_consistency_score := CASE
    WHEN v_cv <= 0.1 THEN 95   -- excellent
    WHEN v_cv <= 0.2 THEN 80   -- good
    WHEN v_cv <= 0.3 THEN 60   -- fair
    ELSE 30                     -- poor
  END;

  -- ========================================================================
  -- STEP 3: Fatigue Score
  -- Source: detectFatigue() in fatigue.ts
  --
  --   if N < 5: score = 100 (no fatigue possible)
  --   blockSize = ceil(N / 3)
  --   Split into blocks, compute block averages
  --   Linear regression: slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX^2)
  --     where x = 0, 1, 2, ... (0-indexed block positions)
  --   fatigueIndex = clamp(-slope / abs(SLOPE_THRESHOLD), 0, 1)
  --     = clamp(-slope / 0.05, 0, 1)
  --   score = round((1 - fatigueIndex) * 100)
  -- ========================================================================
  IF v_n < 5 THEN
    v_fatigue_score := 100;
  ELSE
    v_block_size := GREATEST(1, ceil(v_n::double precision / 3)::integer);
    v_blocks := ARRAY[]::double precision[];
    v_block_start := 1;

    WHILE v_block_start <= v_n LOOP
      v_block_sum := 0;
      v_block_count := 0;
      FOR v_i IN v_block_start..LEAST(v_block_start + v_block_size - 1, v_n) LOOP
        v_block_sum := v_block_sum + v_corrected[v_i];
        v_block_count := v_block_count + 1;
      END LOOP;
      IF v_block_count > 0 THEN
        v_blocks := array_append(v_blocks, v_block_sum / v_block_count);
      END IF;
      v_block_start := v_block_start + v_block_size;
    END LOOP;

    -- Linear regression on (x=0,1,2,..., y=blockAvg)
    -- slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX^2)
    v_nb := array_length(v_blocks, 1);
    FOR v_i IN 1..v_nb LOOP
      v_bx_sum := v_bx_sum + (v_i - 1);                          -- x = 0-indexed
      v_by_sum := v_by_sum + v_blocks[v_i];                       -- y = block average
      v_bxy_sum := v_bxy_sum + (v_i - 1) * v_blocks[v_i];        -- x*y
      v_bx2_sum := v_bx2_sum + (v_i - 1) ^ 2;                    -- x^2
    END LOOP;

    IF v_nb >= 2 AND (v_nb * v_bx2_sum - v_bx_sum ^ 2) != 0 THEN
      v_slope := (v_nb * v_bxy_sum - v_bx_sum * v_by_sum)
               / (v_nb * v_bx2_sum - v_bx_sum ^ 2);
    ELSE
      v_slope := 0;
    END IF;

    -- fatigueIndex = clamp(-slope / 0.05, 0, 1)
    v_fatigue_index := GREATEST(0, LEAST(1, -v_slope / 0.05));

    -- score = round((1 - fatigueIndex) * 100)
    v_fatigue_score := ROUND((1 - v_fatigue_index) * 100);
  END IF;

  -- ========================================================================
  -- STEP 4: RT Score
  -- Source: normalizeRT() in scoring.ts
  --
  --   clamped = Math.min(400, Math.max(150, meanCorrectedMs))
  --   normalized = 1 - (clamped - 150) / (400 - 150)
  --   rtScore = Math.round(normalized * 100)
  -- ========================================================================
  v_clamped := GREATEST(150, LEAST(400, v_mean));
  v_rt_score := ROUND((1.0 - (v_clamped - 150.0) / 250.0) * 100);

  -- ========================================================================
  -- STEP 5: Final Focus Score
  -- Source: calculateFocusScore() in scoring.ts
  --
  --   rtContribution = rtScore * 0.4
  --   consistencyContribution = consistencyScore * 0.3
  --   fatigueContribution = fatigueScore * 0.3
  --   focusScore = Math.round(rtContribution + consistencyContribution + fatigueContribution)
  -- ========================================================================
  v_focus_score := ROUND(
    v_rt_score * 0.4 + v_consistency_score * 0.3 + v_fatigue_score * 0.3
  );
  v_focus_score := GREATEST(0, LEAST(100, v_focus_score));

  -- ========================================================================
  -- STEP 6: Grade
  -- Source: determineGrade() in scoring.ts
  --
  --   >= 90 → A, >= 80 → B, >= 70 → C, >= 60 → D, else → F
  -- ========================================================================
  v_grade := CASE
    WHEN v_focus_score >= 90 THEN 'A'
    WHEN v_focus_score >= 80 THEN 'B'
    WHEN v_focus_score >= 70 THEN 'C'
    WHEN v_focus_score >= 60 THEN 'D'
    ELSE 'F'
  END;

  -- ========================================================================
  -- RETURN
  -- ========================================================================
  RETURN jsonb_build_object(
    'focus_score',        v_focus_score,
    'grade',              v_grade,
    'rt_score',           v_rt_score,
    'consistency_score',  v_consistency_score,
    'fatigue_score',      v_fatigue_score
  );
END;
$$;
