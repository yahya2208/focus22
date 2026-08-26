import { analyzeConsistency } from '../core/engine/consistency';
import { detectFatigue } from '../core/engine/fatigue';
import { calculateFocusScore } from '../core/engine/scoring';
import { getSupabaseClient } from '../core/supabase/client';

/**
 * SESSION SCIENCE PERSISTENCE CARVE-OUT — owner-authorized 2026-08-25.
 * Extended 2026-08-26: added calibration_confidence and device_fingerprint
 * inside scientific_results JSONB (O4+O5). device_fingerprint is stored
 * inside the JSONB (no FK violation on sessions.device_id).
 *
 * This file is the ONLY sanctioned runtime writer besides services/qr-measurement.ts.
 * It calls exactly ONE approved SECURITY DEFINER RPC:
 *   record_scientific_session(p_session_id, p_plugin_id, p_created_at,
 *                             p_finished_at, p_measurements, p_scientific_results)
 *
 * Hard contract:
 *   - Completion-only. No create / heartbeat / abandon persistence.
 *   - Fire-and-forget: never throws, never awaited, never blocks the UI.
 *   - user_id is derived SERVER-SIDE from auth.uid(); this client NEVER sends
 *     any identity field (no user_id, email, token) and no tracking payload.
 *     device_fingerprint is an anonymous browser hash (no PII), stored in JSONB.
 *   - No enable/disable runtime seams by owner decision; tests isolate via
 *     mocking core/supabase/client only.
 */

export interface ScientificSessionResultsInput {
  readonly rawRts: readonly number[];
  readonly correctedRts: readonly number[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly sessionStart: number;
  readonly sessionEnd: number;
}

export interface ScientificSessionPayload {
  readonly sessionId: string;
  readonly gameMode: string;
  readonly results: ScientificSessionResultsInput;
  readonly deviceFingerprint?: string;
  readonly calibrationConfidence?: number;
}

interface ScientificSessionArgs {
  p_session_id: string;
  p_plugin_id: string;
  p_created_at: string;
  p_finished_at: string;
  p_measurements: {
    raw_rts: number[];
    corrected_rts: number[];
    total_rounds: number;
    valid_rounds: number;
    outlier_count: number;
  };
  p_scientific_results: {
    mean_corrected_ms: number;
    median_corrected_ms: number;
    consistency_score: number;
    consistency_rating: string;
    fatigue_index: number;
    fatigue_score: number;
    focus_score: number;
    grade: string;
    calibration_confidence?: number;
    device_fingerprint?: string;
  };
}

async function submitScientificSession(args: ScientificSessionArgs): Promise<void> {
  const { error } =
    await getSupabaseClient().rpc('record_scientific_session', args);

  if (error) {
    console.error('[session-science] RPC failed:', error.code, error.message, error.details);
  }
}

export function sendScientificSession(payload: ScientificSessionPayload): void {
  try {
    const { sessionId, gameMode, results, deviceFingerprint, calibrationConfidence } = payload;
    if (!sessionId || !gameMode || !results) return;

    const corrected = results.correctedRts;
    if (!Array.isArray(corrected) || corrected.length === 0) return;

    // Derivation lives in the sending layer, mirroring the historical writer
    // (the game itself never computes persistence fields).
    const consistency = analyzeConsistency(corrected);
    const fatigue = detectFatigue(corrected);
    const scoring = calculateFocusScore({
      meanCorrectedMs: consistency.meanMs,
      consistencyScore: consistency.score,
      fatigueScore: fatigue.score,
      totalRounds: results.totalRounds,
    });

    const sorted = [...corrected].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    void submitScientificSession({
      p_session_id: sessionId,
      p_plugin_id: gameMode,
      p_created_at: new Date(results.sessionStart).toISOString(),
      p_finished_at: new Date(results.sessionEnd).toISOString(),
      p_measurements: {
        raw_rts: [...results.rawRts],
        corrected_rts: [...corrected],
        total_rounds: results.totalRounds,
        valid_rounds: results.validRounds,
        outlier_count: consistency.outlierCount,
      },
      p_scientific_results: {
        mean_corrected_ms: consistency.meanMs,
        median_corrected_ms: median,
        consistency_score: consistency.score,
        consistency_rating: consistency.rating,
        fatigue_index: fatigue.fatigueIndex,
        fatigue_score: fatigue.score,
        focus_score: scoring.focusScore,
        grade: scoring.grade,
        ...(typeof calibrationConfidence === 'number' ? { calibration_confidence: calibrationConfidence } : {}),
        ...(deviceFingerprint ? { device_fingerprint: deviceFingerprint } : {}),
      },
    }).catch(() => {});
  } catch {
    // fire-and-forget: never throws
  }
}
