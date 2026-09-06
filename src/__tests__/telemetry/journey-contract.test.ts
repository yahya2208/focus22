import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthState, AuthUser } from '../../core/auth';
import { recordScan, recordFunnel } from '../../services/qr-measurement';

const mocks = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const mockAuthGetUser = vi.fn(
    async (): Promise<{ data: { user: { id: string } | null }; error: null }> => ({
      data: { user: { id: 'user-123' } },
      error: null,
    }),
  );
  const getSupabaseClient = vi.fn(() => ({ rpc: mockRpc, auth: { getUser: mockAuthGetUser } }));
  return { mockRpc, mockAuthGetUser, getSupabaseClient };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  getJourneyId,
  reconcileJourneyIdentity,
  resetJourneyId,
} from '../../core/telemetry/journey';
import { track, flushNow, resetTelemetry, getTelemetrySessionId } from '../../core/telemetry/client';
import { getVisitorHash, resetVisitorId } from '../../services/intent-tracking';

/**
 * Wave B — Journey Identity contract.
 * Semantics under test (journey.ts):
 *   1. journey_id is opaque, independent of session_id / anonymous_id / user_id;
 *   2. created CLIENT-side + persisted in localStorage (offline-safe);
 *   3. KEPT across anonymous→authenticated and page reloads;
 *   4. ROTATED on sign-out, registered→registered switch, registered→anonymous;
 *   5. app telemetry session_id STAYS a per-page-load id (NEVER equal to the
 *      scientific sessions.id or the journey id);
 *   6. no new producers: QR/marketplace/game/ttt wiring untouched (no event).
 */

function guest(id: string): AuthUser {
  return { id, email: null, displayName: null, role: 'guest', isAnonymous: true, createdAt: '2026-01-01' };
}

function registered(id: string): AuthUser {
  return { id, email: 'u@example.com', displayName: null, role: 'user', isAnonymous: false, createdAt: '2026-01-01' };
}

function authState(partial: Pick<AuthState, 'status'> & { user?: AuthUser | null }): AuthState {
  return { status: partial.status, user: partial.user ?? null, error: null };
}

function seedLocalStorage(): void {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  resetVisitorId();
  resetJourneyId();
}

describe('Journey Identity — creation & persistence', () => {
  beforeEach(() => seedLocalStorage());
  afterEach(() => seedLocalStorage());

  it('creates an opaque journey id on first use (non-PII, uuid-shaped)', () => {
    const id = getJourneyId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(8);
    expect(id).not.toBe(getVisitorHash());
    expect(id).not.toBe(getTelemetrySessionId());
  });

  it('persists across "reload" (localStorage survives module state reset)', async () => {
    const first = getJourneyId();
    vi.resetModules();
    const fresh = await import('../../core/telemetry/journey');
    expect(fresh.getJourneyId()).toBe(first);
  });

  it('multi-tab: two "instances" of the same browser profile share one journey', async () => {
    vi.resetModules();
    const modA = await import('../../core/telemetry/journey');
    const idA = modA.getJourneyId();
    vi.resetModules();
    const modB = await import('../../core/telemetry/journey');
    expect(modB.getJourneyId()).toBe(idA);
  });

  it('resetJourneyId clears the persisted identity (next call creates a new one)', () => {
    const first = getJourneyId();
    resetJourneyId();
    const second = getJourneyId();
    expect(second).not.toBe(first);
  });
});

describe('Journey Identity — reconciliation (anonymous → auth → logout → switch)', () => {
  beforeEach(() => seedLocalStorage());
  afterEach(() => seedLocalStorage());

  it('anonymous → authenticated keeps the SAME journey (the contract junction)', () => {
    const asGuest = reconcileJourneyIdentity(authState({ status: 'anonymous', user: guest('uid-guest') }));
    const afterLogin = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('uid-reg') }));
    expect(afterLogin).toBe(asGuest);
  });

  it('guest→member upgrade that KEEPS the uid also keeps the journey', () => {
    const asGuest = reconcileJourneyIdentity(authState({ status: 'anonymous', user: guest('uid-x') }));
    const upgraded = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('uid-x') }));
    expect(upgraded).toBe(asGuest);
  });

  it('same-user refresh/reload keeps the journey', () => {
    const first = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u1') }));
    reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u1') }));
    expect(getJourneyId()).toBe(first);
  });

  it('sign-out rotates to a fresh journey (no post-logout contamination)', () => {
    const before = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u1') }));
    const afterLogout = reconcileJourneyIdentity(authState({ status: 'unauthenticated' }));
    expect(afterLogout).not.toBe(before);
    const nextPage = getJourneyId();
    expect(nextPage).toBe(afterLogout);
  });

  it('registered→registered account switch rotates (journey A + user B is impossible)', () => {
    const a = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u-a') }));
    const b = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u-b') }));
    expect(b).not.toBe(a);
  });

  it('registered → anonymous without sign-out also rotates', () => {
    const before = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u-a') }));
    const after = reconcileJourneyIdentity(authState({ status: 'anonymous', user: guest('uid-g2') }));
    expect(after).not.toBe(before);
  });

  it('no cross-user contamination across a full user-A → logout → user-B flow', () => {
    const journeyA = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u-a') }));
    reconcileJourneyIdentity(authState({ status: 'unauthenticated' }));
    const journeyB = reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('u-b') }));
    expect(journeyB).not.toBe(journeyA);
  });
});

