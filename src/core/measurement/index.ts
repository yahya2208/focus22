import type { CalibrationProfile } from '../calibration';

export interface StimulusEvent {
  readonly type: 'STIMULUS_SHOWN';
  readonly timestamp: number;
  readonly roundIndex: number;
}

export interface InputEvent {
  readonly type: 'INPUT_RECEIVED';
  readonly timestamp: number;
  readonly roundIndex: number;
}

export interface RoundCompleteEvent {
  readonly type: 'ROUND_COMPLETE';
  readonly roundIndex: number;
  readonly rawRtMs: number;
  readonly correctedRtMs: number;
  readonly isValid: boolean;
}

export interface SessionCompleteEvent {
  readonly type: 'SESSION_COMPLETE';
  readonly totalRounds: number;
  readonly validRounds: number;
}

export type GameEvent = StimulusEvent | InputEvent | RoundCompleteEvent | SessionCompleteEvent;

export interface MeasurementResult {
  readonly rawRtMs: number;
  readonly correctedRtMs: number;
  readonly confidence: number;
  readonly isValid: boolean;
  readonly calibration: CalibrationProfile;
}

export function correctReactionTime(
  rawRtMs: number,
  calibration: CalibrationProfile,
): MeasurementResult {
  const correctedRtMs = rawRtMs - calibration.displayLagMs - calibration.inputLagMs;
  const isValid = correctedRtMs > 0;
  return {
    rawRtMs,
    correctedRtMs: Math.max(0, correctedRtMs),
    confidence: calibration.confidence,
    isValid,
    calibration,
  };
}
