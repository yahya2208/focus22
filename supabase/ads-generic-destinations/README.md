# Ads — Generic Destinations (PHASE 1 FOUNDATION · migration 00022)

**المصدر:** Generic Ads System (PHASE 1) — اعتماد المصمّم المعتمد. **النموذج:** جداول `ads` / `ad_images` الحالية + تصميم "destination_type + destination JSONB".

> **سياسة التنفيذ:** SQL **additive** (ADD COLUMN + ADD CONSTRAINT) ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. **لا** يعيد تنفيذ 00020 / 00021 (سجلات تاريخية لتغييرات مطبّقة فعلًا). **لا** يمسّ RLS / Storage / الـ triggers / RPCs / `ad_images`.

## What this phase is
قاعدة بيانات فقط: `destination_type` + `destination` (JSONB) + `title` على `ads` + CHECK على الأنواع المسموحة. التوافق الرجعي إلزامي — كل الإعلانات القائمة تبقى كما هي (backfill تلقائي عبر default: `'phone'` / `'{}'` / `''`).

## What this phase is NOT
لا يوجد: destination resolvers، adapters، External/WhatsApp/Internal destinations، تغييرات Ads Manager، جدولة، entity destinations (سيارات/عقارات/منتجات)، أو دوران إعلانات. **لا** `destination` على `ad_images` بعد.

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-ads-generic-destinations-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

## Rollback
`02-ads-generic-destinations-rollback.sql` — exact one-shot (DROP constraint + DROP 3 columns). لا يُفقد أي إعلان هاتفي (الأعمدة الجديدة تحمل قيمًا افتراضية فقط في هذه المرحلة).

## ✅ / 🛑 ما يُتوقَّع في 04-post-apply-verify.sql
- `ads_destination_type_valid` → `convalidated = t` (مفعّلة ومتحقَّق منها؛ كل الصفوف backfill إلى `'phone'`).
- كل صف: `destination_type='phone'` · `destination='{}'` · `title=''` — **صفر إعادة إدخال**.
- `ad_images` بنفس الصفوف قبل-التطبيق (multi-image carousel سليم)، والـ mirror trigger + RLS + RPCs كما هي.
- الـ probes (J1–J4) تعمل في معاملة تُلفّ back — لا شيء يُكتب في الإنتاج.

## Next steps
بعد نجاح PHASE 1 والتحقق، تُفصَل PHASE 2 (resolvers/adapters) بطلب مستقل — لا تُبدأ تلقائيًا.
