import type { ReactNode } from 'react';

/**
 * P4 — Game Personal-Data Minimization (2026-08-08)
 *
 * This component previously translated session-service events into Supabase
 * rows: it collected a device fingerprint, ensured a device + calibration
 * record, and wrote a running/completed session row, all gated behind an
 * authenticated user. P4 removes every one of those writes from the game
 * runtime — the game is now local-only and must not persist an identity, a
 * device fingerprint, a calibration, or a session.
 *
 * Reachability (verified at P4 execution): zero production importers — no
 * runtime screen, hook, service, or provider imports or mounts this component
 * (P3 gate PG-02). The research live-contract tests that previously used it as
 * a write-side simulator were adapted to an explicit in-memory harness.
 *
 * This file is retained as a documented no-op shell so the P4 acceptance gate
 * can statically verify the removed writers are absent from the source.
 */
export function PersistenceProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
