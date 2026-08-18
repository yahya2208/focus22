/**
 * Challenge Context — Module-level active challenge state.
 *
 * Tracks which challenge (if any) the current game session belongs to.
 * Follows the same pattern as qr-measurement.ts (module-level closure,
 * fire-and-forget friendly, no React dependency).
 *
 * SETTER: Called by the entry-point flow when a challenge is detected
 *         (e.g. campaign QR scan resolves to a challenge, or a challenge
 *         URL parameter is present).
 *
 * GETTER: Called by ResultsScreen / useChallengeSubmission to decide
 *         whether to submit to the challenge system.
 */

let activeChallengeId: string | null = null;

export function setActiveChallengeId(id: string | null): void {
  activeChallengeId = id;
}

export function getActiveChallengeId(): string | null {
  return activeChallengeId;
}

/**
 * Test seam: resets the in-memory challenge context between tests.
 */
export function resetChallengeContextForTests(): void {
  activeChallengeId = null;
}
