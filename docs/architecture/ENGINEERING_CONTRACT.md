# FOCUS CONSTITUTION — Engineering Contract v2.0

> **This document is the constitution of the FOCUS project.** It is the highest
> authority for how FOCUS is engineered and governed. It is Architecture Governance,
> not a usage guide. Every developer — human or AI — MUST read this document before
> touching the codebase.
>
> If the conversation history is lost (token/context limits), this file is the single
> source of truth for project philosophy. Do not rely on chat memory.
>
> **Table of contents:** 1 Engineering Rules · 2 Golden Rules · 3 Approval Workflow ·
> 4 Discovery Workflow · 5 Evidence Requirements · 6 Confidence Gate · 7 Regression
> Gate · 8 Production Readiness Gate · 9 Single Source of Truth Rules · 10 Domain
> Ownership · 11 Closed Areas · 12 Legacy Removal Rules · 13 Additive Change Rules ·
> 14 Rollback Strategy · 15 Architecture Roadmap (A→I) · 16 Completion Criteria ·
> 17 Definition of Production Ready · 18 Definition of Done · 19 Commit Rules ·
> 20 AI Developer Onboarding

## 1. Project Engineering Principles

1. **FOCUS is an existing production project.** Not greenfield, not a rewrite.
2. **First responsibility is understanding the system before touching it.**
3. Never modify code before understanding it.
4. Preserve production stability first. Writing code is secondary to understanding.
5. Do not optimize because you think it is better.
6. Do not refactor because you prefer another style.
7. Do not replace architecture without evidence.
8. Do not "clean up" anything without evidence.

## 2. Golden Rules

- **Single Source of Truth is the highest architectural rule.** Every domain must have
  exactly one source (Catalog, Inventory, Users, Sessions, Repair, Pricing, Popularity,
  Settings).
- **No LocalStorage key changes.**
- **No Inventory label changes.**
- **No Supabase schema breaking changes.**
- **No silent changes.** Never silently change architecture, rename APIs, delete code,
  or migrate storage.

## 3. Approval Workflow

Every change requires, in order, **no exceptions**:

```
Discovery
    ↓
Evidence
    ↓
Proposal
    ↓
Approval
    ↓
Implementation
    ↓
Verification
    ↓
Regression
    ↓
Documentation
```

Implementation is **forbidden until approval**.

## 4. Discovery Requirements

- Map the domain: **Reader / Writer / Owner / Consumers / Migration path**.
- Identify every duplicate logic instance before proposing unification.
- Never delete duplicates immediately. Identify first, propose second.

## 5. Evidence Requirements

- Evidence must be reproducible and cited (files, line numbers, command output).
- No assumptions. Report only facts.
- Evidence is required **before** any proposal.

## 6. Confidence Gate (REQUIRED)

> Before every response: **estimate your confidence.**

- If confidence **< 95%** → **DO NOT implement.** Ask for more evidence. Never guess.
- If confidence **≥ 95%** → proceed, and state the confidence level with the report.

This prevents the developer from improvising when a part of the project is not understood.

## 7. Regression Gate

Every verification must include:

- **Before** / **After** evidence
- Runtime evidence
- Tests
- Regression of all affected domains
- Production behavior
- Build
- TypeScript
- ESLint

## 8. Production Readiness Gate

A change is not done until:

- `tsc` is clean (0 errors)
- Build succeeds
- Full test suite passes (no regressions)
- ESLint introduces **0 new errors** (pre-existing warnings allowed)
- Before/After report delivered for the change

## 9. Single Source of Truth Rules

| Domain  | Source of Truth                         | Notes |
|---------|-----------------------------------------|-------|
| Catalog | `catalog/brands/*.json`                 | ONLY source of truth |
| Inventory | `InventoryService`                    | Nobody bypasses it |
| Production sessions | `store/navigation.tsx` (useReducer) | Repository layer is infrastructure only |

## 10. Domain Ownership

- **`phone-catalog.ts` is a Compatibility Facade only.** NOT source of truth.
- **Repositories are infrastructure only.** Production does not use them.
- **Seeder is a CLI.** It writes catalog tables; production reads JSON directly.

## 11. Forbidden Changes

- Modifying **closed systems** without explicit evidence of a new bug.

