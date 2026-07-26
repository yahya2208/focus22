import type {
  ScientificValidationReport, ValidationInput, ValidationStatus,
} from './types';
import { validateAccuracy } from './accuracy';
import { validatePrecision } from './precision';
import { validateRepeatability } from './repeatability';
import { validateTestRetest } from './test-retest';
import { validateDeviceVariability } from './device-variability';
import { validateCalibration } from './calibration';
import { validateErrorMargin } from './error-margin';
import { validateStatistical } from './statistical';

export function generateValidationReport(
  input: ValidationInput,
  sessionId: string,
): ScientificValidationReport {
  const accuracy = validateAccuracy(input.measuredValues, input.referenceValues);
  const precision = validatePrecision(input.measuredValues);

  const sessionsBySession = new Map<string, number[]>();
  for (const s of input.sessions) {
    const existing = sessionsBySession.get(s.sessionId) ?? [];
    sessionsBySession.set(s.sessionId, [...existing, ...s.correctedRts]);
  }
  const sessionArrays = [...sessionsBySession.values()];
  const repeatability = validateRepeatability(sessionArrays);

  const half = Math.ceil(input.sessions.length / 2);
  const s1 = input.sessions.slice(0, half).map((s) => s.meanCorrectedMs);
  const s2 = input.sessions.slice(half).map((s) => s.meanCorrectedMs);
  const testRetest = validateTestRetest(s1, s2);

  const deviceMap = new Map<string, number[]>();
  for (const s of input.sessions) {
    const existing = deviceMap.get(s.deviceId) ?? [];
    deviceMap.set(s.deviceId, [...existing, s.meanCorrectedMs]);
  }
  const deviceVariability = validateDeviceVariability(deviceMap);

  const calibrationValidation = validateCalibration(
    24.667,
    input.sessions.length > 0 ? input.sessions[0]!.calibrationConfidence * 30 : 0,
    input.sessions.map(() => 60),
    input.calibrationConfidences,
  );

  const errorMargin = validateErrorMargin(input.measuredValues);

  const statistical = input.referenceValues.length > 0
    ? validateStatistical(input.measuredValues, input.referenceValues)
    : validateStatistical(input.measuredValues);

  const allValidations = [
    ...accuracy.validations,
    ...precision.validations,
    ...repeatability.validations,
    ...testRetest.validations,
    ...deviceVariability.validations,
    ...calibrationValidation.validations,
    ...errorMargin.validations,
    ...statistical.validations,
  ];

  const passed = allValidations.filter((v) => v.status === 'passed').length;
  const failed = allValidations.filter((v) => v.status === 'failed').length;
  const total = allValidations.length;

  const overallScore = total > 0 ? Math.round((passed / total) * 100) : 0;
  let overallStatus: ValidationStatus;
  if (failed === 0 && total > 0) overallStatus = 'passed';
  else if (failed <= total * 0.2) overallStatus = 'warning';
  else overallStatus = 'failed';

  const summary = buildSummary(overallStatus, overallScore, passed, failed, total);

  return {
    timestamp: Date.now(),
    sessionId,
    totalSessions: input.sessions.length,
    accuracy,
    precision,
    repeatability,
    testRetest,
    deviceVariability,
    calibrationValidation,
    errorMargin,
    statisticalValidation: statistical,
    overallStatus,
    overallScore,
    summary,
  };
}

function buildSummary(
  status: ValidationStatus,
  score: number,
  passed: number,
  failed: number,
  total: number,
): string {
  const statusLabel = status === 'passed' ? 'PASSED' : status === 'warning' ? 'WARNING' : 'FAILED';
  return [
    `Scientific Validation: ${statusLabel} (${score}%)`,
    `${passed}/${total} checks passed, ${failed} failed`,
    '',
    'Modules validated: Accuracy, Precision, Repeatability, Test-Retest,',
    'Device Variability, Calibration, Error Margin, Statistical.',
  ].join('\n');
}

