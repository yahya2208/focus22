# G-N3 Reliability Design — leased claims with fencing (DRAFT, NOT APPLIED)

Status: design only. No migration applied, no Edge deployed, no secrets.
Parent: `00118_push_subscriptions.sql` (UNTOUCHED — this design is a SEPARATE
follow-up migration + Edge update, both pending owner review).

## 1. State diagram

```
            (no row) ──INSERT claim──▶ CLAIMED(gen N, t0)
            CLAIMED ──send 200───────▶ SENT (terminal; generation pinned)
            CLAIMED ──410/404────────▶ FAILED_PERMANENT + revoke endpoint
            CLAIMED ──transient/timeout/crash ──▶ FAILED_RETRYABLE
            FAILED_RETRYABLE ──reclaim (new gen)──▶ CLAIMED(gen N+1, t1)
            CLAIMED(gen N, age>lease) ──reclaim──▶ CLAIMED(gen N+1, t1)
```

## 2. Draft SQL (separate migration sketch — NOT a file, NOT applied)

```sql
ALTER TABLE public.push_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed','sent','failed_permanent','failed_retryable')),
  ADD COLUMN IF NOT EXISTS generation uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
```

## 3. Claim / reclaim / release protocol (fencing)

- **Claim:** `INSERT (order_id, endpoint, generation, status='claimed') ON
  CONFLICT DO NOTHING RETURNING generation`. Row returned ⇒ this invocation
  owns generation G. No row ⇒ another generation owns it ⇒ skip.
- **Complete:** `UPDATE push_log SET status='sent', sent_at=now()
  WHERE order_id AND endpoint AND generation=G` (fencing predicate).
  Zero rows affected ⇒ ownership lost (reclaimed meanwhile) ⇒ MUST NOT treat
  as success; just stop.
- **Transient/timeout failure:** `UPDATE ... SET status='failed_retryable'
  WHERE generation=G` (NOT delete — history preserved, retry finds it).
- **410/404:** revoke subscription + `status='failed_permanent'` (terminal).
- **Reclaim (stale or retryable):** single atomic statement —
  `UPDATE push_log SET status='claimed', generation=<new>, claimed_at=now()
   WHERE order_id AND endpoint AND status IN ('claimed','failed_retryable')
   AND (status='failed_retryable' OR claimed_at < now() - interval '10 min')
   RETURNING generation`. Only the holder of the NEW token may complete;
  a stale holder's completion UPDATE matches 0 rows (fencing), and even if
  its send already went out, the client dedup tag collapses the duplicate.
- **Why generation beats claimed_at-TTL alone:** TTL alone lets a stale
  holder complete AFTER a reclaim (its UPDATE has no way to know it lost
  ownership). The generation predicate makes every transition conditional
  on current ownership — stale completions are structurally impossible.

## 4. Failures and actual guarantees

| Case | Old design | Leased design |
|---|---|---|
| Crash after claim | silent permanent miss | reclaimed after 10-min lease → sent |
| Provider accept + timeout | duplicate via release-delete | marked retryable → reclaimed with NEW generation; duplicate send possible but display-collapsed; old holder fenced from completing |
| Concurrent webhook ×N | one sends (PK) | one sends (PK + generation) |
| Retry storm | re-skips (log present) | skips via claim present (any non-reclaimable state) |
| 410 mid-flight | revoked, claim kept | revoked, terminal state |
| Stale holder completes late | N/A (no fencing) | 0-row update, ignored |

Honest residual: duplicates across timeout ambiguity remain physically
possible (provider accepted, we timed out, retry re-sends). Eliminating that
requires provider-side idempotency keys, which Web Push lacks — the client
dedup tag (`new-order:<id>`) is the backstop, and it holds. Crash-miss is
eliminated (bounded 10-min recovery). Exactly-once is NOT claimed.

## 5. Tests
`src/__tests__/order/push-lease-simulation.test.ts` — in-memory model of the
PK store + generation fencing + controllable clock; scenarios: concurrent
race (one sender), crash-after-claim (recovery), timeout ambiguity (bounded
duplicate, fenced completion), 410 terminal, retry storm (single send),
stale-holder completion ignored. Labeled SIMULATION in-file: proves protocol
logic, not Deno/DB/provider behavior.

## 6. Remaining risks → decision
- Needs Deno/DB/provider proof before general availability (stated, not waived).
- Lease constant (10 min) is a guess pending latency measurement.
- Sweeper absent by design (lazy reclaim); add cron only if stale-claim
  telemetry shows buildup.
- **Decision: APPROVED FOR LIMITED PILOT** (bounded recovery + harmless
  duplicates), **NOT for general availability** (needs live proof + tuning).
