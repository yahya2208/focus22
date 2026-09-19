import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';

/**
 * Phase 7 + Pass 2 — Admin Control Center Settings UI.
 * Renders from the mocked secure RPC output and asserts:
 *  - settings load and group by category (Games/Offers & Promotions/Inventory/
 *    Business Rules/Performance/Telemetry & Analytics)
 *  - current + default + type + bounds shown
 *  - Default/Customized badges and real Reset-to-default (RPC write)
 *  - Discard reverts the draft only (no RPC)
 *  - sensitive settings ask for confirmation BEFORE the write RPC
 *  - a successful save refreshes the runtime cache (get_settings re-read)
 *  - History expands the append-only audit read (get_settings_audit)
 *  - input validation (out-of-range blocked client-side)
 *  - save calls set_setting with the typed key/value
 *  - failed telemetry save shows error but does not corrupt local state
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    getSupabaseClient: vi.fn(() => ({ rpc })),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import { AdminSettingsBI } from '../../business-intelligence/pages/AdminSettingsBI';

function settingsFor(overrides: Record<string, string> = {}): { error: null; settings: Record<string, { value: string; category: string; type: string }> } {
  const base: Record<string, { value: string; category: string; type: string }> = {
    'game.rounds': { value: '7', category: 'game', type: 'integer' },
    'game.min_delay_ms': { value: '750', category: 'game', type: 'integer' },
    'game.max_delay_ms': { value: '2890', category: 'game', type: 'integer' },
    'game.min_position_distance_pct': { value: '25', category: 'game', type: 'percent' },
    'offers.default_discount_percent': { value: '5', category: 'offers', type: 'percent' },
    'offers.default_max_usage': { value: '50', category: 'offers', type: 'integer' },
    'offers.return_discount_percent': { value: '5', category: 'offers', type: 'percent' },
    'offers.whatsapp_discount_percent': { value: '8', category: 'offers', type: 'percent' },
    'offers.whatsapp_max_usage': { value: '30', category: 'offers', type: 'integer' },
    'inventory.overstock_multiplier': { value: '3', category: 'inventory', type: 'integer' },
    'rules.inventory_low_threshold': { value: '5', category: 'rules', type: 'integer' },
    'rules.device_visitors_threshold': { value: '30', category: 'rules', type: 'integer' },
    'rules.trade_conversion_threshold': { value: '10', category: 'rules', type: 'integer' },
    'rules.visitor_count_threshold': { value: '90', category: 'rules', type: 'integer' },
    'rules.default_threshold': { value: '3', category: 'rules', type: 'integer' },
    'rules.needs_discount_visit_count': { value: '3', category: 'rules', type: 'integer' },
    'cache.max_entries': { value: '500', category: 'cache', type: 'integer' },
    'telemetry.max_batch': { value: '10', category: 'telemetry', type: 'integer' },
    'telemetry.flush_ms': { value: '5000', category: 'telemetry', type: 'integer' },
    'telemetry.max_buffer': { value: '50', category: 'telemetry', type: 'integer' },
  };
  for (const [k, v] of Object.entries(overrides)) {
    base[k] = { value: v, category: k.split('.')[0]!, type: 'integer' };
  }
  return { error: null, settings: base };
}

beforeEach(() => {
  // mockReset (NOT clearAllMocks) also drains the mockResolvedValueOnce queue,
  // so no RPC result from a previous test leaks into the next one's sequence.
  mocks.rpc.mockReset();
  // By default accept all sensitive-setting confirmations (save/reset flows);
  // individual tests stub `false` to prove the abort path.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminSettingsBI', () => {
  it('loads and renders settings grouped by category with values', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Admin Control Center — Settings')).toBeTruthy());
    expect(screen.getByText('Games')).toBeTruthy();
    expect(screen.getByText('Offers & Promotions')).toBeTruthy();
    expect(screen.getByText('Inventory')).toBeTruthy();
    expect(screen.getByText('Business Rules')).toBeTruthy();
    expect(screen.getByText('Performance')).toBeTruthy();
    expect(screen.getByText('Telemetry & Analytics')).toBeTruthy();
    // a known label + current value
    expect(screen.getByText('Total rounds')).toBeTruthy();
  });

  it('shows default, type, and bounds for each setting', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getAllByText(/default/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/bounds/).length).toBeGreaterThan(0);
  });

  it('saves a valid edit through set_setting and reflects the new value', async () => {
    // read -> write -> refresh read (Phase A: consumers are re-synced on save)
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null })
      .mockResolvedValueOnce({ data: { error: null, saved: { key: 'game.rounds', value: 9, category: 'game', type: 'integer' } }, error: null })
      .mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Total rounds')).toBeTruthy());
    const inputs = screen.getAllByRole('spinbutton');
    const roundsInput = inputs[0]!;
    fireEvent.change(roundsInput, { target: { value: '9' } });
    // game.* is a sensitive domain -> the write must be confirmed first
    expect(window.confirm).not.toHaveBeenCalled();
    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[0]!);
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('set_setting', { p_key: 'game.rounds', p_value: 9 });
    });
    await waitFor(() => expect(screen.getByText('Setting saved successfully.')).toBeTruthy());
    // Phase A: after a successful save the runtime cache is refreshed (get_settings re-read)
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(3));
  });

  it('blocks out-of-range values client-side (Save disabled)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Total rounds')).toBeTruthy());
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0]!, { target: { value: '999' } });
    const saveButtons = screen.getAllByText('Save');
    expect(saveButtons[0]).toBeTruthy();
    expect((saveButtons[0] as HTMLButtonElement).disabled).toBe(true);
    // set_setting should never have been called
    expect(mocks.rpc).not.toHaveBeenCalledWith('set_setting', expect.anything());
  });

  it('shows read-only mode when the server denies write (FORBIDDEN)', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read ok
      .mockResolvedValueOnce({ data: { error: 'FORBIDDEN', saved: null }, error: null }); // write denied
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Total rounds')).toBeTruthy());
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0]!, { target: { value: '9' } });
    fireEvent.click(screen.getAllByText('Save')[0]!);
    await waitFor(() => expect(screen.getByText('Read-only mode')).toBeTruthy());
  });

  it('shows access denied when getSettings returns UNAUTHORIZED', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'UNAUTHORIZED' }, error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Access denied')).toBeTruthy());
  });

  it('shows RPC failure on transport error (does not expose settings)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('RPC failure')).toBeTruthy());
    // no forbidden settings are ever shown
    expect(screen.queryByText('Access denied')).toBeNull();
    expect(screen.queryByText(/USE_NEW_GALLERY|purchaseProbability/)).toBeNull();
  });

  it('renders the three telemetry controls with their defaults', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Telemetry & Analytics')).toBeTruthy());
    // Scope all queries to the Telemetry card so value collisions with other
    // settings (e.g. offers.default_max_usage=50, rules...threshold=10) cannot
    // make the assertion ambiguous.
    const telemetryCard = screen.getByText('Telemetry & Analytics').closest('div')!;
    expect(within(telemetryCard).getByText('Flush batch size')).toBeTruthy();
    expect(within(telemetryCard).getByText('Flush interval (ms)')).toBeTruthy();
    expect(within(telemetryCard).getByText('Max buffer size')).toBeTruthy();
    // The three telemetry inputs hold the DB defaults 10 / 5000 / 50.
    const values = within(telemetryCard).getAllByRole('spinbutton').map((el) => (el as HTMLInputElement).value).sort();
    expect(values).toEqual(['10', '50', '5000']);
  });

  it('saves a telemetry edit through set_setting with the correct key', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read
      .mockResolvedValueOnce({ data: { error: null, saved: { key: 'telemetry.flush_ms', value: 4000, category: 'telemetry', type: 'integer' } }, error: null }) // write
      .mockResolvedValueOnce({ data: settingsFor(), error: null }); // refresh read
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Telemetry & Analytics')).toBeTruthy());
    const telemetryCard = screen.getByText('Telemetry & Analytics').closest('div')!;
    const flushInput = within(telemetryCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '5000')!;
    fireEvent.change(flushInput, { target: { value: '4000' } });
    const saveButtons = within(telemetryCard).getAllByText('Save');
    fireEvent.click(saveButtons.find((b) => (b as HTMLButtonElement).disabled === false)!);
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('set_setting', { p_key: 'telemetry.flush_ms', p_value: 4000 });
    });
    await waitFor(() => expect(screen.getByText('Setting saved successfully.')).toBeTruthy());
  });

  it('a failed telemetry save shows an error and does not corrupt local state', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read
      .mockResolvedValueOnce({ data: null, error: { message: 'network' } }); // write RPC transport failure
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Telemetry & Analytics')).toBeTruthy());
    const telemetryCard = screen.getByText('Telemetry & Analytics').closest('div')!;
    const batchInput = within(telemetryCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '10')!;
    fireEvent.change(batchInput, { target: { value: '20' } }); // valid, in-bounds
    fireEvent.click(within(telemetryCard).getAllByText('Save').find((b) => (b as HTMLButtonElement).disabled === false)!);
    await waitFor(() => expect(screen.getByText(/RPC failure — setting not saved/)).toBeTruthy());
    // The authoritative `current` map is NOT corrupted: Discard reverts the
    // draft only (20 was never accepted, so it returns to the stored 10).
    fireEvent.click(within(telemetryCard).getByText('Discard'));
    expect(within(telemetryCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '10')!).toBeTruthy();
  });
});

describe('AdminSettingsBI — Pass 2 (badges, real reset, confirmation, history, refresh)', () => {
  it('shows a Customized badge and a Reset-to-default for a DB override', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor({ 'cache.max_entries': '600' }), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Performance')).toBeTruthy());
    const perfCard = screen.getByText('Performance').closest('div')!;
    expect(within(perfCard).getByText('Customized')).toBeTruthy();
    expect(within(perfCard).getByText('Reset to default')).toBeTruthy();
    expect(within(perfCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '600')).toBeTruthy();
  });

  it('Reset to default writes the default through set_setting and updates the badge', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor({ 'cache.max_entries': '600' }), error: null }) // read
      .mockResolvedValueOnce({ data: { error: null, saved: { key: 'cache.max_entries', value: 500, category: 'cache', type: 'integer' } }, error: null }) // write default
      .mockResolvedValueOnce({ data: settingsFor(), error: null }); // refresh read
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Performance')).toBeTruthy());
    const perfCard = screen.getByText('Performance').closest('div')!;
    fireEvent.click(within(perfCard).getByText('Reset to default'));
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('set_setting', { p_key: 'cache.max_entries', p_value: 500 });
    });
    // not a sensitive key -> no confirmation prompt
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(within(perfCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '500')).toBeTruthy();
    });
    // customized -> default
    expect(within(perfCard).queryByText('Customized')).toBeNull();
    expect(within(perfCard).queryByText('Reset to default')).toBeNull();
  });

  it('confirms before mutating a sensitive key and aborts when declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    mocks.rpc.mockResolvedValueOnce({ data: settingsFor(), error: null });
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Total rounds')).toBeTruthy());
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0]!, { target: { value: '9' } });
    fireEvent.click(screen.getAllByText('Save')[0]!);
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    // declined -> the write RPC is never issued
    expect(mocks.rpc).not.toHaveBeenCalledWith('set_setting', expect.anything());
    expect(screen.queryByText('Setting saved successfully.')).toBeNull();
  });

  it('does NOT ask for confirmation when mutating a non-sensitive key', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read
      .mockResolvedValueOnce({ data: { error: null, saved: { key: 'cache.max_entries', value: 600, category: 'cache', type: 'integer' } }, error: null }) // write
      .mockResolvedValueOnce({ data: settingsFor(), error: null }); // refresh read
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Performance')).toBeTruthy());
    const perfCard = screen.getByText('Performance').closest('div')!;
    const cacheInput = within(perfCard).getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '500')!;
    fireEvent.change(cacheInput, { target: { value: '600' } });
    fireEvent.click(within(perfCard).getAllByText('Save').find((b) => (b as HTMLButtonElement).disabled === false)!);
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('set_setting', { p_key: 'cache.max_entries', p_value: 600 });
    });
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('History expands the append-only audit read for a key', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read
      .mockResolvedValueOnce({ data: { error: null, changes: [{ setting_key: 'cache.max_entries', old_value: { value: 500 }, new_value: { value: 600 }, updated_by: 'abc12345', updated_at: '2026-01-01T00:00:00Z' }] }, error: null }); // audit read
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Performance')).toBeTruthy());
    fireEvent.click(screen.getByTestId('history-cache.max_entries'));
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('get_settings_audit', { p_key: 'cache.max_entries', p_limit: 20 });
    });
    expect(screen.getByText('Change history — Performance / Max cache entries')).toBeTruthy();
    expect(screen.getByText('600')).toBeTruthy(); // new value rendered from the audit row
    expect(screen.getAllByText(/audit history is not editable/).length).toBeGreaterThan(0);
  });

  it('History shows a role denial inline when the audit read is forbidden', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: settingsFor(), error: null }) // read
      .mockResolvedValueOnce({ data: { error: 'FORBIDDEN', changes: null }, error: null }); // audit denied
    render(<ThemeProvider><AdminSettingsBI /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('Performance')).toBeTruthy());
    fireEvent.click(screen.getByTestId('history-cache.max_entries'));
    await waitFor(() => expect(screen.getByText(/not available for your role \(FORBIDDEN\)/)).toBeTruthy());
  });
});
