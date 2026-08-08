import { getSupabaseClient } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Types for sessions (matching existing schema)
export interface SessionData {
  id: string;
  user_id: string;
  device_id: string;
  calibration_id: string;
  plugin_id: string;
  status: string;
  measurements?: Record<string, unknown>;
  scientific_results?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  finished_at?: string;
  version: string;
}

class DataService {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  // Sessions
  async saveSession(session: SessionData): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .upsert({
        id: session.id,
        user_id: session.user_id,
        device_id: session.device_id,
        calibration_id: session.calibration_id,
        plugin_id: session.plugin_id,
        status: session.status,
        measurements: session.measurements,
        scientific_results: session.scientific_results,
        metadata: session.metadata,
        created_at: session.created_at,
        updated_at: session.updated_at,
        finished_at: session.finished_at,
        version: session.version,
      });

    if (error) {
      throw error;
    }
  }

  async getSessions(filters?: { user_id?: string; status?: string; limit?: number; offset?: number }): Promise<{ data: SessionData[]; count: number }> {
    let query = this.client
      .from('sessions')
      .select('*', { count: 'exact' });

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], count: 0 };
    }

    return { data: data ?? [], count: count ?? 0 };
  }
}

// Singleton instance
let dataServiceInstance: DataService | null = null;

export function getDataService(client?: SupabaseClient): DataService {
  if (!dataServiceInstance) {
    dataServiceInstance = new DataService(client);
  }
  return dataServiceInstance;
}

export function resetDataService(): void {
  dataServiceInstance = null;
}
