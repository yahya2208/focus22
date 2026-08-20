/**
 * Active Challenge Resolver — Global Active Challenge Override
 *
 * When a playable challenge exists, normal game entry is redirected to the
 * challenge page. This module is the single source of truth for that decision.
 *
 * CACHING:
 *   Successful results are cached for 10 seconds. This prevents rapid
 *   re-fetching when the user navigates between screens, while keeping
 *   the stale window small enough that challenge expiration (ends_at)
 *   takes effect promptly.
 *
 *   The cache is invalidated when:
 *     - The cache expires (10s TTL)
 *     - invalidateActiveChallengeCache() is called (e.g. from challenge-page
 *       when the user sees a non-playable challenge)
 *
 *   IMPORTANT: RPC failures are NEVER cached. On error, the resolver returns
 *   null (safe fallback → normal game) for this single call, but does NOT
 *   store null as a cached result. The next call will re-fetch, giving the
 *   RPC a chance to succeed. This prevents a temporary network blip from
 *   creating a 10-second window where the challenge is bypassable.
 *
 * FAILURE HANDLING:
 *   If get_active_challenge() fails (network error, server error), the resolver
 *   returns 'countdown' (normal game flow) for that single call only.
 *   The failure is NOT cached. A failed check should never create an
 *   incorrect challenge state that persists.
 *
 * RULES:
 *   - Only ONE challenge should be playable at a time (server enforces via
 *     ORDER BY created_at ASC LIMIT 1 — oldest active wins).
 *   - Explicit challenge deep links (?challenge_id=UUID) take priority over
 *     this resolver. This resolver is ONLY for default game entry.
 *   - In-progress games are NOT interrupted. This resolver is ONLY checked
 *     at entry points.
 */

import { getSupabaseClient } from '../core/supabase/client';
import { setActiveChallengeId } from './challenge-context';
import type { ScreenName } from '../store/navigation';

const CACHE_TTL_MS = 10_000;

interface ActiveChallenge {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

interface CacheEntry {
  readonly challenge: ActiveChallenge | null;
  readonly timestamp: number;
}

let cache: CacheEntry | null = null;

/**
 * Resets the cache. Used in tests.
 */
export function resetActiveChallengeCache(): void {
  cache = null;
}

/**
 * Invalidates the active challenge cache.
 * Call when the user sees a non-playable challenge (e.g. challenge ended)
 * to ensure the next entry check fetches fresh data.
 */
export function invalidateActiveChallengeCache(): void {
  cache = null;
}

/**
 * Fetches the currently playable challenge from the server.
 * Returns null if no playable challenge exists.
 *
 * Uses a 30-second cache to avoid rapid re-fetching.
 * On network/server error, returns null (safe fallback: normal game flow).
 */
async function fetchActiveChallenge(): Promise<ActiveChallenge | null> {
  const now = Date.now();

  if (cache && (now - cache.timestamp) < CACHE_TTL_MS) {
    return cache.challenge;
  }

  try {
    const { data, error } = await getSupabaseClient().rpc('get_active_challenge');

    if (error) {
      // RPC failure: do NOT cache null. Return null for this call (safe
      // fallback → normal game), but let the next call re-fetch.
      // This prevents a temporary network blip from creating a window
      // where the challenge is bypassable.
      return null;
    }

    if (!data) {
      // RPC success + no data: no active challenge. Cache this result
      // for the full TTL — it's a valid server response.
      cache = { challenge: null, timestamp: now };
      return null;
    }

    const row = data as {
      id: string;
      name: string;
      description: string | null;
    };

    const challenge: ActiveChallenge = {
      id: row.id,
      name: row.name,
      description: row.description,
    };

    cache = { challenge, timestamp: now };
    return challenge;
  } catch {
    // Network error: do NOT cache null. Same reasoning as RPC failure.
    return null;
  }
}

/**
 * Resolves the default game entry screen.
 *
 * If a playable active challenge exists, sets it in the challenge context
 * and returns 'challenge-page'. Otherwise, returns 'countdown' (normal flow).
 *
 * This is the SINGLE authoritative decision point for normal game entry.
 * All entry points (HomeScreen Start button, PreGameMessageScreen, deep links
 * to #/game / #/game-intro / #/countdown) must call this.
 *
 * Explicit challenge deep links (?challenge_id=UUID) bypass this resolver
 * entirely and go directly to challenge-page for the specified challenge.
 *
 * @returns The screen to navigate to: 'challenge-page' or 'countdown'
 */
export async function resolveDefaultGameEntry(): Promise<ScreenName> {
  const challenge = await fetchActiveChallenge();

  if (challenge) {
    setActiveChallengeId(challenge.id);
    return 'challenge-page';
  }

  return 'countdown';
}
