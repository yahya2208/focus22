import { describe, it, expect, vi } from 'vitest';
import { createTelemetryService, getGlobalTelemetry, resetGlobalTelemetry } from '../../core/telemetry';

describe('TelemetryService', () => {
  it('should track events', () => {
    const telemetry = createTelemetryService();
    telemetry.track('app_opened');
    telemetry.track('game_started', { pluginId: 'reaction-light' });
    expect(telemetry.getQueue()).toHaveLength(2);
  });

  it('should auto-flush at batch size', () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const telemetry = createTelemetryService(sendFn, { batchSize: 3 });
    telemetry.track('app_opened');
    telemetry.track('game_started');
    telemetry.track('game_completed');
    expect(sendFn).toHaveBeenCalled();
  });

  it('should flush manually', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const telemetry = createTelemetryService(sendFn);
    telemetry.track('app_opened');
    await telemetry.flush();
    expect(sendFn).toHaveBeenCalled();
    expect(telemetry.getQueue()).toHaveLength(0);
  });

  it('should not track when disabled', () => {
    const telemetry = createTelemetryService(undefined, { enabled: false });
    telemetry.track('app_opened');
    expect(telemetry.getQueue()).toHaveLength(0);
  });

  it('should set context', () => {
    const telemetry = createTelemetryService();
    telemetry.setContext('user-1', 'session-1', 'device-1');
    telemetry.track('game_started');
    const event = telemetry.getQueue()[0];
    expect(event?.userId).toBe('user-1');
    expect(event?.sessionId).toBe('session-1');
    expect(event?.deviceId).toBe('device-1');
  });

  it('should update config', () => {
    const telemetry = createTelemetryService();
    telemetry.setConfig({ enabled: false, batchSize: 50 });
    expect(telemetry.getConfig().enabled).toBe(false);
    expect(telemetry.getConfig().batchSize).toBe(50);
  });

  it('should retry on send failure', async () => {
    let callCount = 0;
    const sendFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network error');
    });
    const telemetry = createTelemetryService(sendFn, { batchSize: 1 });
    telemetry.track('app_opened');
    await telemetry.flush();
    expect(telemetry.getQueue()).toHaveLength(1);
  });
});

describe('Global Telemetry', () => {
  it('should create singleton', () => {
    resetGlobalTelemetry();
    const t1 = getGlobalTelemetry();
    const t2 = getGlobalTelemetry();
    expect(t1).toBe(t2);
  });

  it('should reset singleton', () => {
    const t1 = getGlobalTelemetry();
    resetGlobalTelemetry();
    const t2 = getGlobalTelemetry();
    expect(t1).not.toBe(t2);
  });
});
