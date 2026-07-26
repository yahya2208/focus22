import type { AccuracyResult, ValidationResult, ValidationStatus, ConfidenceLevel } from './types';

function absMean(errors: readonly number[]): number {
  return errors.reduce((a, e) => a + Math.abs(e), 0) / errors.length;
}

function signedMean(errors: readonly number[]): number {
  return errors.reduce((a, e) => a + e, 0) / errors.length;
}

function rmse(errors: readonly number[]): number {
  const sumSq = errors.reduce((a, e) => a + e * e, 0);
  return Math.sqrt(sumSq / errors.length);
}

function classifyAccuracy(mae: number): AccuracyResult['accuracyRating'] {
  if (mae <= 5) return 'excellent';
  if (mae <= 15) return 'good';
  if (mae <= 30) return 'acceptable';
  return 'poor';
}

function makeValidation(metric: string, value: number, threshold: number, message: string): ValidationResult {
  const status: ValidationStatus = value <= threshold ? 'passed' : 'failed';
  const confidence: ConfidenceLevel = value <= threshold * 0.5 ? 'high' : value <= threshold ? 'medium' : 'low';
  return { metric, value, threshold, status, message, confidence };
}

export function validateAccuracy(
  measured: readonly number[],
  reference: readonly number[],
): AccuracyResult {
  if (measured.length === 0 || reference.length === 0 || measured.length !== reference.length) {
    return {
      meanAbsoluteError: 0,
      meanSignedError: 0,
      rootMeanSquareError: 0,
      systematicBias: 0,
      accuracyRating: 'poor',
      validations: [{ metric: 'accuracy.input', value: 0, threshold: 1, status: 'failed', message: 'Invalid input: empty or mismatched arrays', confidence: 'low' }],
    };
  }

  const errors = measured.map((m, i) => m - (reference[i] ?? 0));
  const mae = absMean(errors);
  const mse = signedMean(errors);
  const rootMSE = rmse(errors);

  const rating = classifyAccuracy(mae);

  const validations: ValidationResult[] = [
    makeValidation('accuracy.mae', mae, 15, `MAE of ${mae.toFixed(2)}ms — ${rating} for reaction time measurement`),
    makeValidation('accuracy.rmse', rootMSE, 20, `RMSE of ${rootMSE.toFixed(2)}ms reflects overall error magnitude`),
    makeValidation('accuracy.bias', Math.abs(mse), 10, `Systematic bias of ${mse.toFixed(2)}ms — ${Math.abs(mse) < 10 ? 'acceptable' : 'excessive'}`),
  ];

  return {
    meanAbsoluteError: mae,
    meanSignedError: mse,
    rootMeanSquareError: rootMSE,
    systematicBias: mse,
    accuracyRating: rating,
    validations,
  };
}
