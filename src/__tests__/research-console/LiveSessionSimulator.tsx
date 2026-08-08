import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { getGlobalEventPublisher } from '../../core/events';
import { getSupabaseClient } from '../../core/supabase/client';
import { markCompleted, markHeartbeat, markPatch } from '../../core/supabase/live-diagnostics';
import type { SessionAbandonedPayload, SessionCompletedPayload, SessionCreatedPayload } from '../../core/session/service';

/**
 * TEST-ONLY in-memory write-side simulator (P4).
 *
 * The research live-contract tests previously mounted the production
 * PersistenceProvider as the component that translated session-service events
 * into Supabase rows (against a fake client) so LiveDashboard's ≤10s contract
 * could be exercised end-to-end. P4 removed that writer from the production
 * runtime (the game is now local-only).
 *
 * This harness reproduces the exact same test-observable behaviour — fake-DB
 * session rows plus live-diagnostics marks (markPatch / markCompleted /
 * markHeartbeat) — directly from the global event publisher, with no
 * production persistence dependency. It is deliberately declared in the tests
 * tree and is NOT part of the application runtime.
 */
export function LiveSessionSimulator({ children }: { children: ReactNode }) {
  useEffect(() => {
    const publisher = getGlobalEventPublisher();

    const unsubCreated = publisher.subscribe<SessionCreatedPayload>('session_created', async (event) => {
      const { sessionId, gameMode, campaignId, placementId, createdAt } = event.payload;
      const client = getSupabaseClient();
      await client.from('sessions').insert({
        id: sessionId,
        plugin_id: gameMode,
        campaign_id: campaignId,
        placement_id: placementId,
        status: 'running',
        created_at: new Date(createdAt).toISOString(),
        updated_at: new Date(createdAt).toISOString(),
        measurements: null,
        scientific_results: null,
      });
      markHeartbeat(true);
    });

    const unsubCompleted = publisher.subscribe<SessionCompletedPayload>('session_completed', async (event) => {
      const { sessionId } = event.payload;
      const client = getSupabaseClient();
      await client.from('sessions').upsert({
        id: sessionId,
        status: 'completed',
        updated_at: new Date().toISOString(),
      });
      markPatch();
      markCompleted();
    });

    const unsubAbandoned = publisher.subscribe<SessionAbandonedPayload>('session_abandoned', async (event) => {
      const { sessionId } = event.payload;
      const client = getSupabaseClient();
      await client.from('sessions').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', sessionId);
      markPatch();
      markCompleted();
    });

    return () => {
      unsubCreated();
      unsubCompleted();
      unsubAbandoned();
    };
  }, []);

  return <>{children}</>;
}
