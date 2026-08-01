# Migration Dependency Map — `supabase/migrations/`

Execution order and why each file must stay in its place. The live database was
built manually, so **00008–00013 must be applied in order** after the baseline
queries are folded in. The legacy files (00001–00007, 003, 004) predate the
contract and are listed for completeness only.

```
legacy: 00001 ─┐
        00002 ─┤ pre-contract (repair OS + users) — apply order historical
        00005 ─┤
        00006 ─┤
        003   ─┤
        004   ─┘

Phase A: 00008  Baseline documentation — no-op on live DB; provides the CREATE
         path + update_updated_at + campaigns/users for fresh builds.
           │
Phase B: 00009  Contract tables (system_settings, audit_log, job_assignments).
         │      FK to campaigns/users → MUST follow 00008.
           │
Phase B: 00010  Additive columns (campaigns/sessions/analytics_events) + indexes.
         │      Adds campaign_version + abandon_timeout_minutes (read by 00011),
         │      and the columns backfilled by 00012.
           │
Phase C: 00011  lookup_campaign_by_short_code_v2. Reads 00010 columns; status
         │      classification is most accurate once 00012 has run.
           │
Phase D: 00012  Backfill status/campaign_version/campaign_snapshot/schema_version.
         │      Writes columns created by 00010.
           │
Phase E: 00013  Documentation only (future constraints roadmap). No objects.
```

## Why this order (do not reorder)

1. **00008 before 00009** — `job_assignments` has foreign keys to
   `campaigns(id)` and `users(id)`; both exist only via the baseline on a fresh
   database. `00009` also reuses `update_updated_at()`, created by 00008.
2. **00010 before 00011** — v2 selects `campaign_version` and
   `abandon_timeout_minutes`; those columns do not exist before 00010.
3. **00010 before 00012** — the backfill writes columns created by 00010
   (`campaign_snapshot`, `status` values, `schema_version`).
4. **00011 before 00012** — placing v2 first means it is already in place when
   data becomes contract-accurate. (It would still work reversed, since v2
   treats legacy `'active'` as `running`, but 00011→00012 keeps the DB
   "contract-accurate + resolvable" at every intermediate step.)
5. **00013 last** — it creates no objects and must never block anything.

## Constraints on future migrations

- Always append with the next lexicographic number (00014, …).
- Any migration that touches `campaigns.status`/`is_active`, `job_assignments.status`,
  or `sessions.status` must be reviewed against the state machines in 00013
  **before** the Phase-E app conversion flips the defaults.
- Never edit an applied migration in a way that changes its SQL; prefer a new
  additive file (see Rollback Notes in each header).
