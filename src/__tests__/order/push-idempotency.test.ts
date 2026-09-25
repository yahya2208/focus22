import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * G-N3 FIX — push idempotency protocol pins (static; the Deno Edge runtime
 * cannot execute under vitest, so the claim-first send protocol is verified
 * structurally: claim insert precedes send, losers skip, transient failures
 * release the claim, 410 keeps it + revokes).
 */
const src = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/functions/order-push/index.ts'),
  'utf-8',
);

describe('order-push idempotency protocol', () => {
  it('claims the log row before sending (PK race absorbs concurrency)', () => {
    const claimAt = src.indexOf('insert({ order_id: orderId, endpoint: s.endpoint }');
    const sendAt = src.indexOf('webpush.sendNotification(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(claimAt);
  });

  it('skips losers and counts them', () => {
    expect(src).toContain('skipped += 1');
    expect(src).toContain('continue;');
  });

  it('releases the claim on transient failure, keeps it on 410', () => {
    expect(src).toContain('.from("push_log").delete().eq("order_id", orderId).eq("endpoint", s.endpoint)');
    expect(src).toContain('revoked_at');
  });

  it('never sends without holding the claim and never logs success falsely', () => {
    // No unconditional send path: the only sendNotification sits after claim.
    const sends = src.split('webpush.sendNotification(').length - 1;
    expect(sends).toBe(1);
    // Claim-then-check is the only push_log writer (no blind upsert remains).
    expect(src).not.toContain('.from("push_log").upsert(');
  });

  it('keeps the minimal payload contract', () => {
    const start = src.indexOf('const payload = JSON.stringify(');
    const payloadBlock = src.slice(start, src.indexOf('});', start));
    expect(payloadBlock).toContain('order_id: orderId');
    expect(payloadBlock).toContain('target: "pilot-store-ops"');
    expect(payloadBlock).not.toMatch(/phone|address|family_name|invite_email/);
  });
});