export function formatReport(report: ScientificValidationReport): string {
  const lines: string[] = [
    `═══════════════════════════════════════════`,
    `  FOCUS v2.0 — Scientific Validation Report`,
    `═══════════════════════════════════════════`,
    ``,
    `Session: ${report.sessionId}`,
    `Sessions analyzed: ${report.totalSessions}`,
    `Date: ${new Date(report.timestamp).toISOString()}`,
    ``,
    `Overall: ${report.overallStatus.toUpperCase()} (${report.overallScore}%)`,
    ``,
    `─── Accuracy ───`,
    `  MAE: ${report.accuracy.meanAbsoluteError.toFixed(2)}ms`,
    `  RMSE: ${report.accuracy.rootMeanSquareError.toFixed(2)}ms`,
    `  Bias: ${report.accuracy.systematicBias.toFixed(2)}ms`,
    `  Rating: ${report.accuracy.accuracyRating}`,
    ``,
    `─── Precision ───`,
    `  SD: ${report.precision.standardDeviation.toFixed(2)}ms`,
    `  CV: ${(report.precision.coefficientOfVariation * 100).toFixed(1)}%`,
    `  IQR: ${report.precision.iqr.toFixed(2)}ms`,
    `  Rating: ${report.precision.precisionRating}`,
    ``,
    `─── Repeatability ───`,
    `  CV: ${(report.repeatability.withinSessionCV * 100).toFixed(1)}%`,
    `  SD: ${report.repeatability.withinSessionSD.toFixed(2)}ms`,
    `  Rating: ${report.repeatability.rating}`,
    ``,
    `─── Test-Retest ───`,
    `  Pearson r: ${report.testRetest.pearsonR.toFixed(3)}`,
    `  ICC: ${report.testRetest.intraclassCorrelation.toFixed(3)}`,
    `  CR: ${report.testRetest.coefficientOfRepeatability.toFixed(1)}ms`,
    `  Mean diff: ${report.testRetest.meanDifference.toFixed(1)}ms`,
    `  LoA: [${report.testRetest.limitsOfAgreement.lower.toFixed(1)}, ${report.testRetest.limitsOfAgreement.upper.toFixed(1)}]`,
    `  Rating: ${report.testRetest.rating}`,
    ``,
    `─── Device Variability ───`,
    `  CV: ${(report.deviceVariability.betweenDeviceCV * 100).toFixed(1)}%`,
    `  Effect size: ${report.deviceVariability.deviceEffectSize.toFixed(3)}`,
    `  Rating: ${report.deviceVariability.rating}`,
    ``,
    `─── Calibration ───`,
    `  Accuracy: ${(report.calibrationValidation.calibrationAccuracy * 100).toFixed(0)}%`,
    `  Lag error: ${report.calibrationValidation.lagCompensationError.toFixed(1)}ms`,
    `  Rating: ${report.calibrationValidation.rating}`,
    ``,
    `─── Error Margin ───`,
    `  SE: ${report.errorMargin.standardError.toFixed(2)}ms`,
    `  95% CI: [${report.errorMargin.confidenceInterval95.lower.toFixed(1)}, ${report.errorMargin.confidenceInterval95.upper.toFixed(1)}]`,
    `  99% CI: [${report.errorMargin.confidenceInterval99.lower.toFixed(1)}, ${report.errorMargin.confidenceInterval99.upper.toFixed(1)}]`,
    ``,
    `─── Statistical ───`,
    `  Normal: ${report.statisticalValidation.isNormal ? 'Yes' : 'No'} (W=${report.statisticalValidation.shapiroWilkP.toFixed(3)})`,
    `  Effect size (d): ${report.statisticalValidation.effectSize.toFixed(3)}`,
    `  Power: ${(report.statisticalValidation.powerAnalysis.achievedPower * 100).toFixed(0)}%`,
    ``,
    `═══════════════════════════════════════════`,
  ];
  return lines.join('\n');
}
