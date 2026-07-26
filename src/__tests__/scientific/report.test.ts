import { describe, it, expect } from 'vitest';
import { generateValidationReport, formatReport } from '../../core/scientific/validation/report';
import type { ValidationInput } from '../../core/scientific/validation/types';

function createTestInput(): ValidationInput {
  return {
    measuredValues: [200, 210, 205, 195, 208, 212, 198, 202, 215, 197],
    referenceValues: [198, 208, 203, 193, 206, 210, 196, 200, 213, 195],
    sessions: [
      { sessionId: 's1', deviceId: 'device-a', correctedRts: [200, 210, 205], meanCorrectedMs: 205, calibrationConfidence: 0.85, timestamp: 1000 },
      { sessionId: 's2', deviceId: 'device-a', correctedRts: [195, 208, 212], meanCorrectedMs: 205, calibrationConfidence: 0.88, timestamp: 2000 },
      { sessionId: 's3', deviceId: 'device-b', correctedRts: [198, 202, 215], meanCorrectedMs: 205, calibrationConfidence: 0.82, timestamp: 3000 },
    ],
    deviceIds: ['device-a', 'device-b'],
    calibrationConfidences: [0.85, 0.88, 0.82],
  };
}

describe('generateValidationReport', () => {
  it('should generate a complete report', () => {
    const report = generateValidationReport(createTestInput(), 'session-1');
    expect(report.sessionId).toBe('session-1');
    expect(report.totalSessions).toBe(3);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.summary).toContain('Scientific Validation');
  });

  it('should include all 8 modules', () => {
    const report = generateValidationReport(createTestInput(), 's1');
    expect(report.accuracy).toBeDefined();
    expect(report.precision).toBeDefined();
    expect(report.repeatability).toBeDefined();
    expect(report.testRetest).toBeDefined();
    expect(report.deviceVariability).toBeDefined();
    expect(report.calibrationValidation).toBeDefined();
    expect(report.errorMargin).toBeDefined();
    expect(report.statisticalValidation).toBeDefined();
  });

  it('should have overall status', () => {
    const report = generateValidationReport(createTestInput(), 's1');
    expect(['passed', 'warning', 'failed']).toContain(report.overallStatus);
  });

  it('should handle empty input', () => {
    const input: ValidationInput = {
      measuredValues: [],
      referenceValues: [],
      sessions: [],
      deviceIds: [],
      calibrationConfidences: [],
    };
    const report = generateValidationReport(input, 'empty');
    expect(report.overallScore).toBe(0);
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const report = generateValidationReport(createTestInput(), 's1');
    const after = Date.now();
    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('formatReport', () => {
  it('should format a readable text report', () => {
    const report = generateValidationReport(createTestInput(), 'session-1');
    const text = formatReport(report);
    expect(text).toContain('FOCUS v2.0');
    expect(text).toContain('Scientific Validation Report');
    expect(text).toContain('Accuracy');
    expect(text).toContain('Precision');
    expect(text).toContain('Repeatability');
    expect(text).toContain('Test-Retest');
    expect(text).toContain('Device Variability');
    expect(text).toContain('Calibration');
    expect(text).toContain('Error Margin');
    expect(text).toContain('Statistical');
  });

  it('should include session ID', () => {
    const report = generateValidationReport(createTestInput(), 'my-session');
    const text = formatReport(report);
    expect(text).toContain('my-session');
  });

  it('should include overall status', () => {
    const report = generateValidationReport(createTestInput(), 's1');
    const text = formatReport(report);
    expect(text).toMatch(/PASSED|WARNING|FAILED/);
  });
});
