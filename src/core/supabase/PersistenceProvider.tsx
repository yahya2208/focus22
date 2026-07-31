import { useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient, getSupabaseConfig } from './client';
import { collectDeviceProfile, type DeviceProfile } from '../device';
import type { CalibrationProfile } from '../calibration';
import { analyzeConsistency } from '../engine/consistency';
import { detectFatigue } from '../engine/fatigue';
import { calculateFocusScore } from '../engine/scoring';
import { getGlobalEventPublisher } from '../events';
import { getGlobalTelemetry } from '../telemetry';
import type { SessionCreatedPayload, SessionCompletedPayload, SessionAbandonedPayload, EndedReason } from '../session/service';

const PING_INTERVAL_MS = 30_000;
const STALE_CUTOFF_MINUTES = 5;

let cachedUserId: string | null = null;

async function waitForUser(maxRetries = 10, intervalMs = 100): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const client = getSupabaseClient();
  for (let i = 0; i < maxRetries; i++) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      cachedUserId = user.id;
      return user.id;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const { data: { user } } = await client.auth.getUser();
  if (user) cachedUserId = user.id;
  return user?.id ?? null;
}

function clearCachedUserId(): void {
  cachedUserId = null;
}

async function closeStaleSessionsForUser(userId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('sessions')
    .update({ status: 'completed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'running');
  if (error) {
    console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
  }
}

async function doCloseSession(
  sessionId: string,
  _endedReason: EndedReason,
  payload?: {
    userId: string;
    deviceId: string;
    calibrationId: string | null;
    campaignId: string | null;
    gameMode: string;
    createdAt: string;
    results?: SessionCompletedPayload['results'];
  },
): Promise<void> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  if (payload?.results) {
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

    const { error } = await client.from('sessions').upsert({
      id: sessionId,
      user_id: payload.userId,
      device_id: payload.deviceId,
      calibration_id: payload.calibrationId,
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
      created_at: payload.createdAt,
      updated_at: now,
      finished_at: now,
      version: '2.0',
    });
    if (error) {
      console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
    }
  } else {
    const { error } = await client.from('sessions').update({
      status: 'completed',
      finished_at: now,
      updated_at: now,
    }).eq('id', sessionId);
    if (error) {
      console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
    }
  }
}

function sendCloseSessionBeacon(sessionId: string, _endedReason: EndedReason): void {
  try {
    const config = getSupabaseConfig();
    const url = `${config.url}/rest/v1/sessions?id=eq.${sessionId}`;
    const now = new Date().toISOString();
    const body = JSON.stringify({
      status: 'completed',
      finished_at: now,
      updated_at: now,
    });
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  } catch {
    // beacon failure is non-critical
  }
}

async function sendCloseSessionFetch(sessionId: string, _endedReason: EndedReason): Promise<void> {
  try {
    const config = getSupabaseConfig();
    const url = `${config.url}/rest/v1/sessions?id=eq.${sessionId}`;
    const now = new Date().toISOString();
    const body = JSON.stringify({
      status: 'completed',
      finished_at: now,
      updated_at: now,
    });
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`,
      },
      body,
      keepalive: true,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error({ code: 'PATCH_FAIL', status: res.status, message: err.message, details: err.details, hint: err.hint });
    }
  } catch {
    // fetch failure is non-critical during unload
  }
}

function closeSession(sessionId: string, endedReason: EndedReason): void {
  sendCloseSessionBeacon(sessionId, endedReason);
  sendCloseSessionFetch(sessionId, endedReason);
}

async function autoCleanupStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CUTOFF_MINUTES * 60 * 1000).toISOString();
  const client = getSupabaseClient();

  const { data: stale, error: selectErr } = await client
    .from('sessions')
    .select('id')
    .eq('status', 'running')
    .lt('updated_at', cutoff);
  if (selectErr) {
    console.error({ code: selectErr.code, message: selectErr.message, details: selectErr.details, hint: selectErr.hint });
    return;
  }
  if (!stale || stale.length === 0) return;

  const ids = [...new Set(stale.map(r => r.id))];

  if (ids.length > 0) {
    const { error: updateErr } = await client
      .from('sessions')
      .update({ status: 'completed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids);
    if (updateErr) {
      console.error({ code: updateErr.code, message: updateErr.message, details: updateErr.details, hint: updateErr.hint });
    }
  }
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

    if (deviceError) {
      console.error({ code: deviceError.code, message: deviceError.message, details: deviceError.details, hint: deviceError.hint });
    } else {
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

      if (calError) {
        console.error({ code: calError.code, message: calError.message, details: calError.details, hint: calError.hint });
      } else {
        calibrationId = newCal.id;
      }
    }
  }

  return { deviceId, calibrationId };
}

export function PersistenceProvider({ children }: { children: React.ReactNode }) {
  const calRef = useRef<CalibrationProfile | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDataRef = useRef<{
    userId: string;
    deviceId: string;
    calibrationId: string | null;
    campaignId: string | null;
    gameMode: string;
    createdAt: string;
  } | null>(null);

  const updateActivity = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const now = new Date().toISOString();
    const client = getSupabaseClient();
    const { error } = await client.from('sessions').update({ updated_at: now }).eq('id', sessionId);
    if (error) {
      console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
    }
  }, []);

  const clearSession = useCallback(() => {
    activeSessionIdRef.current = null;
    sessionDataRef.current = null;
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const handleSessionCreated = useCallback(async (payload: SessionCreatedPayload) => {
    const userId = await waitForUser();
    if (!userId) return;

    await closeStaleSessionsForUser(userId);

    const { deviceId, calibrationId } = await ensureDeviceAndCalibration(userId, calRef.current);
    if (!deviceId) return;
    getGlobalTelemetry().setDeviceId(deviceId);

    const createdAt = new Date(payload.createdAt).toISOString();
    const client = getSupabaseClient();
    const { error } = await client.from('sessions').insert({
      id: payload.sessionId,
      user_id: userId,
      device_id: deviceId,
      calibration_id: calibrationId,
      campaign_id: payload.campaignId,
      plugin_id: payload.gameMode,
      status: 'running',
      created_at: createdAt,
      updated_at: createdAt,
      measurements: null,
      scientific_results: null,
      metadata: { version: '2.0', source: 'web-app' },
      version: '2.0',
    });
    if (error) {
      console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
      return;
    }

    activeSessionIdRef.current = payload.sessionId;
    sessionDataRef.current = { userId, deviceId, calibrationId, campaignId: payload.campaignId, gameMode: payload.gameMode, createdAt };

    if (!pingIntervalRef.current) {
      pingIntervalRef.current = setInterval(updateActivity, PING_INTERVAL_MS);
    }
  }, [updateActivity]);

  const handleSessionCompleted = useCallback(async (payload: SessionCompletedPayload) => {
    const data = sessionDataRef.current;
    if (!data) {
      const userId = await waitForUser();
      if (!userId) return;
      const { deviceId, calibrationId } = await ensureDeviceAndCalibration(userId, calRef.current);
      if (!deviceId) return;
      await doCloseSession(payload.sessionId, payload.endedReason, {
        userId,
        deviceId,
        calibrationId,
        campaignId: payload.campaignId,
        gameMode: payload.gameMode,
        createdAt: new Date(payload.createdAt).toISOString(),
        results: payload.results,
      });
    } else {
      await doCloseSession(payload.sessionId, payload.endedReason, {
        ...data,
        results: payload.results,
      });
    }
    clearSession();
  }, [clearSession]);

  const handleSessionAbandoned = useCallback(async (payload: SessionAbandonedPayload) => {
    await doCloseSession(payload.sessionId, payload.reason);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    const publisher = getGlobalEventPublisher();
    const unsubCreated = publisher.subscribe<SessionCreatedPayload>('session_created', (event) => {
      handleSessionCreated(event.payload);
    });
    const unsubCompleted = publisher.subscribe<SessionCompletedPayload>('session_completed', (event) => {
      handleSessionCompleted(event.payload);
    });
    const unsubAbandoned = publisher.subscribe<SessionAbandonedPayload>('session_abandoned', (event) => {
      handleSessionAbandoned(event.payload);
    });

    const handleBeforeUnload = () => {
      const sessionId = activeSessionIdRef.current;
      if (sessionId) {
        const publisher2 = getGlobalEventPublisher();
        publisher2.publish<SessionAbandonedPayload>('session_abandoned', { sessionId, reason: 'browser_closed' }, 'persistence-provider');
        closeSession(sessionId, 'browser_closed');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateActivity();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    autoCleanupStaleSessions();
    const cleanupTimer = setInterval(autoCleanupStaleSessions, STALE_CUTOFF_MINUTES * 60 * 1000);

    return () => {
      unsubCreated();
      unsubCompleted();
      unsubAbandoned();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(cleanupTimer);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [handleSessionCreated, handleSessionCompleted, handleSessionAbandoned, updateActivity]);

  return <>{children}</>;
}

export function resetPersistenceCache(): void {
  clearCachedUserId();
}
