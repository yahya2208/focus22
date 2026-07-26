export type ValidationStatus = 'pending' | 'passed' | 'failed' | 'warning';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ValidationResult {
  readonly metric: string;
  readonly value: number;
  readonly threshold: number;
  readonly status: ValidationStatus;
  readonly message: string;
  readonly confidence: ConfidenceLevel;
}

export interface AccuracyResult {
  readonly meanAbsoluteError: number;
  readonly meanSignedError: number;
  readonly rootMeanSquareError: number;
  readonly systematicBias: number;
  readonly accuracyRating: 'excellent' | 'good' | 'acceptable' | 'poor';
  readonly validations: readonly ValidationResult[];
}

export interface PrecisionResult {
  readonly standardDeviation: number;
  readonly coefficientOfVariation: number;
  readonly iqr: number;
  readonly precisionRating: 'excellent' | 'good' | 'acceptable' | 'poor';
  readonly validations: readonly ValidationResult[];
}

export interface RepeatabilityResult {
  readonly withinSessionCV: number;
  readonly withinSessionSD: number;
  readonly rating: 'excellent' | 'good' | 'acceptable' | 'poor';
  readonly validations: readonly ValidationResult[];
}

export interface TestRetestResult {
  readonly pearsonR: number;
  readonly intraclassCorrelation: number;
  readonly coefficientOfRepeatability: number;
  readonly meanDifference: number;
  readonly limitsOfAgreement: { readonly lower: number; readonly upper: number };
  readonly rating: 'excellent' | 'good' | 'acceptable' | 'poor';
  readonly validations: readonly ValidationResult[];
}

export interface DeviceVariabilityResult {
  readonly betweenDeviceCV: number;
  readonly betweenDeviceSD: number;
  readonly deviceEffectSize: number;
  readonly rating: 'low' | 'moderate' | 'high';
  readonly validations: readonly ValidationResult[];
}

export interface CalibrationValidationResult {
  readonly calibrationAccuracy: number;
  readonly lagCompensationError: number;
  readonly refreshRateConsistency: number;
  readonly confidenceCalibrationCorrelation: number;
  readonly rating: 'valid' | 'marginal' | 'invalid';
  readonly validations: readonly ValidationResult[];
}

export interface ErrorMarginResult {
  readonly marginOfError95: number;
  readonly marginOfError99: number;
  readonly standardError: number;
  readonly confidenceInterval95: { readonly lower: number; readonly upper: number };
  readonly confidenceInterval99: { readonly lower: number; readonly upper: number };
  readonly validations: readonly ValidationResult[];
}

export interface StatisticalValidationResult {
  readonly shapiroWilkP: number;
  readonly isNormal: boolean;
  readonly mannWhitneyU: number | null;
  readonly effectSize: number;
  readonly powerAnalysis: { readonly requiredN: number; readonly achievedPower: number };
  readonly validations: readonly ValidationResult[];
}

export interface ScientificValidationReport {
  readonly timestamp: number;
  readonly sessionId: string;
  readonly totalSessions: number;
  readonly accuracy: AccuracyResult;
  readonly precision: PrecisionResult;
  readonly repeatability: RepeatabilityResult;
  readonly testRetest: TestRetestResult;
  readonly deviceVariability: DeviceVariabilityResult;
  readonly calibrationValidation: CalibrationValidationResult;
  readonly errorMargin: ErrorMarginResult;
  readonly statisticalValidation: StatisticalValidationResult;
  readonly overallStatus: ValidationStatus;
  readonly overallScore: number;
  readonly summary: string;
}

export interface ValidationInput {
  readonly measuredValues: readonly number[];
  readonly referenceValues: readonly number[];
  readonly sessions: readonly ValidationSession[];
  readonly deviceIds: readonly string[];
  readonly calibrationConfidences: readonly number[];
}

export interface ValidationSession {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly correctedRts: readonly number[];
  readonly meanCorrectedMs: number;
  readonly calibrationConfidence: number;
  readonly timestamp: number;
}
