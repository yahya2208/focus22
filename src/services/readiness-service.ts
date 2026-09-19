import { getSupabaseClient } from '../core/supabase/client';

export type MemberKind = 'operator' | 'courier';

export interface OperationalReadinessResult {
  readonly member_kind: MemberKind;
  readonly store_id: string;
  readonly user_id: string;
  readonly status: string;
  readonly operational_ready: boolean;
  readonly actor_user_id: string;
  readonly actor_role: string;
  readonly event_type: 'ready' | 'not_ready' | 'noop';
}

const UNEXPECTED = 'UNEXPECTED_RESPONSE';

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) {
    const code =
      (error.message ?? '').includes('PERMISSION_DENIED')
        ? 'PERMISSION_DENIED'
        : (error.code as string) || 'RPC_ERROR';
    throw new Error(code);
  }
  if (data === null || data === undefined) throw new Error(UNEXPECTED);
  return data as R;
}

export async function setOperationalReady(opts: {
  memberKind: MemberKind;
  storeId: string;
  userId: string;
  ready: boolean;
  reason?: string;
}): Promise<OperationalReadinessResult> {
  return callRpc<OperationalReadinessResult>('pilot_admin_set_operational_ready', {
    p_member_kind: opts.memberKind,
    p_store_id: opts.storeId,
    p_user_id: opts.userId,
    p_ready: opts.ready,
    p_reason: opts.reason ?? '',
    p_metadata: {},
  });
}