describe('Journey Identity — telemetry inheritance (track)', () => {
  beforeEach(() => {
    seedLocalStorage();
    vi.clearAllMocks();
    mocks.getSupabaseClient.mockImplementation(() => ({ rpc: mocks.mockRpc, auth: { getUser: mocks.mockAuthGetUser } }));
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
    mocks.mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });
  afterEach(() => {
    seedLocalStorage();
    resetTelemetry();
  });

  it('every wired row carries the same journey_id across events', async () => {
    await track({ event: 'screen_view', screen: 'home', properties: { from: '', is_initial: true } });
    await track({ event: 'product_view', entityType: 'product', entityId: 'p-1' });
    await flushNow();
    const events = mocks.mockRpc.mock.calls[0]![1].p_events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    const journeyId = getJourneyId();
    expect(events[0]!.journey_id).toBe(journeyId);
    expect(events[1]!.journey_id).toBe(journeyId);
  });

  it('journey_id survives a page reload while session_id rotates (session ≠ journey)', async () => {
    await track({ event: 'app_open' });
    await flushNow();
    const before = mocks.mockRpc.mock.calls[0]![1].p_events[0] as Record<string, unknown>;
    const journeyBefore = before.journey_id;
    const sessionBefore = before.session_id;

    // simulate reload: fresh module state = new telemetry session id
    const journeyAfter = getJourneyId();
    resetTelemetry();
    const sessionAfter = getTelemetrySessionId();
    expect(sessionAfter).not.toBe(sessionBefore);
    expect(journeyAfter).toBe(journeyBefore);
  });

  it('maps anonymous AND authenticated events into one journey (reconciliation visible on the wire)', async () => {
    reconcileJourneyIdentity(authState({ status: 'anonymous', user: guest('uid-g') }));
    await track({ event: 'screen_view', screen: 'home', properties: { is_initial: true } });
    await flushNow();
    const anonJourney = (mocks.mockRpc.mock.calls[0]![1].p_events[0] as Record<string, unknown>).journey_id;

    vi.clearAllMocks();
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
    reconcileJourneyIdentity(authState({ status: 'authenticated', user: registered('uid-r') }));
    mocks.mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'uid-r' } }, error: null });
    await track({ event: 'order_created', entityType: 'order', properties: { channel: 'in-app' } });
    await flushNow();
    const regJourney = (mocks.mockRpc.mock.calls[0]![1].p_events[0] as Record<string, unknown>).journey_id;
    expect(regJourney).toBe(anonJourney);
  });

  it('journey_id is a non-PII token (uuid chars, bounded length)', () => {
    const id = getJourneyId();
    expect(id).toMatch(/^[0-9a-fA-F-]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe('Session reconciliation & QR compatibility (Wave B non-expansion)', () => {
  it('app telemetry session_id is a per-page-load id — never a scientific sessions.id or the journey id', () => {
    seedLocalStorage();
    try {
      const journey = getJourneyId();
      const telemetrySession = getTelemetrySessionId();
      const scientificSession = '689a712e-a11d-4a25-a4a2-023436d5a216';
      expect(telemetrySession).not.toBe(scientificSession);
      expect(journey).not.toBe(scientificSession);
      expect(journey).not.toBe(telemetrySession);
    } finally {
      seedLocalStorage();
    }
  });

  it('QR rail RPCs are untouched by Wave B (existing producers still exported)', () => {
    expect(typeof recordScan).toBe('function');
    expect(typeof recordFunnel).toBe('function');
  });
});