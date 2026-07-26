import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionStatus } from '../session';
import type {
  SessionRepository,
  SessionFilter,
  SessionSort,
  SessionPage,
} from '../repository/types';
import { getSupabaseClient } from '../supabase/client';

function toDbRow(session: Session, userId: string) {
  return {
    id: session.id,
    user_id: userId,
    device_id: session.deviceId,
    calibration_id: session.calibrationId,
    plugin_id: session.pluginId,
    status: session.status,
    measurements: session.measurements ? {
      raw_rts: [...session.measurements.rawRts],
      corrected_rts: [...session.measurements.correctedRts],
      total_rounds: session.measurements.totalRounds,
      valid_rounds: session.measurements.validRounds,
      outlier_count: session.measurements.outlierCount,
    } : null,
    scientific_results: session.scientificResults ? {
      mean_corrected_ms: session.scientificResults.meanCorrectedMs,
      median_corrected_ms: session.scientificResults.medianCorrectedMs,
      consistency_score: session.scientificResults.consistencyScore,
      consistency_rating: session.scientificResults.consistencyRating,
      fatigue_index: session.scientificResults.fatigueIndex,
      fatigue_score: session.scientificResults.fatigueScore,
      focus_score: session.scientificResults.focusScore,
      grade: session.scientificResults.grade,
    } : null,
    metadata: {
      version: session.metadata.version,
      plugin_version: session.metadata.pluginVersion,
      build_number: session.metadata.buildNumber,
    },
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date(session.updatedAt).toISOString(),
    finished_at: session.finishedAt ? new Date(session.finishedAt).toISOString() : null,
    version: session.metadata.version,
  };
}

function fromDbRow(row: Record<string, unknown>): Session {
  const measurements = row.measurements as {
    raw_rts?: number[];
    corrected_rts?: number[];
    total_rounds?: number;
    valid_rounds?: number;
    outlier_count?: number;
  } | null;

  const scientificResults = row.scientific_results as {
    mean_corrected_ms?: number;
    median_corrected_ms?: number;
    consistency_score?: number;
    consistency_rating?: string;
    fatigue_index?: number;
    fatigue_score?: number;
    focus_score?: number;
    grade?: string;
  } | null;

  const meta = row.metadata as { version?: string; plugin_version?: string; build_number?: number } | null;

  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    calibrationId: row.calibration_id as string,
    pluginId: row.plugin_id as string,
    deviceId: row.device_id as string,
    measurements: measurements ? {
      rawRts: measurements.raw_rts ?? [],
      correctedRts: measurements.corrected_rts ?? [],
      totalRounds: measurements.total_rounds ?? 0,
      validRounds: measurements.valid_rounds ?? 0,
      outlierCount: measurements.outlier_count ?? 0,
    } : null,
    scientificResults: scientificResults ? {
      meanCorrectedMs: scientificResults.mean_corrected_ms ?? 0,
      medianCorrectedMs: scientificResults.median_corrected_ms ?? 0,
      consistencyScore: scientificResults.consistency_score ?? 0,
      consistencyRating: scientificResults.consistency_rating ?? 'unknown',
      fatigueIndex: scientificResults.fatigue_index ?? 0,
      fatigueScore: scientificResults.fatigue_score ?? 0,
      focusScore: scientificResults.focus_score ?? 0,
      grade: scientificResults.grade ?? 'F',
    } : null,
    metadata: {
      version: meta?.version ?? '0.1.0-alpha',
      pluginVersion: meta?.plugin_version ?? '1.0.0',
      buildNumber: meta?.build_number ?? 1,
    },
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    finishedAt: row.finished_at ? new Date(row.finished_at as string).getTime() : null,
  };
}

export function createSupabaseSessionRepository(
  client?: SupabaseClient,
  userId?: string,
): SessionRepository {
  const supa = client ?? getSupabaseClient();

  async function getUserId(): Promise<string> {
    if (userId) return userId;
    const { data } = await supa.auth.getUser();
    if (!data.user) throw new Error('Not authenticated');
    return data.user.id;
  }

  return {
    async save(session: Session): Promise<void> {
      const uid = await getUserId();
      const { error } = await supa.from('sessions').upsert(toDbRow(session, uid));
      if (error) throw new Error(`Failed to save session: ${error.message}`);
    },

    async getById(id: string): Promise<Session | null> {
      const { data, error } = await supa.from('sessions').select('*').eq('id', id).single();
      if (error) return null;
      return fromDbRow(data as Record<string, unknown>);
    },

    async getAll(
      filter?: SessionFilter,
      sort?: SessionSort,
      offset = 0,
      limit = 50,
    ): Promise<SessionPage> {
      const uid = await getUserId();
      let query = supa.from('sessions').select('*', { count: 'exact' }).eq('user_id', uid);

      if (filter?.status) query = query.eq('status', filter.status);
      if (filter?.pluginId) query = query.eq('plugin_id', filter.pluginId);
      if (filter?.dateFrom) query = query.gte('created_at', new Date(filter.dateFrom).toISOString());
      if (filter?.dateTo) query = query.lte('created_at', new Date(filter.dateTo).toISOString());

      const sortField = sort?.field === 'focusScore' ? 'scientific_results->focus_score'
        : sort?.field === 'finishedAt' ? 'finished_at'
        : sort?.field ?? 'created_at';

      query = query.order(sortField, { ascending: (sort?.direction ?? 'desc') === 'asc' });
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);

      const sessions = (data ?? []).map((row) => fromDbRow(row as Record<string, unknown>));

      return {
        sessions,
        total: count ?? 0,
        offset,
        limit,
      };
    },

    async getByStatus(status: SessionStatus): Promise<readonly Session[]> {
      const uid = await getUserId();
      const { data, error } = await supa.from('sessions')
        .select('*')
        .eq('user_id', uid)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
      return (data ?? []).map((row) => fromDbRow(row as Record<string, unknown>));
    },

    async update(session: Session): Promise<void> {
      const uid = await getUserId();
      const { error } = await supa.from('sessions')
        .update(toDbRow(session, uid))
        .eq('id', session.id);
      if (error) throw new Error(`Failed to update session: ${error.message}`);
    },

    async delete(id: string): Promise<void> {
      const { error } = await supa.from('sessions').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete session: ${error.message}`);
    },

    async count(filter?: SessionFilter): Promise<number> {
      const uid = await getUserId();
      let query = supa.from('sessions').select('*', { count: 'exact', head: true }).eq('user_id', uid);
      if (filter?.status) query = query.eq('status', filter.status);
      if (filter?.pluginId) query = query.eq('plugin_id', filter.pluginId);
      const { count, error } = await query;
      if (error) throw new Error(`Failed to count sessions: ${error.message}`);
      return count ?? 0;
    },

    async clear(): Promise<void> {
      const uid = await getUserId();
      const { error } = await supa.from('sessions').delete().eq('user_id', uid);
      if (error) throw new Error(`Failed to clear sessions: ${error.message}`);
    },
  };
}
