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

## 🛑 HARD STOP
M2 closed at the implementation boundary — owner must run 1→2→3 then paste the `04` output. **M3/M4 غير معتمدين.**
