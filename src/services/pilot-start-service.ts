/**
 * Pilot START — admin domain service (GATE 8B STEP 4).
 *
 * Wraps the authoritative START RPCs from 00086. The server re-verifies every
 * precondition inside its own transaction (store active + linked, operator and
 * courier active + ready) and records exactly one immutable run row per open
 * run. The client surfaces only deterministic error codes; the Admin UI never
 * trusts its own derived state for authorization.
 */
import { getSupabaseClient } from '../core/supabase/client';

export interface PilotStartResult {
  readonly run_id: string;
  readonly run_index: number;
  readonly store_id: string;
  readonly operator_user_id: string | null;
  readonly courier_user_id: string | null;
  readonly actor_user_id: string | null;
  readonly actor_role: string;
  readonly status: 'started';
  readonly started_at: string;
  readonly event_type: 'pilot_started';
}

export interface PilotStartRun {
  readonly run_id: string;
  readonly run_index: number;
  readonly started_at: string;
  readonly operator_user_id: string | null;
  readonly courier_user_id: string | null;
  readonly actor_user_id: string | null;
  readonly actor_role: string;
}

export interface PilotStartStatus {
  readonly started: boolean;
  readonly run: PilotStartRun | null;
  readonly store: {
    readonly id: string;
    readonly status: string;
    readonly operator_user_id: string | null;
    readonly active: boolean;
    readonly linked: boolean;
  };
  readonly operator: {
    readonly user_id: string;
    readonly status: string;
    readonly operational_ready: boolean;
    readonly active: boolean;
    readonly ready: boolean;
    readonly linked: boolean;
  } | null;
  readonly courier: {
    readonly user_id: string;
    readonly store_id: string;
    readonly status: string | null;
    readonly operational_ready: boolean;
    readonly linked: boolean;
    readonly active: boolean;
    readonly ready: boolean;
  } | null;
  readonly preconditions: {
    readonly store_active: boolean;
    readonly operator_linked: boolean;
    readonly operator_active: boolean;
    readonly operator_ready: boolean;
    readonly courier_linked: boolean;
    readonly courier_active: boolean;
    readonly courier_ready: boolean;
  };
  readonly ready: boolean;
  readonly valid: boolean | null;
  readonly validReasons: string[];
}

const UNEXPECTED = 'UNEXPECTED_RESPONSE';

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) {
    const msg = error.message ?? '';
    const code =
      msg.includes('PERMISSION_DENIED')
        ? 'PERMISSION_DENIED'
        : msg.includes('ALREADY_STARTED') || error.code === '23505'
          ? 'ALREADY_STARTED'
          : (error.code as string) || 'RPC_ERROR';
    throw new Error(code);
  }
  if (data === null || data === undefined) throw new Error(UNEXPECTED);
  return data as R;
}

/** Server-authoritative pilot start state (precondition readout + run + validity). */
export async function fetchPilotStartStatus(
  storeId: string,
  courierUserId?: string,
): Promise<PilotStartStatus> {
  return callRpc<PilotStartStatus>('pilot_admin_pilot_start_status', {
    p_store_id: storeId,
    p_courier_user_id: courierUserId ?? null,
  });
}

/** Explicit admin START. Server re-verifies every precondition transactional. */
export async function startPilot(opts: {
  storeId: string;
  courierUserId: string;
}): Promise<PilotStartResult> {
  return callRpc<PilotStartResult>('pilot_admin_start_pilot', {
    p_store_id: opts.storeId,
    p_courier_user_id: opts.courierUserId,
    p_metadata: {},
  });
}