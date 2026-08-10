# Ads — Device-Linked Ads (BATCH 4A)

**المصدر:** AdsManager / `AdConfig` (src/services/ads-service.ts) · **النموذج:** Marketplace Mediator §10/§17.

> **سياسة التنفيذ:** SQL **additive** (ADD COLUMN + ADD CONSTRAINT **NOT VALID**) ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. القيود (CHECKs) تُفعَّل على الصفوف الجديدة/المعدّلة فورًا؛ **VALIDATE** النهائي (فحص الصفوف القديمة) يُؤجَّل لمهاجرة منفصلة **بعد** إصلاح كل صف موجود (صفوف الـ 7 الحية حاليًا `link=''` مع `enabled=true` تنتهك `ads_enabled_requires_link`).

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-ads-device-links-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

## Rollback
`02-ads-device-links-rollback.sql` — exact one-shot (DROP 4 constraints + DROP device_id).

## 🛑 HARD STOP — VALIDATE
القيم القيم الأربعة تُضاف **NOT VALID** فقط في هذه الدفعة. لا تُشغَّل `VALIDATE CONSTRAINT` حتى **يُصحّح المالك كل صف مخالف** (انظر `04-post-apply-verify.sql` section E: كل العدّادات يجب أن تكون 0). تنفيذ VALIDATE مبكرًا = فشل معروف ومتوقع.
