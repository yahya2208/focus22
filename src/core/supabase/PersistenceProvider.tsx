import { useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { getSupabaseClient } from './client';
import { collectDeviceProfile, type DeviceProfile } from '../device';
import type { CalibrationProfile } from '../calibration';

export function PersistenceProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { sessions, calibrationProfile, campaignId } = useAppState();
  const lastSavedCountRef = useRef(0);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const deviceRef = useRef<{ deviceId: string | null; calibrationId: string | null } | null>(null);

  const ensureDeviceAndCalibration = useCallback(async (userId: string): Promise<{ deviceId: string | null; calibrationId: string | null }> => {
    if (deviceRef.current) {
      return deviceRef.current;
    }

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

    deviceRef.current = { deviceId, calibrationId };
    return deviceRef.current;
  }, [calibrationProfile]);

  const saveSessionToSupabase = useCallback(async (session: {
    id: string;
    gameMode: string;
    timestamp: number;
    rawRts: readonly number[];
    correctedRts: readonly number[];
  }) => {
    try {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();

      if (!user) {
        return;
      }

      const { deviceId, calibrationId } = await ensureDeviceAndCalibration(user.id);

      const mean = session.correctedRts.length > 0
        ? session.correctedRts.reduce((a, b) => a + b, 0) / session.correctedRts.length
        : 0;

      const sorted = [...session.correctedRts].sort((a, b) => a - b);
      const n = session.correctedRts.length;
      const median = n > 0
        ? n % 2 === 0
          ? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
          : (sorted[Math.floor(n / 2)] ?? 0)
        : 0;

      const variance = n > 0
        ? session.correctedRts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n
        : 0;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;
      const consistencyScore = Math.max(0, 100 - cv * 100);

      const midpoint = Math.floor(n / 2);
      const firstHalf = session.correctedRts.slice(0, midpoint);
      const secondHalf = session.correctedRts.slice(midpoint);
      const firstMean = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : mean;
      const secondMean = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : mean;
      const fatigueIndex = firstMean > 0 ? (secondMean - firstMean) / firstMean : 0;
      const fatigueScore = Math.min(100, Math.max(0, fatigueIndex * 100));

      const speedScore = Math.max(0, 100 - (mean - 200) / 5);
      const focusScore = (speedScore * 0.4 + consistencyScore * 0.4 + (100 - fatigueScore) * 0.2);

      const grade = focusScore >= 90 ? 'A+' : focusScore >= 80 ? 'A' : focusScore >= 70 ? 'B'
        : focusScore >= 60 ? 'C' : focusScore >= 50 ? 'D' : 'F';

      const consistencyRating = consistencyScore >= 80 ? 'excellent' : consistencyScore >= 60 ? 'good'
        : consistencyScore >= 40 ? 'average' : 'poor';

      const payload = {
        id: session.id,
        user_id: user.id,
        device_id: deviceId,
        calibration_id: calibrationId,
        campaign_id: campaignId ?? undefined,
        plugin_id: session.gameMode,
        status: 'completed',
        measurements: {
          raw_rts: [...session.rawRts],
          corrected_rts: [...session.correctedRts],
          total_rounds: 7,
          valid_rounds: session.correctedRts.filter(rt => rt >= 150).length,
          outlier_count: 0,
        },
        scientific_results: {
          mean_corrected_ms: mean,
          median_corrected_ms: median,
          consistency_score: consistencyScore,
          consistency_rating: consistencyRating,
          fatigue_index: fatigueIndex,
          fatigue_score: fatigueScore,
          focus_score: focusScore,
          grade,
        },
        metadata: { version: '2.0', source: 'web-app' },
        created_at: new Date(session.timestamp).toISOString(),
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        version: '2.0',
      };

      await client.from('sessions').upsert(payload).select();
    } catch {
      // silently ignore persistence errors
    }
  }, [ensureDeviceAndCalibration, campaignId]);

  useEffect(() => {
    if (sessions.length > lastSavedCountRef.current && sessions.length > 0) {
      const newSession = sessions[sessions.length - 1];
      if (newSession) {
        saveSessionToSupabase(newSession);
      }
    }
    lastSavedCountRef.current = sessions.length;
  }, [sessions, saveSessionToSupabase]);

  return <>{children}</>;
}
