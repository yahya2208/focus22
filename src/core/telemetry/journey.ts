/**
 * FOCUS Telemetry — Journey Identity (Wave B).
 *
 * One opaque, non-PII identifier for a user's trajectory across page loads and
 * across the anonymous→authenticated junction on a single device.
 *
 * Semantics (contract, owner-approved):
 *   - `journey_id` is an independent random UUID (Option A). It is NOT the
 *     anonymous identity, NOT the app `session_id`, and NOT a scientific
 *     `sessions.id`. It is deliberately decoupled from all three so that no
 *     identity is derivable from another.
 *   - Creation is purely CLIENT-side and synchronous (localStorage): telemetry
 *     stays non-blocking and works offline. The server only FORMAT-validates
 *     (no network round trip is required to own a journey).
 *   - Persistence: `localStorage['focus_journey_v1']` storing
 *     `{ "id", "auid", "anon" }`. Survives reload and browser restart; cleared
 *     with site data (same lifecycle as the `focus_vid_v1` visitor identity);
 *     fresh per incognito/profile. Multi-tab policy: tabs of the SAME browser
 *     profile share one journey (same device, same trajectory) — this is the
 *     explicit definition and is NOT accidental storage behavior.
 *   - Reconciliation (rotation) — deterministic, driven by the auth snapshot:
 *     1. No stored journey            → CREATE.
 *     2. Auth becomes `unauthenticated` (sign-out) → ROTATE.
 *     3. registered → registered uid  switch          → ROTATE (account switch).
 *     4. registered → anonymous without sign-out      → ROTATE.
 *     5. Everything else (reload, same-uid refresh,
 *        anonymous → authenticated upgrade or login)  → KEEP.
 *     This is the minimal rule set that guarantees a journey can NEVER jump
 *     from user A to user B except via the explicit anonymous→authenticated
 *     junction (upgrade), which the Wave B contract mandates.
 */
import type { AuthState } from '../auth';

const JOURNEY_KEY = 'focus_journey_v1';
const VALID_JOURNEY_RE = /^[0-9a-fA-F-]{1,64}$/;

interface JourneyRecord {
  readonly id: string;
  /** auth uid snapshot at last review; null when no auth session. */
  readonly auid: string | null;
  /** guest/anonymous snapshot at last review. */
  readonly anon: boolean;
}

function makeJourneyId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `j_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e12).toString(36)}`;
  }
}

function loadRecord(): JourneyRecord | null {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JourneyRecord>;
    if (typeof parsed.id !== 'string' || !VALID_JOURNEY_RE.test(parsed.id)) return null;
    return {
      id: parsed.id,
      auid: typeof parsed.auid === 'string' ? parsed.auid : null,
      anon: parsed.anon === true,
    };
  } catch {
    return null;
  }
}

function saveRecord(record: JourneyRecord): void {
  try {
    localStorage.setItem(JOURNEY_KEY, JSON.stringify(record));
  } catch {
    // storage unavailable — journey stays in-memory for the current load only
  }
}

/**
 * Return the current journey id, creating and persisting it on first use.
 * Cheap (localStorage read) and safe to call from `track()` for every row.
 */
export function getJourneyId(): string {
  const existing = loadRecord();
  if (existing) return existing.id;
  const record: JourneyRecord = { id: makeJourneyId(), auid: null, anon: false };
  saveRecord(record);
  return record.id;
}

/** Test seam / privacy control: clears the persisted journey identity. */
export function resetJourneyId(): void {
  try {
    localStorage.removeItem(JOURNEY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Apply the rotation rules above to an auth state transition. Returns the
 * journey id that is ACTIVE after the transition (same on keep, fresh on
 * rotate) and persists the new auth snapshot. Non-throwing.
 */
export function reconcileJourneyIdentity(state: AuthState): string {
  const nowId = loadRecord()?.id ?? getJourneyId();
  const nextAuid = state.user?.id ?? null;
  const nextAnon = Boolean(state.user?.isAnonymous);

  let stays = true;
  if (state.status === 'unauthenticated') {
    // sign-out (or no session): a fresh trajectory starts here.
    stays = false;
  } else if (state.status !== 'loading') {
    const prev = loadRecord();
    if (prev && prev.auid !== null && nextAuid !== null && prev.auid !== nextAuid) {
      // registered → registered switch (account switch)          → rotate
      // registered → anonymous without sign-out                   → rotate
      // anonymous → registered (upgrade / post-guest login)       → KEEP
      if (prev.anon === false) stays = false;
    }
  }

  if (!stays) {
    const id = makeJourneyId();
    saveRecord({ id, auid: nextAuid, anon: nextAnon });
    return id;
  }

  const prev = loadRecord();
  if (!prev || prev.auid !== nextAuid || prev.anon !== nextAnon) {
    saveRecord({ id: nowId, auid: nextAuid, anon: nextAnon });
  }
  return nowId;
}