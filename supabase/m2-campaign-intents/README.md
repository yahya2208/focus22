# M2 — Campaign Intent Counters (Marketplace Mediator §17–§20)

**المصدر:** `docs/audits/marketplace-mediator-model-audit.md` §17–§20 (design) · §31 N4/N5/N6 (approval) · **التقرير:** `docs/audits/m2-marketplace-mediator-gate-report.md`

> **سياسة التنفيذ:** SQL **additive** ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. أي ملف خارج هذا المجلد (frozen: `analytics_events`, `qr_codes`, `placements`, `placement_history`, `increment_qr_counter`, `lookup_scan_context`) **لا يُلمس**. لا قراءة/كتابة مباشرة من العميل لـ `campaigns` للعدادات.

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-campaign-intents-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

## Rollback
`02-campaign-intents-rollback.sql` — exact one-shot (`DROP TABLE` + `DROP FUNCTION`).

## BATCH 4A — device_id cap 32 → 64 (widening ONLY)

> Why: `intent-tracking.ts` (frozen) sends the ad's `InventoryRecord.id` raw. Inventory ids are `crypto.randomUUID()` = **36 chars** (or `id_<ts>_<rand>` ≈ 25) — the 32-cap rejects the 36-char UUIDv4 the phone-linked ad flow writes. Cap widened to 64 (strictly more permissive; only the CHECK + RPC change, nothing else on the M2 surface).

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `08-device-id-cap-64-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `06-device-id-cap-64-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `09-device-id-cap-64-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

**Rollback:** `07-device-id-cap-64-rollback.sql` (restores CHECK + RPC to 32). Do NOT roll back if any row > 32 chars exists — the restored cap would reject them.

## 🛑 HARD STOP
M2 closed at the implementation boundary — owner must run 1→2→3 then paste the `04` output. **M3/M4 غير معتمدين.**
