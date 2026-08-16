# Ads — Per-Slide Destinations (PHASE 4A · migration 00024)

**المصدر:** AdsManager gallery (Phase 4C سيرسل `destination_types[]` + `destinations[]`) · **النموذج:** ads-slide-devices (00021) — نفس نمط ADD COLUMN + CHECK **NOT VALID** + RPC باسم **جديد** superset.

> **سياسة التنفيذ:** SQL **additive** (ADD COLUMN nullable + ADD CONSTRAINT **NOT VALID** + RPC جديد واحد) ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. لا يمسّ 00020 / 00021 / 00022 / 00023 / RLS / Storage. صفوف ad_images الحالية تعمل دون تغيير (الحقلان يبدآن `NULL` = وراثة وجهة الإعلان).

## الهدف

إعطاء كل صورة في الـGallery وجهة (Destination) خاصة بها، مع بقاء الوراثة من وجهة الإعلان كخيار افتراضي:

```
destination_type IS NULL AND destination IS NULL  →  وراثة وجهة الإعلان (الافتراضي)
destination_type ∈ {external, whatsapp, internal} →  وجهة خاصة بهذه الصورة (من payload الخاص بها)
'phone' غير مسموح: الشرائح الهاتفية تُعبَّر حصراً عبر device_id (00021)
```

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-ads-slide-destinations-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only (probes مع ROLLBACK) | ⏳ owner: بعد التطبيق |

## Rollback
`02-ads-slide-destinations-rollback.sql` — exact one-shot (DROP 1 RPC + DROP constraint + DROP العمودين). يُفقد per-slide destination لكل الشرائح. لا يمسّ أي شيء آخر.

## 🛑 HARD STOP — VALIDATE
القيد يُضاف **NOT VALID** فقط في هذه الدفعة. لا تُشغَّل `VALIDATE CONSTRAINT ad_images_destination_type_valid` حتى يُصحّح المالك كل صف مخالف (انظر `04-post-apply-verify.sql` قسم F: `dest_type_assigned` يجب أن يبقى 0). تنفيذ VALIDATE مبكرًا = فشل معروف ومتوقع.

## Backward compatibility
- `ad_replace_images_devices` / `ad_add_image_devices` / `ad_replace_images` تبقى كما هي وتبقى executable — القديم يعمل دون تغيير.
- `ad_replace_images_destinations` هو **superset** جديد يقبل `device_ids[]` + `destination_types[]` + `destinations[]` في استدعاء واحد (نفس admin gate / path-prefix / object-existence / at-most-one-cover / all-or-nothing).

## Client side (مرحلة 4B فأحدث، ليست في هذا الملف)
- `ads-service` سيقرأ العمودين الجديدين في `loadGalleries` ويمرّرهما كحقول اختيارية في `AdImage`.
- عند وجود أي destination على الشرائح، يُستدعى `ad_replace_images_destinations`؛ وإلا يبقى على الـRPCs الحالية.
- صحة الـpayload (url/number/screen/params) لا تُفحص في الـDB — الـadapters هي مصدر الحقيقة عند العرض (مثل 00022/00023).
