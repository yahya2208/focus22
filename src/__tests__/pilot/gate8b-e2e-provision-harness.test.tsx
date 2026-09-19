/**
 * GATE 8B — Gate8bE2eProvisionHarness (browser admin-session E2E harness).
 * Surface-only contract:
 *   * fixed test payload per gate contract (role operator, fixed store),
 *   * call MUST go through supabase.functions.invoke => the browser client
 *     attaches the current admin session automatically (no explicit token),
 *   * never invokes on mount, never permits arbitrary user input,
 *   * response surface carries no token material.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ functions: { invoke: mock.invoke } }),
}));

import {
  Gate8bE2eProvisionHarness,
  GATE8B_STORE_ID,
  GATE8B_DISPLAY_NAME,
  GATE8B_ROLE,
  GATE8B_EMAIL_DOMAIN,
  GATE8B_EMAIL_PREFIX,
} from '../../screens/pilot/Gate8bE2eProvisionHarness';

describe('Gate8bE2eProvisionHarness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT invoke the edge function on mount (no auto-create)', () => {
    render(<Gate8bE2eProvisionHarness />);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('invokes create-pilot-account once with the FIXED test payload on button click', async () => {
    mock.invoke.mockResolvedValue({
      data: null,
      error: new Error('REQUEST_ABORTED'),
    });
    render(<Gate8bE2eProvisionHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'run-gate8b-provision' }));
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));

    const [functionName, options] = mock.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(functionName).toBe('create-pilot-account');
    expect(options.body['role']).toBe(GATE8B_ROLE);
    expect(options.body['display_name']).toBe(GATE8B_DISPLAY_NAME);
    expect(options.body['store_id']).toBe(GATE8B_STORE_ID);
    const email = String(options.body['email']);
    expect(email).toMatch(new RegExp(`^${GATE8B_EMAIL_PREFIX}\\d+${GATE8B_EMAIL_DOMAIN.replace('.', '\\.')}$`));
    expect(options.body['password']).toBeUndefined();
  });

  it('passes ONLY the body to functions.invoke (relies on session auto-attach; no token/header material)', async () => {
    mock.invoke.mockResolvedValue({
      data: { ok: true, auth_created: true, user_id: 'u1', email: 'e@focus-test.com', role: 'operator', status: 'pending', next: 'admin_approval_required' },
      error: null,
    });
    render(<Gate8bE2eProvisionHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'run-gate8b-provision' }));
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));

    const [, options] = mock.invoke.mock.calls[0] as [string, object];
    expect(Object.keys(options)).toEqual(['body']);
    expect(JSON.stringify(options)).not.toContain('Authorization');
    expect(JSON.stringify(options)).not.toContain('access_token');
    expect(JSON.stringify(options)).not.toContain('refresh_token');
  });

  it('surfaces the non-secret provisioning result on success', async () => {
    mock.invoke.mockResolvedValue({
      data: {
        ok: true,
        auth_created: true,
        user_id: '11111111-2222-3333-4444-555555555555',
        email: 'pilot-step1b-operator-111@focus-test.com',
        role: 'operator',
        status: 'pending',
        next: 'admin_approval_required',
      },
      error: null,
    });
    render(<Gate8bE2eProvisionHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'run-gate8b-provision' }));
    expect(await screen.findByText(/OK — status: pending/)).toBeTruthy();
    expect(screen.getByText(/user_id: 11111111-2222-3333-4444-555555555555/)).toBeTruthy();
    expect(screen.getByText(/email: pilot-step1b-operator-111@focus-test.com/)).toBeTruthy();
  });

  it('surfaces a normalized error code from a JSON error body', async () => {
    mock.invoke.mockResolvedValue({
      data: null,
      error: new Error('{"error":"PERMISSION_DENIED"}'),
    });
    render(<Gate8bE2eProvisionHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'run-gate8b-provision' }));
    expect(await screen.findByText(/ERROR — PERMISSION_DENIED/)).toBeTruthy();
  });

  it('surfaces an unexpected response as a code rather than crashing', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: null });
    render(<Gate8bE2eProvisionHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'run-gate8b-provision' }));
    expect(await screen.findByText(/ERROR — UNEXPECTED_RESPONSE/)).toBeTruthy();
  });
});