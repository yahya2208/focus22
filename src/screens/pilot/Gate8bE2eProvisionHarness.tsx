import { memo, useCallback, useState, type CSSProperties } from 'react';
import { Button } from '../../design-system/components/Button';
import { getSupabaseClient } from '../../core/supabase/client';

export const GATE8B_STORE_ID = '8e1bdb04-dccc-4188-8404-a340be5325b9';
export const GATE8B_DISPLAY_NAME = 'STEP1B TEST OPERATOR';
export const GATE8B_ROLE = 'operator';
export const GATE8B_EMAIL_PREFIX = 'pilot-step1b-operator-';
export const GATE8B_EMAIL_DOMAIN = '@focus-test.com';

function gate8bEmail(): string {
  return `${GATE8B_EMAIL_PREFIX}${Date.now()}${GATE8B_EMAIL_DOMAIN}`;
}

interface Gate8bSuccess {
  ok: true;
  auth_created: boolean;
  user_id: string;
  email: string;
  role: string;
  status: string;
  next: string;
}

interface Gate8bFailure {
  error?: string;
  detail?: string;
}

type Gate8bInvokeResult = Gate8bSuccess | Gate8bFailure;

type HarnessState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'success'; email: string; user_id: string; status: string; auth_created: boolean }
  | { phase: 'error'; code: string };

const boxStyle: CSSProperties = {
  border: '1px solid #b45309',
  borderRadius: 12,
  padding: 12,
  background: '#fff8ec',
};

const labelStyle: CSSProperties = {
  color: '#7c2d12',
  fontSize: '0.85rem',
  fontWeight: 800,
  letterSpacing: '0.04em',
  marginBottom: '0.4rem',
  display: 'block',
};

const textStyle: CSSProperties = {
  color: '#78350f',
  fontSize: '0.78rem',
  margin: '0.25rem 0',
  display: 'block',
  whiteSpace: 'pre-wrap',
};

export const Gate8bE2eProvisionHarness = memo(function Gate8bE2eProvisionHarness() {
  const [state, setState] = useState<HarnessState>({ phase: 'idle' });

  const runProvision = useCallback(async () => {
    if (state.phase === 'running') return;
    const email = gate8bEmail();
    setState({ phase: 'running' });
    try {
      const { data, error } = await getSupabaseClient().functions.invoke<Gate8bInvokeResult>(
        'create-pilot-account',
        {
          body: {
            role: GATE8B_ROLE,
            email,
            display_name: GATE8B_DISPLAY_NAME,
            store_id: GATE8B_STORE_ID,
          },
        },
      );
      if (error) {
        let code = error.message || 'UNKNOWN_ERROR';
        try {
          const parsed = JSON.parse(error.message) as Gate8bFailure;
          if (parsed && typeof parsed === 'object' && parsed.error) code = parsed.error;
        } catch {
          // keep raw message
        }
        setState({ phase: 'error', code });
        return;
      }
      const payload = (data ?? {}) as Gate8bInvokeResult;
      if (typeof payload === 'object' && payload !== null && 'ok' in payload && payload.ok === true) {
        setState({
          phase: 'success',
          email: payload.email,
          user_id: payload.user_id,
          status: payload.status,
          auth_created: payload.auth_created,
        });
      } else if (typeof payload === 'object' && payload !== null && 'error' in payload && payload.error) {
        setState({ phase: 'error', code: String(payload.error) });
      } else {
        setState({ phase: 'error', code: 'UNEXPECTED_RESPONSE' });
      }
    } catch (err) {
      setState({ phase: 'error', code: err instanceof Error ? err.message : 'UNKNOWN_ERROR' });
    }
  }, [state.phase]);

  return (
    <div style={boxStyle} data-testid="gate8b-e2e-harness">
      <span style={labelStyle}>GATE 8B TEST ONLY — create-pilot-account ({'\u062A\u062C\u0631\u0628\u0629 \u0641\u0642\u0637'})</span>
      <span style={textStyle}>
        استدعاء حقيقي ل Edge Function بحساب اختبار ثابت (operator) لدى store_id{' '}
        {GATE8B_STORE_ID}. لا إنشاء تلقائي عند فتح الشاشة — فقط بضغطة هذا الزر. لا تُستخدم هنا أي
        خدمة كلمة مرور؛ الدالة تستخدم invite flow. اجلس Admin الحالية تُرفق تلقائيًا، ولا يُعرض أي
        token.
      </span>
      <span style={textStyle}>
        role: {GATE8B_ROLE} · display_name: {GATE8B_DISPLAY_NAME} · email: {GATE8B_EMAIL_PREFIX}
        {'<timestamp>'}
        {GATE8B_EMAIL_DOMAIN}
      </span>
      {state.phase === 'running' && <span style={textStyle}>RUNNING — provisioning request in flight…</span>}
      {state.phase === 'success' && (
        <span style={textStyle}>
          OK — status: {state.status} · auth_created: {String(state.auth_created)} · user_id:{' '}
          {state.user_id} · email: {state.email}
        </span>
      )}
      {state.phase === 'error' && <span style={textStyle}>ERROR — {state.code}</span>}
      <div style={{ marginTop: 8 }}>
        <Button
          variant="warning"
          size="sm"
          disabled={state.phase === 'running'}
          onClick={() => void runProvision()}
          aria-label="run-gate8b-provision"
        >
          RUN GATE 8B E2E PROVISION
        </Button>
      </div>
    </div>
  );
});