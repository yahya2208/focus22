import { describe, it, expect } from 'vitest';

/**
 * SIMULATION ONLY — in-memory model of the leased-claim protocol from
 * G_N3_RELIABILITY_DESIGN.md. Proves protocol LOGIC (single-winner races,
 * crash recovery, fencing, retry collapse). Does NOT prove Deno, Postgres,
 * or push-provider behavior — those need the live stack.
 */

type Status = 'claimed' | 'sent' | 'failed_permanent' | 'failed_retryable';
interface Row {
  status: Status;
  gen: number;
  claimedAt: number;
}
const LEASE_MS = 10 * 60 * 1000;

class ClaimStore {
  rows = new Map<string, Row>();
  sends: string[] = [];
  private genSeq = 0;
  constructor(public now = 0) {}
  key(orderId: string, endpoint: string) {
    return `${orderId}|${endpoint}`;
  }
  // Returns generation on win, null on loss. Mirrors:
  // INSERT ... ON CONFLICT DO NOTHING RETURNING generation.
  claim(orderId: string, endpoint: string): number | null {
    const k = this.key(orderId, endpoint);
    if (this.rows.has(k)) return null;
    const gen = ++this.genSeq;
    this.rows.set(k, { status: 'claimed', gen, claimedAt: this.now });
    return gen;
  }
  // Reclaim mirrors the atomic UPDATE ... RETURNING generation.
  reclaim(orderId: string, endpoint: string): number | null {
    const k = this.key(orderId, endpoint);
    const r = this.rows.get(k);
    if (!r) return this.claim(orderId, endpoint);
    const stale = r.status === 'claimed' && this.now - r.claimedAt > LEASE_MS;
    const retryable = r.status === 'failed_retryable';
    if (!stale && !retryable) return null;
    const gen = ++this.genSeq;
    this.rows.set(k, { status: 'claimed', gen, claimedAt: this.now });
    return gen;
  }
  // Fenced completion: only current-generation holder transitions.
  complete(orderId: string, endpoint: string, gen: number, status: 'sent' | 'failed_permanent' | 'failed_retryable'): boolean {
    const k = this.key(orderId, endpoint);
    const r = this.rows.get(k);
    if (!r || r.gen !== gen) return false;
    this.rows.set(k, { ...r, status });
    return true;
  }
  send(orderId: string, endpoint: string) {
    this.sends.push(`${orderId}|${endpoint}`);
  }
}

describe('leased-claim protocol simulation (G-N3 design)', () => {
  it('concurrent race: exactly one sender', () => {
    const s = new ClaimStore();
    const results = [s.claim('o1', 'e1'), s.claim('o1', 'e1'), s.claim('o1', 'e1')];
    expect(results.filter((g) => g !== null)).toHaveLength(1);
  });

  it('crash after claim recovers via lease reclaim', () => {
    const s = new ClaimStore();
    const g1 = s.claim('o1', 'e1')!;
    // Crash: holder dies without completing. Time passes beyond lease.
    s.now += LEASE_MS + 1;
    const g2 = s.reclaim('o1', 'e1');
    expect(g2).not.toBeNull();
    expect(g2).not.toBe(g1);
    expect(s.complete('o1', 'e1', g2!, 'sent')).toBe(true);
    s.send('o1', 'e1');
    expect(s.sends).toHaveLength(1);
  });

  it('stale holder cannot complete after reclaim (fencing)', () => {
    const s = new ClaimStore();
    const g1 = s.claim('o1', 'e1')!;
    s.now += LEASE_MS + 1;
    const g2 = s.reclaim('o1', 'e1')!;
    // Stale holder's late completion is ignored.
    expect(s.complete('o1', 'e1', g1, 'sent')).toBe(false);
    expect(s.rows.get('o1|e1')!.gen).toBe(g2);
  });

  it('timeout ambiguity: retry re-sends at most once more, then collapses', () => {
    const s = new ClaimStore();
    const g1 = s.claim('o1', 'e1')!;
    s.send('o1', 'e1'); // provider may or may not have delivered (timeout)
    s.complete('o1', 'e1', g1, 'failed_retryable'); // unknown outcome → retryable
    const g2 = s.reclaim('o1', 'e1')!;
    s.send('o1', 'e1');
    s.complete('o1', 'e1', g2, 'sent');
    // Worst case: 2 physical sends for 1 logical event (display-deduped).
    expect(s.sends).toHaveLength(2);
    // A third retry finds terminal state and skips.
    expect(s.reclaim('o1', 'e1')).toBeNull();
  });

  it('retry storm collapses to zero extra sends', () => {
    const s = new ClaimStore();
    const g = s.claim('o1', 'e1')!;
    s.send('o1', 'e1');
    s.complete('o1', 'e1', g, 'sent');
    for (let i = 0; i < 5; i++) expect(s.reclaim('o1', 'e1')).toBeNull();
    expect(s.sends).toHaveLength(1);
  });

  it('410 is terminal and never retried', () => {
    const s = new ClaimStore();
    const g = s.claim('o1', 'e1')!;
    s.complete('o1', 'e1', g, 'failed_permanent');
    s.now += LEASE_MS * 100;
    expect(s.reclaim('o1', 'e1')).toBeNull();
  });

  it('multi-device fan-out sends once per endpoint, independently', () => {
    const s = new ClaimStore();
    for (const ep of ['e1', 'e2', 'e3']) {
      const g = s.claim('o1', ep)!;
      s.send('o1', ep);
      s.complete('o1', ep, g, 'sent');
    }
    expect(s.sends).toHaveLength(3);
  });
});
