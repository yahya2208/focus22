import { useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from './client';
import { collectDeviceProfile, type DeviceProfile } from '../device';
import type { CalibrationProfile } from '../calibration';
import { analyzeConsistency } from '../engine/consistency';
import { detectFatigue } from '../engine/fatigue';
import { calculateFocusScore } from '../engine/scoring';
import { getGlobalEventPublisher } from '../events';
import type { SessionCreatedPayload, SessionCompletedPayload } from '../session/service';

async function waitForUser(maxRetries = 10, intervalMs = 100): Promise<string | null> {
  const client = getSupabaseClient();
  for (let i = 0; i < maxRetries; i++) {
    const { data: { user } } = await client.auth.getUser();
    if (user) return user.id;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
}

async function ensureDeviceAndCalibration(userId: string, calibrationProfile: CalibrationProfile | null): Promise<{ deviceId: string | null; calibrationId: string | null }> {
  const client = getSupabaseClient();
  const deviceProfile: DeviceProfile = collectDeviceProfile();

  let deviceId: string | null = null;
  const { data: existingDevice } = await client
    .from('devices')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingDevice) {
    deviceId = existingDevice.id;
  } else {
    const { data: newDevice, error: deviceError } = await client
      .from('devices')
      .insert({
        user_id: userId,
        browser: deviceProfile.browser,
        browser_version: deviceProfile.browserVersion,
        os: deviceProfile.os,
        os_version: deviceProfile.osVersion,
        platform: deviceProfile.platform,
        screen_width: deviceProfile.screenWidth,
        screen_height: deviceProfile.screenHeight,
        pixel_ratio: deviceProfile.pixelRatio,
        refresh_rate: deviceProfile.refreshRate,
        touch_support: deviceProfile.touchSupport,
        pointer_type: deviceProfile.pointerType,
        cpu_cores: deviceProfile.cpuCores,
        memory_gb: deviceProfile.memoryGB,
        language: deviceProfile.language,
        timezone: deviceProfile.timezone,
        user_agent: deviceProfile.userAgent,
        collected_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!deviceError) {
      deviceId = newDevice.id;
    }
  }

  let calibrationId: string | null = null;

  if (deviceId) {
    const cal: CalibrationProfile = calibrationProfile ?? {
      refreshRate: 60, displayLagMs: 16.667, inputLagMs: 8,
      confidence: 0.5, platform: 'unknown', timestamp: Date.now(),
    };

    const { data: existingCal } = await client
      .from('calibrations')
      .select('id')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .limit(1)
      .maybeSingle();

    if (existingCal) {
      calibrationId = existingCal.id;
    } else {
      const { data: newCal, error: calError } = await client
        .from('calibrations')
        .insert({
          user_id: userId,
          device_id: deviceId,
          refresh_rate: cal.refreshRate,
          display_lag_ms: cal.displayLagMs,
          input_lag_ms: cal.inputLagMs,
          confidence: cal.confidence,
          platform: cal.platform,
          browser_name: deviceProfile.browser,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (!calError) {
        calibrationId = newCal.id;
      }
    }
  }

  return { deviceId, calibrationId };
}

export function PersistenceProvider({ children }: { children: React.ReactNode }) {
  const calRef = useRef<CalibrationProfile | null>(null);

  const handleSessionCreated = useCallback(async (payload: SessionCreatedPayload) => {
    const userId = await waitForUser();
    if (!userId) return;

    const { deviceId, calibrationId } = await ensureDeviceAndCalibration(userId, calRef.current);
    if (!deviceId) return;

    const client = getSupabaseClient();
    await client.from('sessions').insert({
      id: payload.sessionId,
      user_id: userId,
      device_id: deviceId,
      calibration_id: calibrationId,
      campaign_id: payload.campaignId,
      plugin_id: payload.gameMode,
      status: 'running',
      created_at: new Date(payload.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
      measurements: null,
      scientific_results: null,
      metadata: { version: '2.0', source: 'web-app' },
      version: '2.0',
    });
  }, []);

  const handleSessionCompleted = useCallback(async (payload: SessionCompletedPayload) => {
    const userId = await waitForUser();
    if (!userId) return;

    const { deviceId, calibrationId } = await ensureDeviceAndCalibration(userId, calRef.current);
    if (!deviceId) return;

    const consistency = analyzeConsistency(payload.results.correctedRts);
    const fatigue = detectFatigue(payload.results.correctedRts);

    const mean = payload.results.correctedRts.length > 0
      ? payload.results.correctedRts.reduce((a, b) => a + b, 0) / payload.results.correctedRts.length
      : 0;

    const sorted = [...payload.results.correctedRts].sort((a, b) => a - b);
    const n = payload.results.correctedRts.length;
    const median = n > 0
      ? n % 2 === 0
        ? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
        : (sorted[Math.floor(n / 2)] ?? 0)
      : 0;

    const scoring = calculateFocusScore({
      meanCorrectedMs: mean,
      consistencyScore: consistency.score,
      fatigueScore: fatigue.score,
      totalRounds: payload.results.totalRounds,
    });

    const client = getSupabaseClient();
    await client.from('sessions').upsert({
      id: payload.sessionId,
      user_id: userId,
      device_id: deviceId,
      calibration_id: calibrationId,
      campaign_id: payload.campaignId,
      plugin_id: payload.gameMode,
      status: 'completed',
      measurements: {
        raw_rts: [...payload.results.rawRts],
        corrected_rts: [...payload.results.correctedRts],
        total_rounds: payload.results.totalRounds,
        valid_rounds: payload.results.validRounds,
        outlier_count: consistency.outlierCount,
      },
      scientific_results: {
        mean_corrected_ms: mean,
        median_corrected_ms: median,
        consistency_score: consistency.score,
        consistency_rating: consistency.rating,
        fatigue_index: fatigue.fatigueIndex,
        fatigue_score: fatigue.score,
        focus_score: scoring.focusScore,
        grade: scoring.grade,
      },
      metadata: { version: '2.0', source: 'web-app' },
      created_at: new Date(payload.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      version: '2.0',
    });
  }, []);

  useEffect(() => {
    const publisher = getGlobalEventPublisher();
    const unsubCreated = publisher.subscribe<SessionCreatedPayload>('session_created', (event) => {
      handleSessionCreated(event.payload);
    });
    const unsubCompleted = publisher.subscribe<SessionCompletedPayload>('session_completed', (event) => {
      handleSessionCompleted(event.payload);
    });
    return () => {
      unsubCreated();
      unsubCompleted();
    };
  }, [handleSessionCreated, handleSessionCompleted]);

  return <>{children}</>;
}
