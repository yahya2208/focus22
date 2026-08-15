# Ads — Destination-Aware Enabled Rule (STEP 2 · migration 00023)

**المصدر:** Generic Ads System (Step 1 contract) — `ads-service.ts` / `AdConfig`. **الهدف:** تعديل دلالة قيد `ads_enabled_requires_link` ليتوافق مع نظام الـ destinations الجديد.

> **سياسة التنفيذ:** SQL **تصحيحي على قيد واحد فقط** (DROP + ADD بنفس الاسم، **NOT VALID** — بدون VALIDATE) ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. لا يُمسّ أي شيء آخر: قيود الهاتف الأربعة الأخرى، RLS، Storage، RPCs، `ad_images`، الـ mirror trigger، adapters، أو `AdsManager`.

## What this step is
تغيير دلالة `ads_enabled_requires_link` من القاعدة الهاتفية فقط إلى قاعدة destination-aware:

| الحالة | النتيجة |
|---|---|
| `enabled = FALSE` | ✅ PASS |
| `enabled` + `phone` + `link` غير فارغ | ✅ PASS |
| `enabled` + `external` / `internal` / `whatsapp` | ✅ PASS (الوجهة في `destination`) |
| `enabled` + `phone` + `link` فارغ | ❌ FAIL |

**لا يوجد أي fallback** بين `destination` و`link` — كل نوع يُحكم بفرعه بدقة.

## Why NOT VALID (وليس VALIDATED)
صفوف الـ7 الحية (phone + enabled + `link=''`) ما زالت تخالف فرع الهاتف في القاعدة الجديدة — فـVALIDATE الآن سيفشل. البقاء **NOT VALID** يطابق فلسفة Batch 4A تماماً: القواعد تُفعَّل على الصفوف الجديدة/المعدّلة فوراً، وVALIDATE النهائي يُؤجَّل حتى يُصلح المالك كل صف مخالف (يجب أن يصبح `rows_violate_new_enabled_rule = 0` في Section E من الـverify).

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-ads-destination-enabled-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

## Rollback
`02-ads-destination-enabled-rollback.sql` — exact one-shot: يعيد تعريف Batch 4A حرفياً (`CHECK (enabled = FALSE OR btrim(link) <> '') NOT VALID`) بنفس الاسم.

## ملاحظات الاعتماد على الـschema الحالي
- القاعدة الجديدة تعتمد على `destination_type` (من migration 00022 / باتش `ads-generic-destinations`) — يجب أن تكون أعمدة الـ destination موجودة قبل التطبيق (يتحقق منها الـ evidence Section B).
- الـ constraint **غير مُرآى** في أي migration مرقّم قبل هذا الباتش — انظر المرآة `supabase/migrations/00023_ads_destination_enabled.sql` (FILE ONLY, NOT EXECUTED — مصدر الحقيقة هو `01-*-apply.sql`).

## 🛑 HARD STOP — VALIDATE
لا تُشغَّل `VALIDATE CONSTRAINT ads_enabled_requires_link` حتى يُصحّح المالك كل صف مخالف (`rows_violate_new_enabled_rule = 0` في `04-post-apply-verify.sql` Section E). تنفيذ VALIDATE مبكراً = فشل معروف ومتوقع.