Closed (read-only unless new reproducible bug evidence):

- Live Sessions
- Session Lifecycle
- Realtime
- Research Console
- Live Dashboard
- Heartbeat
- Session Race Conditions
- QR Production Flow
- Runtime Diagnostics
- Observability

## 12. Legacy Removal Rules

- Identify **Reader / Writer / Owner / Consumers / Migration path** first.
- Migration path must exist before removal is proposed.
- Removal requires explicit approval and a documented rollback path.

## 13. Additive Change Rules

Every implementation must be:

- **Additive**
- **Safe**
- **Reversible**
- **Documented**
- **Idempotent**
- **Never destructive**

Never introduce mock, placeholder, temporary implementation, fake data, or hidden
fallback unless explicitly requested.

## 14. Rollback Strategy

- Prefer additive/reversible changes so rollback = removing the additive layer.
- Any fallback must be **removable later** by design.
- Migration files must be additive and safe to re-run (idempotent).

## 15. Architecture Roadmap (A → I)

```
A  Storage Unification
B  Inventory
C  Catalog
D  Legacy Removal
E  Duplicate Logic
F  Architecture Audit
G  Performance
H  Security
I  Database Audit
Final  Production Readiness Report
```

## 16. Completion Criteria

- Each phase ends with a report containing:
  **Problem / Evidence / Impact / Root Cause / Options / Recommendation / Risk /
  Regression Risk / Breaking Risk / Approval Request.**
- Repository must actually match documented state after each phase.

## 17. Definition of Production Ready

- All closed systems intact and unmodified (unless new bug evidence).
- Single Source of Truth holds for every domain.
- tsc clean, build clean, full tests pass, 0 new lint errors.
- No silent API renames, no storage migration without approval.
- Before/After evidence on file for every change.

## 18. Definition of Done (change-level)

- [ ] Discovery report
- [ ] Evidence cited
- [ ] Proposal approved
- [ ] Implementation additive/reversible
- [ ] Verification (tsc, build, tests, lint)
- [ ] Full regression (all affected domains)
- [ ] Documentation updated

## 19. Commit Rules

- **One commit = one logical change.** No mixed commits. If two phases share a file,
  rebuild the file in stages so the history reflects the real phases.
- No giant commits. Changes are grouped into logical units.
- Each group: **Review → Regression → Commit**.
- Closed-system changes are only committed with evidence of a new bug.
- Never commit secrets.
- Prefer `git add -p` hunk-level staging when a file mixes concerns; if hunks cannot be
  split without breaking compilation, rebuild the file in staged versions instead of
  forcing a broken commit.

## 20. AI Developer Onboarding

Read the constitution before any action. Then follow this startup sequence:

### 20.1 First response behavior (mandatory)

- **Before every response: estimate your confidence.** State it.
  - Confidence **< 95%** → **DO NOT implement.** Ask for more evidence. Never guess.
  - Confidence **≥ 95%** → proceed, and state the confidence with the report.

### 20.2 First session checklist

1. Run the Engineering Audit (verification only, no writes):
   `git status` · `git log` · `tsc` · `build` · `tests` · `lint` · modified files.
2. Compare the repository against the documented architecture (Sections 9–10).
3. Report ONLY facts. No assumptions.
4. Do NOT write code in the first task.

### 20.3 Mandatory rule before ANY change

- The working tree may contain uncommitted work from a previous developer.
  **Do not assume it is yours.** Attribute every change before committing it.
- Closed systems (Section 11) are read-only unless a NEW reproducible bug exists.
- The confidence gate (Section 6) applies to every response, not just code.

### 20.4 Session start / session end protocol

- **Session start:** verify the repository still matches documented state
  (tsc + tests + git status). The contract may have been the last thing written.
- **Session end:** deliver a report with Problem / Evidence / Impact / Root Cause /
  Options / Recommendation / Risk / Regression Risk / Breaking Risk / Approval Request.
  Update documentation. Do not leave silent changes behind.

### 20.5 Definition of a good first contribution

- A documentation or verification task with no production risk.
- Confidence ≥ 95% on every claim.
- No changes to closed systems.
- Committed as a single logical change with a clear message.

---
*Last updated: 2026-08-01 — established with the Production Cleanup bootstrap.*
